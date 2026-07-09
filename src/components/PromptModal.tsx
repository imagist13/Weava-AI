"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check, Wand2, Loader2, ArrowRight, Sparkles } from "lucide-react";
import { consumeSSEStream, type StreamToken } from "@/lib/streaming";
import type { ExcalidrawElementLike } from "@/components/ExcalidrawWrapper";

interface PromptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 用户框选的元素 ID 列表（真实的 Excalidraw 元素 id） */
  selectedIds: string[];
  /** 拿到画布上所有元素（供后端结构化提取）—— 用函数以避免每次 render 重建 */
  getAllElements: () => ExcalidrawElementLike[];
  /** 用户可见的选区文本预览（仅展示用） */
  selectionPreview: string;
  apiConfig: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    temperature?: number;
  };
  onCompiled?: (prompt: string) => void;
  preset: "agent-task" | "refine" | "explore";
}

const PRESET_META: Record<string, { label: string; description: string }> = {
  "agent-task": { label: "Coding Agent", description: "适合喂给 Claude / GPT 的结构化任务" },
  "refine":     { label: "精炼整理",   description: "去除冗余、统一措辞、保留核心" },
  "explore":    { label: "探索分析",   description: "生成多种方案对比，启发思考" },
};

export default function PromptModal({
  open,
  onOpenChange,
  selectedIds,
  getAllElements,
  selectionPreview,
  apiConfig,
  onCompiled,
  preset,
}: PromptModalProps) {
  const [prompt, setPrompt] = useState("");
  const [canvasDebug, setCanvasDebug] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) {
      setPrompt("");
      setCanvasDebug("");
      setError(null);
      setCopied(false);
    }
  }, [open]);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    return () => { controller.abort(); };
  }, []);

  const startCompile = useCallback(async () => {
    setIsStreaming(true);
    setError(null);
    setPrompt("");

    // 直接从画布拉真实元素，让后端 extract.ts 做结构化提取（节点 + 连接）
    const allElements = getAllElements();

    try {
      const response = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardId: "default",
          selectedIds,
          allElements,
          preset,
          config: apiConfig,
        }),
        signal: abortRef.current?.signal,
      });

      await consumeSSEStream(
        response,
        (token: StreamToken) => {
          if (token.type === "token" && typeof token.content === "string") {
            setPrompt((prev) => prev + token.content);
          } else if (token.type === "debug" && typeof token.canvasText === "string") {
            setCanvasDebug(token.canvasText);
          } else if (token.type === "error") {
            setError(token.error ?? "unknown error");
          }
        },
        (err) => setError(err.message)
      );
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "请求失败");
    } finally {
      setIsStreaming(false);
    }
  }, [selectedIds, getAllElements, apiConfig, preset]);

  const handleCopy = useCallback(async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }, [prompt]);

  const handleRefine = useCallback(() => {
    if (!prompt) return;
    onCompiled?.(prompt);
    onOpenChange(false);
  }, [prompt, onCompiled, onOpenChange]);

  const meta = PRESET_META[preset];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-w-2xl flex-col gap-0 overflow-hidden rounded-lg p-0">

        {/* ── Header ─────────────────────────────────────── */}
        <div className="flex items-start gap-3 border-b border-neutral-100 px-5 py-4">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-indigo-50">
            <Wand2 className="size-3.5 text-indigo-500" />
          </div>
          <div className="flex-1">
            <DialogTitle className="text-[14px] font-semibold text-neutral-900">
              Compile prompt
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-[12px] text-neutral-500">
              <span className="font-medium text-neutral-700">{meta.label}</span>
              <span className="mx-1.5 text-neutral-300">·</span>
              {meta.description}
            </DialogDescription>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────── */}
        <div className="flex flex-col gap-3 px-5 py-4">

          {/* Source */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-neutral-400">
                Source · 已选 {selectedIds.length} 个元素
              </p>
              {canvasDebug && (
                <button
                  onClick={() => setShowDebug((v) => !v)}
                  className="text-[10.5px] text-neutral-400 underline-offset-2 hover:text-indigo-500 hover:underline"
                >
                  {showDebug ? "隐藏 AI 输入" : "查看 AI 输入"}
                </button>
              )}
            </div>
            <div className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded-md border border-neutral-100 bg-neutral-25 px-3 py-2 font-mono text-[11.5px] leading-[1.6] text-neutral-600">
              {selectionPreview || <span className="text-neutral-400">（选区为空）</span>}
            </div>
            {showDebug && canvasDebug && (
              <div className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-indigo-100 bg-indigo-50/40 px-3 py-2 font-mono text-[11px] leading-[1.6] text-indigo-900">
                {canvasDebug}
              </div>
            )}
          </div>

          {/* Output */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-neutral-400">
                Output
              </p>
              {isStreaming && (
                <span className="flex items-center gap-1.5 text-[11px] text-indigo-500">
                  <span className="size-1.5 rounded-full bg-indigo-500 animate-pulse-dot" />
                  生成中
                </span>
              )}
            </div>
            <div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
              {error ? (
                <p className="px-3 py-3 text-[12.5px] text-rose-500">{error}</p>
              ) : prompt ? (
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={10}
                  disabled={isStreaming}
                  className="block w-full resize-y border-0 px-3 py-3 font-mono text-[12.5px] leading-[1.6] text-neutral-800 outline-none disabled:opacity-60"
                />
              ) : (
                <div className="flex h-24 items-center px-3 text-[12px] text-neutral-400">
                  {isStreaming ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="size-3 animate-spin" />
                      正在调用 AI...
                    </span>
                  ) : (
                    <span>点击「开始生成」编译提示词</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────── */}
        <DialogFooter className="flex items-center gap-2 border-t border-neutral-100 px-5 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-neutral-500 hover:text-neutral-700"
          >
            关闭
          </Button>

          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={!prompt}
              className="gap-1.5 border-neutral-200 hover:bg-neutral-50"
            >
              {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
              {copied ? "已复制" : "复制"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={startCompile}
              disabled={isStreaming || selectedIds.length === 0}
              className="gap-1.5 border-neutral-200 hover:border-indigo-200 hover:bg-indigo-50/40 hover:text-indigo-600"
            >
              {isStreaming ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Sparkles className="size-3" />
              )}
              开始生成
            </Button>

            <Button
              size="sm"
              onClick={handleRefine}
              disabled={!prompt}
              className="gap-1.5 bg-neutral-900 text-white hover:bg-neutral-800"
            >
              在 Agent 调优
              <ArrowRight className="size-3" />
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
