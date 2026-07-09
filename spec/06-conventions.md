# 06 · 项目编码约定

## 一、命名

| 类别 | 约定 | 示例 |
|---|---|---|
| React 组件文件 | PascalCase + `.tsx` | `SelectionToolbar.tsx` |
| 工具/库文件 | kebab-case + `.ts` | `board-switcher.ts`（避免）`repo.ts` |
| Hooks | `useXxx.ts` | `useBoardList.ts` |
| 类型文件 | `types.ts` 聚合 | `src/lib/boards/types.ts` |
| 路由文件 | Next.js 默认 `route.ts` / `page.tsx` | — |
| 数据库表名 | 复数 snake_case | `boards`、`connector_cache` |
| 数据库列名 | snake_case | `snapshot_json`、`created_at` |
| TS 变量 | camelCase | `currentPrompt` |
| TS 类型/接口 | PascalCase | `BoardRow` |
| 私有函数（文件内） | `function xxx` 不导出，**不加下划线前缀** | — |
| 常量（模块级不可变） | UPPER_SNAKE | `SYSTEM_PROMPT` |
| React props handler | `onXxx` | `onSnapshotChange` |
| 事件回调 | `handleXxx`（组件内） / `onXxx`（props） | `handleCompile()` |

## 二、导入顺序（保持一致）

```ts
// 1. React/Next 核心
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

// 2. 第三方库
import { z } from "zod";
import { nanoid } from "nanoid";

// 3. 本地绝对路径（@/ 别名）
import { Button } from "@/components/ui/button";
import { loadAIConfig } from "@/lib/ai-config";

// 4. 同目录相对路径
import { ExampleCard } from "./ExampleCard";

// 5. 样式
import "./canvas.css";
```

## 三、错误处理

- **API route**：用 `try/catch` 包 try，`return new Response(JSON.stringify({ error: ... }), { status, headers })`
- **客户端 fetch**：`if (!response.ok)` 走 `await response.json().error`；其它走 `catch (err)` 显示 toString
- **数据库**：`db.prepare(...).get()` 返回 `undefined` 用 `?.`，不要 `!` 强制断言

## 四、CSS / UI

- 用 Tailwind 4 原子类
- 复用 `@/components/ui/*` 现有原语 (Button/Dialog/Sheet/Tooltip)
- 新建组件时遵循 `components.json` 的 shadcn 风格
- 颜色全走 CSS 变量（`text-foreground`、`bg-muted`），避免裸 `bg-white`
- 不写 `style={{ ... }}` 内联，除非必要（如动态尺寸）

## 五、提交规范（建议）

格式：`<模块>(<范围>): <一句话动词> <对象>`

例：
- `feat(canvas): add multi-board CRUD API`
- `feat(compile): implement selection extraction with reading order`
- `fix(agent): persist history by boardId`
- `chore(deps): bump drizzle to 0.36`
- `docs(spec): add 02-compile-core`

## 六、注释原则

**不**用注释复述代码。**仅**在以下情况下写：

1. 解释 **Why** 而非 What（为什么不选另一种）
2. 引用外部规范/工单的链接
3. 提醒后续维护者的坑（如 TODO）

```ts
// ✅ 解释 why
// 走 snapshot 单字段 PATCH，避免覆盖 name（用户在自动保存中也在改 name）
fetch(`/api/boards/${id}/snapshot`, { ... });

// ❌ 复述代码
// 创建一个状态
const [isLoading, setIsLoading] = useState(false);
```

## 七、日志

- 开发：`console.error` 必要时加 `parseError`、`requestBody` 摘要
- 上线：通过 `error.tsx` 全局捕获，禁止 `console.log` 灰度

## 八、文件长度

- 单文件 < 500 行（含样式）；超过则拆
- 单函数 < 80 行；超过则拆 helper

## 九、测试

- 当前项目无测试；新增 lib 函数建议至少含 1 个 `*.test.ts`（后续模块 3/5 引入 vitest 时一并补齐）

## 十、依赖管理

- 新增 runtime dep：先 `npm install <pkg>`，再 `package.json` 中固定主版本
- 新增 dev dep：drizzle-kit、vitest 等放 devDependencies
- 不引入重复实现的 lib（如同时有 lodash 与 native `Array.prototype`）
