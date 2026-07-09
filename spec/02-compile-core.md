# 02 · 模块 2：框选提取 + Compile 核心流程

## 目标

在 Excalidraw 画布上框选元素 → 提取文本内容（按阅读顺序）→ 调用 LLM → 流式返回一段**适合 Coding Agent 直接消费**的提示词。

## 不做什么

- ❌ 不依赖 Connector 注入（模块 3 留接口）
- ❌ 不改 Excalidraw 0.18 库本体
- ❌ 不持久化编译历史（仅前端内存 + 当前提示词）

## 数据流

```
用户框选 ──► ExcalidrawAPI.getSelectedElementsIfAny()
           │
           ▼
src/lib/canvas/extract.ts   → SelectionTextItem[]
           │
           ▼
src/lib/canvas/sort.ts      → 排序后的纯文本（含 @connector 提及提取）
           │
           ▼
src/lib/compile/template.ts → { system, user } messages
           │
           ▼
POST /api/compile           → SSE stream
           │
           ▼
PromptModal 流式展示  ──► [复制] / [在 Agent 中调优]
```

## 内部 API

### `SelectionTextItem`

```ts
type SelectionTextItem = {
  id: string;
  type: "text" | "shape-with-text" | "shape-only" | "connector";
  raw: string;             // 原始可见文本
  order: number;           // 阅读顺序，0..N-1
  mentions: Mention[];     // 提取出来的 @-mention
};

type Mention = {
  raw: string;             // 完整文本，如 "@context7:next.js"
  tool: string;            // "context7"
  query: string;           // "next.js"（去除首尾空格）
  index: number;           // 在 raw 中的字符索引
};
```

### `extractSelectionText(elements): SelectionTextItem[]`

规则：
1. `type === "text"` 直接取 `text`
2. `type in {rectangle, ellipse, diamond, ...}` 且 `boundElements?.containerId` 关联文本 → 取关联文本
3. `type === "arrow" | "line"`，检查 `label.text`
4. 不在前面的元素：跳过（除非提供"包括 shape-only"开关，默认关）

### `sortByReadingOrder(items): SelectionTextItem[]`

启发式（左上→右下，Z 序倒置）：
1. 主轴：`y`（按行容差 ±30px 归为同组）
2. 次轴：同组按 `x` 升序
3. 同位置：zIndex 倒序（最新元素在前）

### `compileMentions(items): { mentions: Mention[]; cleanedRaw: string }`

```ts
const MENTION_REGEX = /@([a-zA-Z][\w-]*)(?::([^\s@]+))?/g;
```

例：用户文本 "用 @context7:next.js 检查 App Router"
提取出：`{ tool: "context7", query: "next.js" }`

模块 2 不会展开 connector 内容，但会**原样保留** `@xxx` 文本（让模块 3 的 LLM 看见）。

### `buildCompilePrompt(opts)`

```ts
function buildCompilePrompt(opts: {
  selectionText: string;          // 已经按阅读顺序拼好的多行文本
  boardId: string;
  preset?: "agent-task" | "refine" | "explore";
}): {
  system: string;                 // SYSTEM_PROMPT
  user: string;                   // 包含选区文本 + 元信息
}
```

提示词要点：
- 明确告诉 LLM 输出是给 **Coding Agent** 的提示词
- 提示它"保留/翻译" `@context7:xxx` 类提及，不要丢失
- 指定 Markdown 风格（标题 + 代码块）

## HTTP 接口：`POST /api/compile`

### Request

```jsonc
{
  "boardId": "b_abc123",
  "selection": [
    { "id": "el1", "type": "rectangle", "x": 100, "y": 100, "width": 200, "height": 80, "text": "认证模块" }
  ],
  "preset": "agent-task",
  "config": {
    "provider": "openai",
    "apiKey": "sk-...",
    "baseUrl": "https://api.openai.com/v1",
    "model": "gpt-4o-mini",
    "temperature": 0.4
  }
}
```

### Response

SSE（`text/event-stream`），每帧：

```
data: {"type":"token","content":"现在"}

data: {"type":"token","content":"需要"}

data: {"type":"done","promptLength":1234}
```

错误：
```
data: {"type":"error","error":"API key 缺失"}
```

## 前端组件

### `<SelectionToolbar />`

- 仅当 `selectedElements.length >= 1` 时浮现在画布右上角
- 内容：`[📋 Compile (N)] [✕ 关闭]`
- 点击 Compile → 弹出 `<PromptModal />`
- 动画：opacity+translate-y 入场

### `<PromptModal />`

```
┌─────────────────────────────────────────────────┐
│  编译提示词  ·  Board: 认证模块                  │
├─────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────┐ │
│  │ 现在需要在 Next.js 中实现                    │ │
│  │ 全栈认证方案，重点考虑 @context7:nextjs ...  │ │
│  │ (流式追加中)                                 │ │
│  └─────────────────────────────────────────────┘ │
│  模型: gpt-4o-mini · 1,234 字 · 12s             │
├─────────────────────────────────────────────────┤
│  [📋 复制]  [✨ 在 Agent 中调优]  [关闭]          │
└─────────────────────────────────────────────────┘
```

行为：
- SSE 接收 → 实时追加
- 复制 → 写剪贴板 + 2s 状态回弹
- "在 Agent 中调优" → 关闭 Modal，把 prompt 推入右侧 AgentPanel

## 关键决策

1. **Reading Order 用启发式而非贝塞尔曲线**：画布是白板，多数情况下行+列序足够准确
2. **保留 `@mentions` 文本原样**：模块 2 不解析 connector，对 LLM 的输入保持透明，模块 3 接管注入
3. **SSE 而非 JSON**：与现有 `/api/chat` 保持一致；客户端 EventSource 解析代码统一抽到 `src/lib/streaming.ts`
4. **不持久化选区**：刷新后选中态自然丢失

## 验收

- [ ] 在画布上拖框选中两个文本 + 一个矩形 → 工具栏出现 "Compile (3)"
- [ ] 点击 Compile → Modal 弹出并流式展示结果
- [ ] 选中内容包含 `@context7:xxx` → 提示词中可见该 token
- [ ] 复制按钮可见反馈
- [ ] "在 Agent 中调优" 可正常跳转（即使模块 4 未实现，至少不报错：）
