// SSE 流式响应解析工具（compile 与 agent 共享）
// 解析 text/event-stream 中每帧的 data: {...} JSON

// ============================================================
// 类型定义
// ============================================================

export interface StreamToken {
  type:
    | "token"    // 文本 token（旧版兼容）
    | "text"     // 文本片段
    | "done"     // 流结束
    | "error"    // 错误
    | "debug"    // 调试信息
    | "tool_call"    // 工具调用开始
    | "tool_result"  // 工具执行结果
    | "final";       // 最终状态
  content?: string;
  delta?: string;
  /** 工具名称 */
  toolName?: string;
  /** 工具参数 */
  toolArgs?: unknown;
  /** 工具调用 ID */
  callId?: string;
  /** 工具执行结果 */
  result?: string;
  /** 工具是否执行成功 */
  success?: boolean;
  /** 工具执行后更新的提示词 */
  updatedPrompt?: string;
  error?: string;
  /** 编译完成后总字符数 */
  promptLength?: number;
  /** debug 帧：结构化的画布描述文本，用于前端诊断 */
  canvasText?: string;
  /** debug 帧：诊断信息 */
  diagnostic?: {
    totalElements: number;
    augmentedElements: number;
    addedArrows: number;
    orphanArrows: number;
  };
  /** final 帧：包含最终状态 */
  currentPrompt?: string;
}

// ============================================================
// 消费者函数
// ============================================================

/**
 * 消费 fetch Response.body，将 SSE 帧转换为 StreamToken 数组。
 * 最后一个 token.type === "done" 标记流结束。
 */
export async function consumeSSEStream(
  response: Response,
  onToken: (token: StreamToken) => void,
  onError: (err: Error) => void
): Promise<void> {
  if (!response.ok) {
    try {
      const body = await response.json();
      onError(new Error(body.error ?? `HTTP ${response.status}`));
    } catch {
      onError(new Error(`HTTP ${response.status}`));
    }
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    onError(new Error("no response body"));
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data: ")) continue;

        try {
          const payload = JSON.parse(line.slice(6));
          onToken(payload as StreamToken);
        } catch {
          // 忽略解析失败的帧
        }
      }
    }
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

/**
 * 工具调用处理结果
 */
export interface ToolCallResult {
  name: string;
  arguments: unknown;
  result: string;
  success: boolean;
  updatedPrompt?: string;
  callId?: string;
}

/**
 * 解析 SSE 流，返回工具调用和最终提示词
 */
export async function consumeSSEWithTools(
  response: Response,
  onToken: (token: StreamToken) => void,
  onError: (err: Error) => void
): Promise<{
  toolCalls: ToolCallResult[];
  finalPrompt: string;
}> {
  const toolCalls: ToolCallResult[] = [];
  let finalPrompt = "";
  let currentPrompt = "";

  await consumeSSEStream(response, (token) => {
    onToken(token);

    if (token.type === "tool_result" && token.toolName) {
      toolCalls.push({
        name: token.toolName,
        arguments: token.toolArgs,
        result: token.result || "",
        success: token.success ?? false,
        updatedPrompt: token.updatedPrompt,
        callId: token.callId,
      });
      if (token.updatedPrompt) {
        currentPrompt = token.updatedPrompt;
      }
    }

    if (token.type === "final") {
      finalPrompt = token.currentPrompt || currentPrompt;
    }

    if (token.type === "done") {
      finalPrompt = currentPrompt;
    }
  }, onError);

  return { toolCalls, finalPrompt };
}
