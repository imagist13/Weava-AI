# WeaveAI ✨

> **Thinking canvas, woven by AI.**
> 画布即想法，AI 即织手。WeaveAI 把你在 Excalidraw 上随手画的草图，编译成可直接喂给 Claude Code / Cursor / Cline 等下游 Agent 的结构化提示词。

English | [简体中文](./README_zh-CN.md)

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![Next.js](https://img.shields.io/badge/Next.js-16.1-black)
![React](https://img.shields.io/badge/React-19-blue)
![Tailwind](https://img.shields.io/badge/Tailwind-4.0-38bdf8)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Self-hosted](https://img.shields.io/badge/Docker-ready-2496ed)

---

## 它是什么？

WeaveAI 是一个 **AI 增强的思考画布**。你不需要先写一长串提示词——
**先用 Excalidraw 随手画几张图、几个箭头、几段注释**，然后让 AI 帮你把这些零散元素编织成：

- ✅ 一段**结构化、可执行**的提示词（Prompt）
- ✅ 可直接塞进 Claude Code / Cursor 的 **Agent 输入框**
- ✅ 你可以在右侧 **Agent 面板** 里继续对话：让它精简、转 Checklist、翻译、补充上下文

画图 → 编译 → 调优 → 复制到下游 Agent。一条龙。

---

## ✨ Features

### 🧠 核心能力

| 模块 | 描述 |
|---|---|
| 🎨 **无限画布** | 基于 Excalidraw 0.18，手绘风格、零学习成本 |
| ⚙️ **Compile** | 框选元素 → AI 一键编译为结构化 prompt（**含自动补全孤立箭头**） |
| 🤖 **Agent 调优** | 右侧抽屉式对话面板，**流式 SSE 输出**，支持多轮迭代 |
| 💾 **多画布管理** | 命名画布，自动持久化（SQLite + HTTP CRUD），随时切换 |
| 📋 **Prompt 版本控制** | 当前 prompt 复制、字数统计、按画布保存的对话历史 |

### 🔌 模型 & Provider

统一通过 **OpenAI 兼容网关**接入，**在 UI 中可即时切换**：

- 🌐 **词元跳动 (TokenDance)** — 默认网关，支持 `deepseek-v3.2`、`MiniMax-M2.5`
- ✏️ 自定义 Base URL — 任何兼容 OpenAI ChatCompletion 的服务（Moonshot / 智谱 / Ollama / 自部署均可）

### 🔒 Privacy & Storage

- 🔐 **API Key** 仅存浏览器 `localStorage`，**永远不上传服务器**
- 💾 **画布数据** SQLite（`better-sqlite3`），服务端持久化；通过 `/api/boards` RESTful CRUD
- 🗂️ **对话历史** 按 `boardId` 隔离，存 `localStorage`

### ⚡ 技术栈

- **Next.js 16** App Router + **React 19** + **Tailwind CSS v4**
- **Vercel AI SDK** + OpenAI SDK
- **Drizzle ORM** + better-sqlite3
- **Radix UI** + Lucide Icons

---

## 📸 工作流

```
┌───────────────────────────────────────────────────────────┐
│  1️⃣  画布区 (左 70%)                                       │
│      在 Excalidraw 上画架构图 / 流程图 / 思维导图            │
│      ──────────────────────────────────────────────────    │
│      框选你关心的元素 → 点右上「开始生成」                    │
│      ◀ SSE 流式渲染生成的 prompt                            │
│  2️⃣  Agent 抽屉 (右 30%, Linear 风滑出)                     │
│      • Current Prompt 卡片 (复制 + 字数)                   │
│      • 4 个快捷指令：精简 / Checklist / 追加上下文 / 翻译   │
│      • 多轮流式对话                                       │
│      • ⌘ + Enter 发送                                    │
└───────────────────────────────────────────────────────────┘
                          ↓ 复制最终 prompt
              ┌──────────────────────────────┐
              │  Claude Code / Cursor / Cline │
              └──────────────────────────────┘
```

---

## 🚀 Getting Started

### 环境要求

- **Node.js 18+**（推荐 20 LTS）
- pnpm（推荐）/ npm / yarn / bun 任选
- 一个兼容 OpenAI ChatCompletion 的 API 端点（默认预置 TokenDance）

### 本地开发

```bash
git clone https://github.com/your-username/weaveai.git
cd weaveai
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)，第一次会弹出 **配置引导**，填入你的 API Key + Base URL 即可。

### ⚙️ 配置 AI Provider

进入右上 **Settings** → **API Settings**：

| 字段 | 说明 | 示例 |
|---|---|---|
| **API Key** | 你的密钥 | `sk-xxx...` |
| **Base URL** | OpenAI 兼容端点 | `https://tokendance.space/gateway/v1` |
| **Model** | 模型名称 | `deepseek-v3.2` |
| **Temperature** | 创造性 | `0.7` |

> 切换 Provider 不需要重启，下一次请求立刻生效。

---

## 🛠️ 用法速览

1. **画**：在画布上画你的想法（任意形状、文字、箭头）
2. **编译**：框选 → 点 **开始生成** → 右侧抽屉自动滑出，显示编译后的 prompt
3. **调优**：在 Agent 面板输入进一步指令，例如：
   - "精简到 100 字"
   - "转成 Checklist 形式"
   - "追加 React 18 文档的参考资料"
4. **使用**：点 Copy 复制到 Claude Code / Cursor

---


部署后会得到：
- ✅ HTTPS 站点：`https://your-domain.com`
- ✅ 自动续期 SSL（certbot 守护进程）
- ✅ 数据持久化（docker volume）

---

## 📁 项目结构

```
src/
├── app/
│   ├── page.tsx                    # 主页面：画布 + Agent 抽屉
│   ├── legacy/page.tsx             # 旧版页面（备用）
│   └── api/
│       ├── boards/route.ts         # 画布 CRUD
│       └── agent/route.ts          # Agent 流式 SSE
├── components/
│   ├── ExcalidrawWrapper.tsx       # 画布封装（含保存/选择/Compile 触发）
│   ├── AgentPanel.tsx              # 右侧 Agent 抽屉
│   ├── PromptModal.tsx             # Compile 弹窗
│   └── SettingsPanel.tsx           # API 配置
├── lib/
│   ├── ai-config.ts                # AI 配置 + 兼容迁移
│   ├── streaming.ts                # SSE 解析
│   ├── agent/
│   │   ├── prompts.ts              # Agent 系统提示词
│   │   ├── tools.ts                # 工具调用（regenerate_prompt）
│   │   └── history.ts              # 对话历史持久化
│   ├── boards/                     # 画布 schema/repo
│   ├── canvas/                     # 元素提取/排序/工具
│   └── compile/template.ts         # Compile 模板
└── db/
    ├── client.ts                   # SQLite 连接
    └── schema.ts                   # Drizzle schema
```

---

## 🤝 贡献指南

欢迎 PR！提交前请：

```bash
npm run lint            # ESLint
npx tsc --noEmit        # TypeScript 类型检查
```

新增功能请尽量：
- 保持原有的 Linear / Cursor 风简约视觉
- 新增依赖需说明动机
- UI 类改动附截图

详见 `.github/PULL_REQUEST_TEMPLATE.md`。

---

## 📄 License

MIT — 详见 [LICENSE](./LICENSE)。

---

## 💡 设计哲学

> **画布即思考的脚手架，prompt 是思考的产物。**
>
> 很多人跟 AI 协作的最大瓶颈不是「模型不够聪明」，
> 而是「我不会写提示词」。WeaveAI 让你把**画图这种天然技能**用在 prompt 工程上——
> 画关系、画流程、画优先级——AI 帮你把视觉结构转写为文字结构。
>
> 一个好的提示词不需要从空白敲出来，从一张草图开始。
