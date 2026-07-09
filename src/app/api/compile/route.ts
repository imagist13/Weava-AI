import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { ExcalidrawElementLike } from "@/components/ExcalidrawWrapper";
import { extractSelectionText } from "@/lib/canvas/extract";
import { sortByReadingOrder } from "@/lib/canvas/sort";
import { compileSelection } from "@/lib/canvas/extract";
import { buildCompilePrompt } from "@/lib/compile/template";

export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  boardId: z.string(),
  selectedIds: z.array(z.string()),
  allElements: z.array(z.unknown()),
  preset: z.enum(["agent-task", "refine", "explore"]).default("agent-task"),
  config: z.object({
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    model: z.string().optional(),
    temperature: z.number().optional(),
  }),
});

function sseEvent(type: string, payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ type, ...payload })}\n\n`;
}

export async function POST(request: NextRequest) {
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

  const { boardId, selectedIds, allElements, preset, config } = parsed.data;

  const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
  const baseUrl = (config.baseUrl || "https://tokendance.space/gateway/v1").replace(/\/+$/, "");
  const model = config.model || "deepseek-v3.2";
  const temperature = config.temperature ?? 0.4;

  if (!apiKey) {
    return NextResponse.json({ error: "请先配置 API Key" }, { status: 400 });
  }

  // ★ 用户往往只框选形状而忽略了箭头。为了让 AI 看到"节点 + 关系"完整结构，
  //    自动把两端都在选区内的箭头/线条也补进来。
  const selectedSet = new Set(selectedIds.map(String));
  const augmentedIds: string[] = [...selectedIds];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const el of allElements as any[]) {
    if (!el) continue;
    if (el.type !== "arrow" && el.type !== "line") continue;
    const startId = el.startBinding?.elementId ? String(el.startBinding.elementId) : undefined;
    const endId = el.endBinding?.elementId ? String(el.endBinding.elementId) : undefined;
    if (startId && endId && selectedSet.has(startId) && selectedSet.has(endId)) {
      const arrowId = String(el.id);
      if (!selectedSet.has(arrowId)) {
        selectedSet.add(arrowId);
        augmentedIds.push(arrowId);
      }
    }
  }

  const items = extractSelectionText(augmentedIds, allElements as ExcalidrawElementLike[]);
  const sorted = sortByReadingOrder(items);
  const { plainText, mentions } = compileSelection(sorted);

  const { system, user } = buildCompilePrompt({
    boardId,
    selectionText: plainText,
    preset,
    mentions,
  });

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

        // ★ 先把结构化的画布描述以 debug 帧回传给前端，方便用户直观看到"AI 眼里的画布"
        safeSend(sseEvent("debug", { canvasText: plainText || "（选区为空）" }));

        const response = await client.chat.completions.create({
          model,
          temperature,
          stream: true,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        });

        let collected = "";
        for await (const chunk of response) {
          const delta = chunk.choices?.[0]?.delta?.content ?? "";
          if (delta) {
            collected += delta;
            safeSend(sseEvent("token", { content: delta }));
          }
        }
        safeSend(sseEvent("done", { promptLength: collected.length }));
        safeClose();
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        safeSend(sseEvent("error", { error: message }));
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
