/**
 * Agent 提示词构建
 */
import type { SelectionTextItem } from "@/lib/canvas/extract";
import type { CanvasDiagnostic } from "@/lib/canvas/utils";

export interface AgentContext {
  boardId: string;
  currentPrompt: string;
  /** 原始 selectionText（可能已包含结构化描述） */
  selectionText: string;
  /** 详细的元素列表（用于增强箭头描述） */
  selectionItems?: SelectionTextItem[];
  /** 画布诊断信息 */
  canvasDiagnostic?: CanvasDiagnostic;
  userInput: string;
}

export interface AgentTool {
  name: string;
  description: string;
  intent: string;
  parameters: Record<string, unknown>;
}

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: "regenerate_preset",
    description: "用新风格重新生成整段提示词",
    intent: "用户想用另一种语气/风格/结构重写整段提示词；常见指令关键词：'更面向 X'、'改成 Y 风格'、'用动词打头'、'换个结构'",
    parameters: {
      type: "object",
      properties: {
        style: {
          type: "string",
          enum: ["concise", "verbose", "structured", "opinionated"],
          description: "重写风格：concise(简洁) / verbose(详细) / structured(结构化) / opinionated(有观点)",
        },
        language: {
          type: "string",
          enum: ["zh", "en"],
          description: "输出语言",
        },
      },
      required: ["style"],
    },
  },
  {
    name: "apply_refine",
    description: "精炼/简化/规格化/清单化现有提示词",
    intent: "用户想对当前提示词做精炼/补全/清单化；常见指令关键词：'简化'、'精简'、'加 checklist'、'改成规格'、'更清晰'",
    parameters: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          enum: ["tighten", "concise", "spec", "checklist"],
          description: "精炼目标：tighten(收紧) / concise(简化) / spec(转规格) / checklist(转清单)",
        },
        focus: {
          type: "string",
          maxLength: 200,
          description: "可选：需要重点关注的方面",
        },
      },
      required: ["intent"],
    },
  },
  {
    name: "add_connector",
    description: "在提示词中插入工具查询占位符",
    intent: "用户想在提示词中插入 @tool:query 标记；常见指令关键词：'查一下 GitHub'、'用 Context7 看 React'、'参考 X 文档'",
    parameters: {
      type: "object",
      properties: {
        tool: {
          type: "string",
          minLength: 1,
          maxLength: 40,
          description: "Connector 名称，如 github / context7 / web-search",
        },
        query: {
          type: "string",
          minLength: 1,
          maxLength: 160,
          description: "要查询的关键词",
        },
        placeAt: {
          type: "string",
          enum: ["start", "end", "after-context"],
          description: "插入位置：start(开头) / end(末尾) / after-context(上下文之后)",
        },
      },
      required: ["tool", "query"],
    },
  },
];

/**
 * 构建系统提示词（包含工具定义）
 */
export function buildAgentSystemPrompt(): string {
  const toolsDescription = AGENT_TOOLS.map(
    (t) => `- \`${t.name}\`（${t.description}）：${t.intent}`
  ).join("\n");

  return `你是 WeaveAI 的提示词工程助手。

【你的角色】
用户在 Excalidraw 画布上框选了一组想法，并生成了"当前提示词"。你需要按照用户的指令，
**改写后输出整段提示词**（不是描述改动）。

【画布结构理解】
画布选区已结构化为【节点】和【连接关系】：
- 【节点】：形状/文字卡片，包含编号（如 N1、N2）和类型（如 rectangle、ellipse）
- 【连接关系】：箭头/线条，格式为 "N1 → N2" 或 "N1 → N2 · 标签文字"

**重要**：理解箭头关系是核心！形如 "N1 → N2" 的连接表示 N1 触发/流向/推导出 N2。
如果箭头有标签（如 "N1 → N2 · 验证"），标签表示连接的原因/方式。

【规则】
1. 默认输出与当前提示词同一语言（zh/en）。
2. 结构保持 Markdown（标题 + 列表 + 代码块）。
3. **保留 mention**：如果提示词中出现 [\`@tool:query\`] 等标记，原样保留。
4. 不要添加"以下是改写后的提示词"这种前缀；直接输出完整文本。
5. 如果用户使用了工具 call 之外的指令（如"更面向 TS 资深开发者"），也按改写文本处理。
6. **理解关系**：把 "N1 → N2" 理解为 "N1 触发/流向/推导出 N2"，不要孤立看待节点。

【可用工具】
${toolsDescription}

【工具使用时机】
- 当用户想要"换种风格/语气"时 → regenerate_preset
- 当用户想要"精炼/简化/规格化"时 → apply_refine
- 当用户想要"添加参考资料"时 → add_connector
- 当用户只输入普通指令时 → 直接输出改写后的提示词文本（不需要调用工具）`.trim();
}

/**
 * 构建增强的画布上下文描述
 */
export function buildEnhancedBoardContext(context: AgentContext): string {
  const lines: string[] = [];

  // 当前提示词
  lines.push("【当前提示词】");
  lines.push(context.currentPrompt || "（尚未编译）");

  // 画布选区（如果有详细元素信息则使用增强描述）
  lines.push("");
  lines.push("【画布选区结构】");

  if (context.canvasDiagnostic) {
    const diag = context.canvasDiagnostic;

    // 添加诊断提示
    if (diag.addedArrows.length > 0) {
      lines.push(`> 💡 已自动补全 ${diag.addedArrows.length} 条两端都在选区内的箭头`);
    }
    if (diag.orphanArrows > 0) {
      lines.push(`> ⚠️ 选区内有 ${diag.orphanArrows} 条孤立箭头（未连接到任何形状）`);
    }
  }

  // 如果有详细元素信息，生成更丰富的描述
  if (context.selectionItems && context.selectionItems.length > 0) {
    const items = context.selectionItems;
    const nodes = items.filter((i) => i.type !== "arrow");
    const edges = items.filter((i) => i.type === "arrow");

    if (nodes.length > 0) {
      lines.push("");
      lines.push("【节点】");
      nodes.forEach((n, idx) => {
        const shapeDesc = n.shape === "text" ? "文字" : n.shape;
        const text = n.raw || "（无文字）";
        const id = n.id.length > 8 ? n.id.slice(0, 8) + "…" : n.id;
        lines.push(`- [N${idx + 1} · ${shapeDesc} · id:${id}] ${text}`);
      });
    }

    if (edges.length > 0) {
      lines.push("");
      lines.push("【连接关系】");
      edges.forEach((e, idx) => {
        const from = e.startId
          ? nodes.find((n) => n.id === e.startId)
          : null;
        const to = e.endId ? nodes.find((n) => n.id === e.endId) : null;

        const fromLabel = from
          ? `N${nodes.indexOf(from) + 1}`
          : "(孤立起点)";
        const toLabel = to ? `N${nodes.indexOf(to) + 1}` : "(孤立终点)";
        const label = e.raw ? ` · "${e.raw}"` : "";

        if (e.startId && e.endId) {
          lines.push(`- ${fromLabel} → ${toLabel}${label}`);
        } else if (e.raw) {
          lines.push(`- ${fromLabel} → ${toLabel} (${e.raw})`);
        }
      });
    }
  } else if (context.selectionText) {
    // 回退到原始文本
    lines.push(context.selectionText);
  } else {
    lines.push("（无选区）");
  }

  return lines.join("\n");
}

/**
 * 注入 boardId & 当前提示词到 user 消息
 */
export function buildAgentMessages(args: {
  history: { role: "user" | "assistant" | "tool"; content: string }[];
  currentPrompt: string;
  selectionText: string;
  selectionItems?: SelectionTextItem[];
  canvasDiagnostic?: CanvasDiagnostic;
  userInput: string;
}) {
  const systemPrompt = buildAgentSystemPrompt();
  const boardContext = buildEnhancedBoardContext({
    boardId: "",
    currentPrompt: args.currentPrompt,
    selectionText: args.selectionText,
    selectionItems: args.selectionItems,
    canvasDiagnostic: args.canvasDiagnostic,
    userInput: args.userInput,
  });

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const m of args.history) {
    if (m.role === "tool") continue; // 跳过未实现的 tool 消息
    messages.push({ role: m.role, content: m.content });
  }

  // 拼接最近的 user 指令 + board 上下文
  messages.push({
    role: "user",
    content: boardContext + "\n\n" + args.userInput,
  });

  return messages;
}
