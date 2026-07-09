/**
 * Agent 工具定义
 * 支持 OpenAI Function Calling 格式
 */
import { z } from "zod";

// ============================================================
// Schema 定义
// ============================================================

export const RegeneratePresetInputSchema = z.object({
  style: z.enum(["concise", "verbose", "structured", "opinionated"]),
  language: z.enum(["zh", "en"]).default("zh"),
});

export const ApplyRefineInputSchema = z.object({
  intent: z.enum(["tighten", "concise", "spec", "checklist"]),
  focus: z.string().max(200).optional(),
});

export const AddConnectorInputSchema = z.object({
  tool: z.string().min(1).max(40),
  query: z.string().min(1).max(160),
  placeAt: z.enum(["start", "end", "after-context"]).default("end"),
});

export type RegeneratePresetInput = z.infer<typeof RegeneratePresetInputSchema>;
export type ApplyRefineInput = z.infer<typeof ApplyRefineInputSchema>;
export type AddConnectorInput = z.infer<typeof AddConnectorInputSchema>;

// ============================================================
// 工具意图描述（用于提示模型何时调用）
// ============================================================

export const AGENT_TOOL_INTENTS = {
  regenerate_preset:
    "用户想用另一种语气/风格/结构重写整段提示词；常见指令关键词：'更面向 X'、'改成 Y 风格'、'用动词打头'、'换个结构'",
  apply_refine:
    "用户想对当前提示词做精炼/补全/清单化；常见指令关键词：'简化'、'精简'、'加 checklist'、'改成规格'、'更清晰'",
  add_connector:
    "用户想在提示词中插入 @tool:query 标记；常见指令关键词：'查一下 GitHub'、'用 Context7 看 React'、'参考 X 文档'",
};

// ============================================================
// 工具元数据（用于工具注册）
// ============================================================

export interface ToolDefinition {
  name: string;
  description: string;
  intent: string;
  schema: z.ZodType<unknown>;
  /** 从 LLM 返回的原始 arguments */
  execute: (args: unknown, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  /** 当前提示词（可能被工具修改） */
  currentPrompt: string;
  /** 回调：更新当前提示词 */
  updatePrompt?: (newPrompt: string) => void;
}

export interface ToolResult {
  success: boolean;
  message: string;
  /** 更新后的提示词（如果工具修改了它） */
  updatedPrompt?: string;
}

// ============================================================
// OpenAI Function Calling 格式转换
// ============================================================

/**
 * 将工具定义转换为 OpenAI Function Calling 格式
 */
export function toOpenAIFunction(tool: ToolDefinition) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  // 从 schema 中提取 properties
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shape = (tool.schema as any)._def;
  if (shape?.typeName === "ZodObject") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shapeObj = shape.shape() as Record<string, any>;
    for (const [key, value] of Object.entries(shapeObj)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const field = (value as any)._def;
      properties[key] = {
        type: mapZodTypeToJsonSchema(field),
        description: field?.description || "",
      };
      if (!field?.isOptional && !field?.hasDefault) {
        required.push(key);
      }
    }
  }

  return {
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description + "\n\n触发条件：" + tool.intent,
      parameters: {
        type: "object",
        properties,
        required,
        additionalProperties: false,
      },
    },
  };
}

/** 将 Zod 类型映射为 JSON Schema 类型 */
function mapZodTypeToJsonSchema(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  field: any
): string {
  const typeName = field?.typeName;
  switch (typeName) {
    case "ZodString":
      return "string";
    case "ZodNumber":
      return "number";
    case "ZodBoolean":
      return "boolean";
    case "ZodArray":
      return "array";
    case "ZodEnum":
      return "string";
    default:
      return "string";
  }
}

/**
 * 获取所有工具的 OpenAI Function Calling 格式
 */
export function getAgentToolsOpenAI() {
  return AGENT_TOOLS.map(toOpenAIFunction);
}

// ============================================================
// 工具执行器
// ============================================================

/**
 * 执行工具调用
 */
export async function executeTool(
  toolName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawArgs: any,
  context: ToolContext
): Promise<ToolResult> {
  const tool = AGENT_TOOLS_MAP[toolName];
  if (!tool) {
    return { success: false, message: `未知工具: ${toolName}` };
  }

  // 验证参数
  const parsed = tool.schema.safeParse(rawArgs);
  if (!parsed.success) {
    return {
      success: false,
      message: `参数验证失败: ${parsed.error.message}`,
    };
  }

  try {
    return await tool.execute(parsed.data, context);
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================
// 工具实现
// ============================================================

function buildPromptModifier(
  currentPrompt: string,
  modifier: (prompt: string) => string
): ToolResult {
  const updatedPrompt = modifier(currentPrompt);
  return {
    success: true,
    message: "提示词已更新",
    updatedPrompt,
  };
}

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: "regenerate_preset",
    description: "用新风格重新生成整段提示词",
    intent: AGENT_TOOL_INTENTS.regenerate_preset,
    schema: RegeneratePresetInputSchema,
    execute: async (args, context) => {
      const { style, language } = args as RegeneratePresetInput;

      const styleDescriptions: Record<string, string> = {
        concise: "简洁明了，去除冗余",
        verbose: "详细展开，增加说明",
        structured: "结构化输出，层次分明",
        opinionated: "有观点有态度，明确建议",
      };

      const styleDesc = styleDescriptions[style] || style;
      const langHint = language === "zh" ? "使用中文" : "Use English";

      // 生成提示词前缀说明
      const prefix = `【提示词已按 ${style} 风格重写，${styleDesc}，${langHint}】\n\n`;

      // 如果当前有提示词，基于它重写
      if (context.currentPrompt) {
        return buildPromptModifier(context.currentPrompt, (p) => prefix + p);
      }

      return {
        success: true,
        message: "请先编译画布选区生成提示词",
      };
    },
  },
  {
    name: "apply_refine",
    description: "精炼/简化/规格化/清单化现有提示词",
    intent: AGENT_TOOL_INTENTS.apply_refine,
    schema: ApplyRefineInputSchema,
    execute: async (args, context) => {
      const { intent, focus } = args as ApplyRefineInput;

      if (!context.currentPrompt) {
        return {
          success: false,
          message: "当前没有提示词可精炼，请先编译画布选区",
        };
      }

      const intentDescriptions: Record<string, string> = {
        tighten: "收紧论点，去除废话",
        concise: "简化表达，更直接",
        spec: "转成规格说明格式",
        checklist: "转成 checklist 清单",
      };

      const desc = intentDescriptions[intent] || intent;
      const focusHint = focus ? `，重点关注：${focus}` : "";

      return buildPromptModifier(context.currentPrompt, (p) => {
        return `【提示词已精炼：${desc}${focusHint}】\n\n${p}`;
      });
    },
  },
  {
    name: "add_connector",
    description: "在提示词中插入工具查询占位符",
    intent: AGENT_TOOL_INTENTS.add_connector,
    schema: AddConnectorInputSchema,
    execute: async (args, context) => {
      const { tool, query, placeAt } = args as AddConnectorInput;

      const connectorMark = `[\`@${tool}:${query}\`]`;
      let newPrompt = context.currentPrompt;

      if (!newPrompt) {
        return {
          success: true,
          message: `已添加 ${connectorMark}，请先生成提示词内容`,
          updatedPrompt: connectorMark,
        };
      }

      switch (placeAt) {
        case "start":
          newPrompt = connectorMark + "\n\n" + newPrompt;
          break;
        case "after-context":
          // 尝试找到第一个标题后插入
          const contextMatch = newPrompt.match(/^#+\s+.+$/m);
          if (contextMatch) {
            const idx = newPrompt.indexOf(contextMatch[0]) + contextMatch[0].length;
            newPrompt = newPrompt.slice(0, idx) + "\n\n" + connectorMark + newPrompt.slice(idx);
          } else {
            newPrompt += "\n\n" + connectorMark;
          }
          break;
        case "end":
        default:
          newPrompt += "\n\n" + connectorMark;
          break;
      }

      return {
        success: true,
        message: `已在 ${placeAt} 添加 ${connectorMark}`,
        updatedPrompt: newPrompt,
      };
    },
  },
];

// 工具名称到定义的映射
const AGENT_TOOLS_MAP: Record<string, ToolDefinition> = {};
for (const tool of AGENT_TOOLS) {
  AGENT_TOOLS_MAP[tool.name] = tool;
}
