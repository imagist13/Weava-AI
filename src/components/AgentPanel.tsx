"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Send,
  Loader2,
  Copy,
  Check,
  X,
  Trash2,
  X as CloseIcon,
  Settings,
  Sparkles,
  AlertCircle,
  Wand2,
  ListChecks,
  BookOpen,
  Languages,
  Shrink,
  ArrowDown,
} from "lucide-react";
import { consumeSSEStream, type StreamToken } from "@/lib/streaming";
import {
  loadHistory,
  saveHistory,
  clearHistory,
  type PersistedMessage,
} from "@/lib/agent/history";
import { AIConfig, isConfigValid } from "@/lib/ai-config";

interface AgentPanelProps {
  boardId: string;
  selectionText: string;
  initialPrompt?: string;
  aiConfig: AIConfig;
  onClose?: () => void;
  onOpenSettings?: () => void;
}

function newId() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * 通用快捷指令——覆盖 4 类典型场景：
 * 1. 改写风格（更精炼）
 * 2. 改写结构（转 checklist）
 * 3. 补充上下文（参考某个文档）
 * 4. 国际化（中英互译）
 */
const PRESET_QUICK_INSTRUCTIONS: Array<{
  label: string;
  desc: string;
  Icon: React.ComponentType<{ className?: string }>;
  tone: "indigo" | "emerald" | "amber" | "rose";
}> = [
  {
    label: "精简措辞",
    desc: "把当前提示词精简到更直接、更少废话",
    Icon: Shrink,
    tone: "indigo",
  },
  {
    label: "转 Checklist",
    desc: "改成可勾选的任务清单形式",
    Icon: ListChecks,
    tone: "emerald",
  },
  {
    label: "补充参考资料",
    desc: "在末尾追加 @context7:react 占位，便于运行时拉文档",
    Icon: BookOpen,
    tone: "amber",
  },
  {
    label: "翻译成英文",
    desc: "把当前提示词翻译为英文版本",
    Icon: Languages,
    tone: "rose",
  },
];

const TONE_CLASSES: Record<string, { bg: string; hoverBorder: string }> = {
  indigo: {
    bg: "bg-indigo-100 text-indigo-600",
    hoverBorder: "hover:border-indigo-300",
  },
  emerald: {
    bg: "bg-emerald-100 text-emerald-600",
    hoverBorder: "hover:border-emerald-300",
  },
  amber: {
    bg: "bg-amber-100 text-amber-600",
    hoverBorder: "hover:border-amber-300",
  },
  rose: {
    bg: "bg-rose-100 text-rose-600",
    hoverBorder: "hover:border-rose-300",
  },
};

export default function AgentPanel({
  boardId,
  selectionText,
  initialPrompt,
  aiConfig,
  onClose,
  onOpenSettings,
}: AgentPanelProps) {
  const [messages, setMessages] = useState<PersistedMessage[]>([]);
  const [currentPrompt, setCurrentPrompt] = useState(initialPrompt ?? "");
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnostic, setDiagnostic] = useState<{
    addedArrows: number;
    orphanArrows: number;
  } | null>(null);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const streamingAssistantIdRef = useRef<string | null>(null);
  const currentPromptRef = useRef(currentPrompt);

  useEffect(() => {
    currentPromptRef.current = currentPrompt;
  }, [currentPrompt]);

  useEffect(() => {
    setMessages(loadHistory(boardId));
  }, [boardId]);

  useEffect(() => {
    saveHistory(boardId, messages);
  }, [messages, boardId]);

  useEffect(() => {
    const handler = (event: Event) => {
      const ce = event as CustomEvent<string>;
      if (typeof ce.detail === "string") setCurrentPrompt(ce.detail);
    };
    if (typeof window !== "undefined") {
      window.addEventListener("weaveai:agent-initial-prompt", handler);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("weaveai:agent-initial-prompt", handler);
      }
    };
  }, []);

  // 滚动到底部 + 显示/隐藏"跳到底部"按钮
  useEffect(() => {
    if (containerRef.current) {
      const el = containerRef.current;
      const isAtBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      if (isAtBottom) {
        el.scrollTop = el.scrollHeight;
        setShowJumpToBottom(false);
      } else {
        setShowJumpToBottom(true);
      }
    }
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: "smooth",
      });
      setShowJumpToBottom(false);
    }
  }, []);

  const handleSend = useCallback(
    async (override?: string) => {
      const content = (override ?? input).trim();
      if (!content || streaming) return;

      setError(null);
      setDiagnostic(null);
      const userMsg: PersistedMessage = { id: newId(), role: "user", content, ts: Date.now() };
      const assistantId = newId();
      streamingAssistantIdRef.current = assistantId;
      const placeholderAssistant: PersistedMessage = { id: assistantId, role: "assistant", content: "", ts: Date.now() };

      setMessages((prev) => [...prev, userMsg, placeholderAssistant]);
      setInput("");
      setStreaming(true);

      try {
        const history = messages
          .concat(userMsg)
          .slice(-10)
          .map((m) => ({ role: m.role, content: m.content }));

        const response = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            boardId, history,
            currentPrompt: currentPromptRef.current,
            selectionText,
            userInput: content,
            config: aiConfig,
          }),
        });

        await consumeSSEStream(
          response,
          (token: StreamToken) => {
            switch (token.type) {
              case "text":
                if (typeof token.delta === "string") {
                  setMessages((prev) =>
                    prev.map((m) => m.id === assistantId ? { ...m, content: m.content + token.delta } : m)
                  );
                }
                break;

              case "debug":
                if (token.diagnostic) {
                  setDiagnostic({
                    addedArrows: token.diagnostic.addedArrows,
                    orphanArrows: token.diagnostic.orphanArrows,
                  });
                }
                break;

              case "tool_call":
                if (typeof token.toolName === "string") {
                  const argsStr = token.toolArgs ? JSON.stringify(token.toolArgs, null, 2) : "";
                  const toolMsg = `🔧 [${token.toolName}]\n${argsStr}`;

                  setMessages((prev) => {
                    const currentMsg = prev.find((m) => m.id === assistantId);
                    const hasContent = currentMsg && currentMsg.content.trim().length > 0;
                    const newContent = hasContent
                      ? currentMsg.content + (currentMsg.content ? "\n\n" : "") + toolMsg
                      : toolMsg;

                    return prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, content: newContent }
                        : m
                    );
                  });
                }
                break;

              case "tool_result":
                if (token.toolName) {
                  const successIcon = token.success ? "✅" : "❌";
                  const resultMsg = `${successIcon} ${token.result || "完成"}`;

                  setMessages((prev) => {
                    const currentMsg = prev.find((m) => m.id === assistantId);
                    const hasContent = currentMsg && currentMsg.content.trim().length > 0;
                    const newContent = !hasContent && token.updatedPrompt
                      ? token.updatedPrompt
                      : (currentMsg?.content || "") + "\n" + resultMsg;

                    return prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, content: newContent }
                        : m
                    );
                  });

                  if (token.updatedPrompt) {
                    setCurrentPrompt(token.updatedPrompt);
                  }
                }
                break;

              case "final":
                setMessages((prev) => {
                  const currentMsg = prev.find((m) => m.id === assistantId);
                  if (currentMsg && !currentMsg.content.trim() && token.currentPrompt) {
                    return prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, content: token.currentPrompt || "" }
                        : m
                    );
                  }
                  return prev;
                });
                if (token.currentPrompt) {
                  setCurrentPrompt(token.currentPrompt);
                }
                break;

              case "done":
                setMessages((prev) => {
                  const lastAssistant = [...prev].reverse().find((m) => m.role === "assistant" && m.id === assistantId);
                  if (lastAssistant && !lastAssistant.content.trim() && currentPromptRef.current) {
                    return prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, content: currentPromptRef.current }
                        : m
                    );
                  }
                  return prev;
                });
                break;

              case "error":
                setError(token.error ?? "未知错误");
                setMessages((prev) => prev.filter((m) => m.id !== assistantId));
                break;
            }
          },
          (err) => {
            setError(err.message);
            setMessages((prev) => prev.filter((m) => m.id !== assistantId));
          }
        );
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "请求失败");
      } finally {
        setStreaming(false);
        streamingAssistantIdRef.current = null;
      }
    },
    [input, messages, boardId, currentPrompt, selectionText, streaming, aiConfig]
  );

  const handleReset = useCallback(() => {
    setMessages([]);
    setDiagnostic(null);
    clearHistory(boardId);
  }, [boardId]);

  return (
    <div className="flex h-full flex-col bg-white">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-100 px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-md bg-[#5e6ad2]">
            <svg width="14" height="14" viewBox="0 0 11 11" fill="none">
              <circle cx="3" cy="3" r="1.1" fill="#fff" />
              <circle cx="8" cy="3" r="1.1" fill="#fff" />
              <circle cx="5.5" cy="8" r="1.1" fill="#fff" />
              <path d="M3 3 L8 3 L5.5 8 L3 3" stroke="#fff" strokeWidth="0.7" fill="none" strokeOpacity=".85" />
              <path d="M8 3 L3 3 L5.5 8 L8 3" stroke="#fff" strokeWidth="0.7" fill="none" strokeOpacity=".5" />
            </svg>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[14px] font-semibold text-neutral-900">WeaveAI</span>
            <span className="text-[11px] text-neutral-400">提示词调优</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!isConfigValid(aiConfig) && onOpenSettings && (
            <IconButton onClick={onOpenSettings} title="配置 API">
              <Settings className="size-4 text-amber-500" />
            </IconButton>
          )}
          <IconButton onClick={handleReset} title="清空对话">
            <Trash2 className="size-4" />
          </IconButton>
          {onClose && (
            <IconButton onClick={onClose} title="关闭面板">
              <CloseIcon className="size-4" />
            </IconButton>
          )}
        </div>
      </div>

      {/* ── Current Prompt Card ──────────────────────────────── */}
      <div className="border-b border-neutral-100 px-4 py-3.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-neutral-400">
            <Wand2 className="size-3" />
            Current Prompt
          </span>
          {currentPrompt && (
            <div className="flex items-center gap-0.5">
              <CopyButton text={currentPrompt} />
              <span className="ml-1 text-[10px] tabular-nums text-neutral-400">
                {currentPrompt.length} 字
              </span>
            </div>
          )}
        </div>
        <div className="min-h-[52px] rounded-md border border-neutral-100 bg-neutral-25 px-3 py-2.5">
          {currentPrompt ? (
            <p className="max-h-32 overflow-y-auto whitespace-pre-wrap font-mono text-[12px] leading-[1.65] text-neutral-700">
              {currentPrompt.length > 480 ? currentPrompt.slice(0, 480) + "…" : currentPrompt}
            </p>
          ) : (
            <p className="text-[12.5px] leading-[1.6] text-neutral-400">
              框选画布元素后点击 <kbd className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-neutral-600">Compile</kbd> 生成。
            </p>
          )}
        </div>
      </div>

      {/* ── Diagnostic Banner ──────────────────────────────── */}
      {diagnostic && (diagnostic.addedArrows > 0 || diagnostic.orphanArrows > 0) && (
        <div className="border-b border-amber-100 bg-amber-50/70 px-4 py-2">
          <div className="flex items-center gap-3 text-[11.5px]">
            {diagnostic.addedArrows > 0 && (
              <span className="flex items-center gap-1.5 text-amber-700">
                <Sparkles className="size-3.5" />
                已自动补全 {diagnostic.addedArrows} 条箭头
              </span>
            )}
            {diagnostic.orphanArrows > 0 && (
              <span className="flex items-center gap-1.5 text-amber-600">
                <AlertCircle className="size-3.5" />
                {diagnostic.orphanArrows} 条孤立箭头
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Messages ────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden">
        <div ref={containerRef} className="h-full overflow-y-auto px-4 py-4">
          {/* 未配置 API 的引导卡 */}
          {!isConfigValid(aiConfig) && onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="mb-3 flex w-full items-start gap-3 rounded-md border border-amber-200 bg-amber-50/70 px-3.5 py-3 text-left transition-colors hover:bg-amber-50"
            >
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded bg-amber-100">
                <Settings className="size-4 text-amber-600" />
              </span>
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-amber-900">尚未配置 AI</div>
                <div className="mt-0.5 text-[11.5px] text-amber-700">点击填入 API Key、Base URL 和模型即可开始对话</div>
              </div>
            </button>
          )}

          {messages.length === 0 ? (
            <div className="flex flex-col gap-2">
              <p className="mb-1 px-1 text-[11.5px] font-medium text-neutral-400">
                快捷操作
              </p>
              {PRESET_QUICK_INSTRUCTIONS.map((q) => {
                const Icon = q.Icon;
                const tone = TONE_CLASSES[q.tone];
                return (
                  <button
                    key={q.label}
                    onClick={() => handleSend(q.desc)}
                    disabled={streaming}
                    className={`group flex items-center gap-3 rounded-md border border-neutral-100 bg-white px-3.5 py-2.5 text-left transition-all hover:bg-neutral-25 disabled:pointer-events-none disabled:opacity-40 ${tone.hoverBorder}`}
                  >
                    <span className={`flex size-7 shrink-0 items-center justify-center rounded-md ${tone.bg}`}>
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-medium text-neutral-800">{q.label}</div>
                      <div className="mt-0.5 truncate text-[11.5px] text-neutral-500">{q.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              {messages.map((m) => <MessageBubble key={m.id} msg={m} streaming={streaming} />)}
            </div>
          )}

          {/* Error toast */}
          {error && (
            <div className="mt-3 flex items-start gap-2.5 rounded-md border border-rose-100 bg-rose-50 px-3.5 py-2.5 animate-fade-in">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-rose-500" />
              <span className="flex-1 text-[12px] text-rose-600">{error}</span>
              <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600">
                <X className="size-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* 跳到底部按钮 */}
        {showJumpToBottom && messages.length > 0 && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-3 right-3 flex size-8 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-500 shadow-sm transition-all hover:border-indigo-300 hover:text-indigo-600 hover:shadow"
            title="跳到底部"
          >
            <ArrowDown className="size-4" />
          </button>
        )}
      </div>

      {/* ── Input ──────────────────────────────────────────── */}
      <div className="border-t border-neutral-100 px-3.5 py-3">
        <div className="group flex items-end gap-2 rounded-lg border border-neutral-200 bg-neutral-25 p-2 transition-all focus-within:border-indigo-400 focus-within:bg-white focus-within:shadow-[var(--shadow-glow)]">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="输入指令…(⌘+Enter 发送)"
            rows={1}
            disabled={streaming}
            className="flex-1 resize-none bg-transparent px-2 py-1.5 font-mono text-[12.5px] leading-[1.5] text-neutral-800 placeholder:text-neutral-400 outline-none disabled:opacity-50"
            style={{ maxHeight: "140px" }}
          />
          <button
            onClick={() => handleSend()}
            disabled={streaming || !input.trim()}
            className="flex size-9 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-white transition-all hover:bg-neutral-800 disabled:pointer-events-none disabled:opacity-30"
            title="发送 (⌘+Enter)"
          >
            {streaming ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── MessageBubble ─────────────────────────────────────── */
function MessageBubble({ msg, streaming }: { msg: PersistedMessage; streaming: boolean }) {
  const isUser = msg.role === "user";
  return (
    <div className="animate-fade-in-up flex flex-col">
      <div className="mb-1.5 flex items-center gap-2">
        <span className={`size-1.5 rounded-full ${isUser ? "bg-indigo-500" : "bg-neutral-400"}`} />
        <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-neutral-400">
          {isUser ? "You" : "WeaveAI"}
        </span>
      </div>
      <div
        className={`rounded-md px-3.5 py-2.5 ${
          isUser
            ? "ml-6 rounded-tl-sm bg-indigo-50 border border-indigo-100"
            : "mr-6 rounded-tr-sm border border-neutral-100 bg-neutral-25"
        }`}
      >
        {isUser ? (
          <p className="font-mono text-[12.5px] leading-[1.65] text-neutral-800 whitespace-pre-wrap">
            {msg.content}
          </p>
        ) : msg.content ? (
          <div className="flex items-start gap-2">
            <pre className="flex-1 overflow-x-auto whitespace-pre-wrap font-mono text-[12.5px] leading-[1.65] text-neutral-700">
              {msg.content}
            </pre>
            <CopyButton text={msg.content} />
          </div>
        ) : streaming ? (
          <div className="flex items-center gap-1.5 text-[11.5px] text-neutral-400">
            <span className="flex gap-1">
              <span className="size-1.5 animate-pulse-dot rounded-full bg-neutral-300" style={{ animationDelay: "0ms" }} />
              <span className="size-1.5 animate-pulse-dot rounded-full bg-neutral-300" style={{ animationDelay: "150ms" }} />
              <span className="size-1.5 animate-pulse-dot rounded-full bg-neutral-300" style={{ animationDelay: "300ms" }} />
            </span>
            生成中
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ── IconButton — 加大尺寸到 36×36，符合 WCAG 触摸热区 ─────── */
function IconButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex size-9 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 active:bg-neutral-200"
    >
      {children}
    </button>
  );
}

/* ── CopyButton — 加大尺寸 ─────────────────────────────────── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch { /* ignore */ }
      }}
      className="flex size-7 shrink-0 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 active:bg-neutral-200"
      title="复制"
    >
      {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
    </button>
  );
}