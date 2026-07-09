import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { ExcalidrawElementLike } from "@/components/ExcalidrawWrapper";
import { extractSelectionText, compileSelection } from "@/lib/canvas/extract";
import { sortByReadingOrder } from "@/lib/canvas/sort";
import { augmentSelectionWithArrows, diagnoseCanvasSelection, buildEnhancedCanvasContext } from "@/lib/canvas/utils";
import { buildAgentMessages } from "@/lib/agent/prompts";
import { getAgentToolsOpenAI, executeTool, ToolContext } from "@/lib/agent/tools";

export const dynamic = "force-dynamic";

// ============================================================
// 请求 Schema
// ============================================================

const RequestSchema = z.object({
  boardId: z.string(),
  history: z.array(
    z.object({
      role: z.enum(["user", "assistant", "tool"]),
      content: z.string(),
    })
  ),
  currentPrompt: z.string().default(""),
  selectionText: z.string().default(""),
  /** 可选：完整的元素列表，用于增强箭头识别 */
  allElements: z.array(z.unknown()).optional(),
  userInput: z.string().min(1),
  config: z.object({
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    model: z.string().optional(),
    temperature: z.number().optional(),
  }),
});

// ============================================================
// SSE 工具
// ============================================================

function sse(type: string, payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ type, ...payload })}\n\n`;
}

// ============================================================
// 主处理函数
// ============================================================

export async function POST(request: NextRequest) {
  // 解析请求
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { boardId, history, currentPrompt, selectionText, allElements, userInput, config } =
    parsed.data;

  const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
  const baseUrl = (config.baseUrl || "https://tokendance.space/gateway/v1").replace(/\/+$/, "");
  const model = config.model || "deepseek-v3.2";
  const temperature = config.temperature ?? 0.5;

  if (!apiKey) {
    return NextResponse.json({ error: "请先配置 API Key" }, { status: 400 });
  }

  // ============================================================
  // 箭头识别与补全
  // ============================================================

  let selectionItems: ReturnType<typeof extractSelectionText> = [];
  let canvasDiagnostic: ReturnType<typeof diagnoseCanvasSelection> | undefined;
  let enhancedSelectionText = selectionText;

  if (allElements && allElements.length > 0) {
    // 尝试解析选中的 ID（从 selectionText 中提取）
    // 或者使用全部元素作为上下文
    const augmentedIds = augmentSelectionWithArrows(
      [], // 没有原始选中 ID，使用空数组让箭头自动被发现
      allElements as ExcalidrawElementLike[]
    );

    // 提取并处理元素
    selectionItems = extractSelectionText(augmentedIds, allElements as ExcalidrawElementLike[]);
    const sorted = sortByReadingOrder(selectionItems);
    const { plainText, mentions } = compileSelection(sorted);

    // 诊断信息
    canvasDiagnostic = diagnoseCanvasSelection(augmentedIds, allElements as ExcalidrawElementLike[]);

    // 使用增强的结构化描述
    enhancedSelectionText = buildEnhancedCanvasContext(sorted, canvasDiagnostic);

    console.log("[Agent] 箭头诊断:", {
      原始元素数: allElements.length,
      补全后元素数: augmentedIds.length,
      新增箭头: canvasDiagnostic.addedArrows.length,
      孤立箭头: canvasDiagnostic.orphanArrows,
    });
  }

  // ============================================================
  // 构建消息
  // ============================================================

  const messages = buildAgentMessages({
    history,
    currentPrompt,
    selectionText: enhancedSelectionText,
    selectionItems,
    canvasDiagnostic,
    userInput,
  });

  // ============================================================
  // 流式响应
  // ============================================================

  const encoder = new TextEncoder();
  let streamClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const safeSend = (chunk: string) => {
        if (streamClosed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          streamClosed = true;
        }
      };
      const safeClose = () => {
        if (streamClosed) return;
        streamClosed = true;
        try {
          controller.close();
        } catch {}
      };

      try {
        const client = new OpenAI({ apiKey, baseURL: baseUrl });

        // 发送诊断信息
        if (canvasDiagnostic) {
          safeSend(sse("debug", {
            canvasText: enhancedSelectionText,
            diagnostic: {
              totalElements: canvasDiagnostic.originalCount,
              augmentedElements: canvasDiagnostic.augmentedCount,
              addedArrows: canvasDiagnostic.addedArrows.length,
              orphanArrows: canvasDiagnostic.orphanArrows,
            },
          }));
        }

        // 获取 OpenAI 工具定义
        const tools = getAgentToolsOpenAI();

        const response = await client.chat.completions.create({
          model,
          temperature,
          stream: true,
          tools,
          tool_choice: "auto",
          messages,
        });

        // 工具调用上下文
        let currentPromptValue = currentPrompt;
        let pendingToolCalls: Map<number, { name: string; arguments: string }> = new Map();
        let emittedTools = new Set<string>();
        let bufferText = "";

        for await (const chunk of response) {
          const choice = chunk.choices?.[0];
          const delta = choice?.delta;

          // 文本 token
          const textDelta = delta?.content;
          if (textDelta) {
            bufferText += textDelta;
            safeSend(sse("text", { delta: textDelta }));
          }

          // 工具调用
          const tcs = delta?.tool_calls;
          if (Array.isArray(tcs) && tcs.length > 0) {
            for (const tc of tcs) {
              const index = tc.index ?? 0;
              // 兼容不同版本的 OpenAI SDK 类型
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const fnName = (tc as any).function?.name ?? (tc as any).name;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const fnArgs = (tc as any).function?.arguments ?? (tc as any).arguments ?? "";

              // 获取或创建工具调用对象
              let toolCall = pendingToolCalls.get(index);
              if (!toolCall) {
                toolCall = {
                  name: fnName || "",
                  arguments: "",
                };
                pendingToolCalls.set(index, toolCall);
              }

              // 累积参数
              if (fnName) {
                toolCall.name = fnName;
              }
              if (fnArgs) {
                toolCall.arguments += fnArgs;
              }

              // 检查参数是否完整（如果 arguments 以 } 结尾，认为可能完成）
              if (toolCall.arguments.endsWith("}")) {
                // 尝试解析参数
                try {
                  const args = JSON.parse(toolCall.arguments);
                  const toolName = toolCall.name;

                  if (toolName && !emittedTools.has(`${toolName}_${index}`)) {
                    emittedTools.add(`${toolName}_${index}`);

                    // 发送工具调用开始事件（包含完整参数）
                    safeSend(sse("tool_call", {
                      name: toolName,
                      arguments: args,
                      callId: `call_${index}`,
                    }));

                    // 执行工具
                    const toolContext: ToolContext = {
                      currentPrompt: currentPromptValue,
                      updatePrompt: (newPrompt) => {
                        currentPromptValue = newPrompt;
                      },
                    };

                    const result = await executeTool(toolName, args, toolContext);

                    // 发送工具执行结果
                    safeSend(sse("tool_result", {
                      name: toolName,
                      result: result.message,
                      success: result.success,
                      updatedPrompt: result.updatedPrompt,
                      callId: `call_${index}`,
                    }));

                    // 更新当前提示词
                    if (result.updatedPrompt) {
                      currentPromptValue = result.updatedPrompt;
                    }

                    // 从待处理列表移除
                    pendingToolCalls.delete(index);
                  }
                } catch {
                  // JSON 解析失败，可能还在传输中，继续累积
                }
              }
            }
          }

          // 处理流结束
          if (choice?.finish_reason === "stop") {
            // 发送最终状态
            safeSend(sse("final", {
              currentPrompt: currentPromptValue,
            }));
          }
        }

        safeSend(sse("done", {}));
        safeClose();
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        console.error("[Agent] 错误:", message);
        safeSend(sse("error", { error: message }));
        safeClose();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
