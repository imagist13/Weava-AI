"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { Loader2, Sparkles, PanelRight, Settings } from "lucide-react";
import type { ExcalidrawElementLike, ExcalidrawWrapperRef } from "@/components/ExcalidrawWrapper";
import SelectionToolbar from "@/components/SelectionToolbar";
import PromptModal from "@/components/PromptModal";
import AgentPanel from "@/components/AgentPanel";
import SettingsPanel from "@/components/SettingsPanel";
import { AIConfig, DEFAULT_AI_CONFIG, isConfigValid, loadAIConfig } from "@/lib/ai-config";

const ExcalidrawClient = dynamic(
  () => import("@/components/ExcalidrawWrapper"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center gap-2 bg-white">
        <Loader2 className="size-3.5 animate-spin text-indigo-500" />
        <span className="text-[13px] text-neutral-400">加载画布...</span>
      </div>
    ),
  }
);

type SaveStatus = "idle" | "saving" | "saved" | "error";

const AGENT_VISIBLE_KEY = "weaveai:agent-panel-visible";
// 单画布 MVP：所有内容直接保存到这个 localStorage key，永久生效。
const CANVAS_KEY = "weaveai:canvas";
// 固定 boardId，让 AgentPanel 等按 boardId 分片的历史逻辑继续工作
const CANVAS_BOARD_ID = "default";

function loadCanvas(): ExcalidrawElementLike[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CANVAS_KEY);
    console.log(`[WeaveAI][load] raw from localStorage:`, raw ? `${raw.length} chars` : "null", raw?.slice(0, 200));
    if (!raw) {
      console.log(`[WeaveAI][load] localStorage 为空 → 返回 []`);
      return [];
    }
    const parsed = JSON.parse(raw);
    const ok = Array.isArray(parsed);
    console.log(`[WeaveAI][load] parsed:`, ok ? `Array(${parsed.length})` : typeof parsed);
    return ok ? (parsed as ExcalidrawElementLike[]) : [];
  } catch (err) {
    console.error(`[WeaveAI][load] 解析失败:`, err);
    return [];
  }
}

function saveCanvas(elements: ExcalidrawElementLike[]): void {
  if (typeof window === "undefined") return;
  try {
    const str = JSON.stringify(elements);
    console.log(`[WeaveAI][save] 写入 ${elements.length} 个元素, ${str.length} chars`, str.slice(0, 200));
    localStorage.setItem(CANVAS_KEY, str);
    // 立即回读校验
    const verify = localStorage.getItem(CANVAS_KEY);
    console.log(`[WeaveAI][save] 回读校验:`, verify?.length === str.length ? "OK" : `MISMATCH (${verify?.length} vs ${str.length})`);
  } catch (err) {
    console.error("[WeaveAI][save] 保存画布失败:", err);
    throw err;
  }
}

export default function HomePage() {
  const [initialElements, setInitialElements] = useState<ExcalidrawElementLike[] | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  // 选区 & Compile
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedElements, setSelectedElements] = useState<ExcalidrawElementLike[]>([]);
  const [compileOpen, setCompileOpen] = useState(false);
  const [compiledPrompt, setCompiledPrompt] = useState("");

  // Agent 抽屉
  const [agentVisible, setAgentVisible] = useState(false);
  const [agentHover, setAgentHover] = useState(false);

  // AI 配置 + Settings 抽屉
  const [aiConfig, setAiConfig] = useState<AIConfig>(DEFAULT_AI_CONFIG);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAiConfig(loadAIConfig());
  }, []);

  const wrapperRef = useRef<ExcalidrawWrapperRef>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSerializedRef = useRef<string>("");
  const initialLoadedRef = useRef<boolean>(false);
  /**
   * ★ 关键 fix：Excalidraw 挂载时会立即触发一次 onChange([])（空场景），
   *    此时 initialElements 还没注入。如果任由这次事件走 debounce → 写 localStorage，
   *    就会把已保存的内容覆盖成 []。刷新后所有内容都丢失。
   *
   *    所以在 handleInitialApplied 被调用之前，所有 onSnapshotChange 都必须被丢弃。
   */
  const readyRef = useRef<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(AGENT_VISIBLE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored === "true") setAgentVisible(true);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(AGENT_VISIBLE_KEY, agentVisible ? "true" : "false");
    }
  }, [agentVisible]);

  // 一次性加载画布
  useEffect(() => {
    if (initialLoadedRef.current) return;
    initialLoadedRef.current = true;
    console.log(`[WeaveAI][init] 开始加载画布`);
    const elements = loadCanvas();
    console.log(`[WeaveAI][init] 加载完成, ${elements.length} 个元素`);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInitialElements(elements);
    lastSerializedRef.current = JSON.stringify(elements);
  }, []);

  // 页面卸载 / 关闭标签前，强制 flush 一次，避免 debounce 中的编辑丢失
  useEffect(() => {
    const handler = () => {
      console.log(`[WeaveAI][unload] pagehide/beforeunload 触发`);
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      // 从 wrapper 拿最新元素（比 lastElementsRef 更保险）
      const latest = wrapperRef.current?.getElements() ?? null;
      console.log(`[WeaveAI][unload] wrapper 中最新元素:`, latest?.length ?? "null");
      if (latest && latest.length > 0) {
        try { saveCanvas(latest); } catch { /* ignore */ }
      }
    };
    window.addEventListener("beforeunload", handler);
    window.addEventListener("pagehide", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
      window.removeEventListener("pagehide", handler);
    };
  }, []);

  const handleSnapshotChange = useCallback(
    (elements: ExcalidrawElementLike[]) => {
      console.log(`[WeaveAI][onChange] 收到 ${elements.length} 个元素, ready=${readyRef.current}`);
      // ★ 在 Excalidraw 完成 initialElements 注入之前，忽略所有 onChange 事件。
      //    否则挂载瞬间的空场景 [] 会经过 debounce 写入 localStorage，覆盖掉真实内容。
      if (!readyRef.current) {
        console.log(`[WeaveAI][onChange] readyRef=false → 丢弃`);
        return;
      }

      const serialized = JSON.stringify(elements);
      if (serialized === lastSerializedRef.current) {
        console.log(`[WeaveAI][onChange] 与上次相同 → 跳过`);
        return;
      }
      lastSerializedRef.current = serialized;

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveStatus("saving");
      console.log(`[WeaveAI][onChange] 启动 400ms debounce`);

      saveTimerRef.current = setTimeout(() => {
        // ★ 关键 fix：不信任 onChange 参数里的 elements —— Excalidraw 挂载后会
        //    异步触发一次 onChange([])（空场景快照），会覆盖已保存的真实内容。
        //    改成从 wrapper 主动拉取 Excalidraw 内部的真实场景元素。
        const actual = wrapperRef.current?.getElements() ?? [];
        console.log(`[WeaveAI][debounce] fire! 从 wrapper 拉取到 ${actual.length} 个真实元素（onChange 报的是 ${elements.length}）`);
        try {
          saveCanvas(actual);
          setSaveStatus("saved");
          setLastSavedAt(Date.now());
        } catch {
          setSaveStatus("error");
        }
      }, 400);
    },
    []
  );

  const handleSelectionChange = useCallback(
    (ids: string[], selected: ExcalidrawElementLike[]) => {
      setSelectedIds(ids);
      setSelectedElements(selected);
    },
    []
  );

  const handleInitialApplied = useCallback(() => {
    // Excalidraw 真正完成 initialElements 注入之后，才放开保存通道
    console.log(`[WeaveAI][initialApplied] Excalidraw 完成初始注入 → readyRef=true`);
    readyRef.current = true;
  }, []);

  // 供 PromptModal 拉取画布全量元素（用于结构化提取节点 + 连接）
  const getAllElementsForCompile = useCallback(() => {
    return wrapperRef.current?.getElements() ?? [];
  }, []);

  const selectionText = selectedElements
    .map((el) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = (el as any).text;
      return typeof raw === "string" ? raw : "";
    })
    .filter(Boolean)
    .join("\n");

  if (initialElements === null) {
    return (
      <div className="flex h-screen w-screen items-center justify-center gap-2 bg-neutral-50 text-[13px] text-neutral-400">
        <Loader2 className="size-3.5 animate-spin" />
        准备画布...
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-neutral-50 font-sans">

      {/* ═══ Top Bar — Linear 风 56px 极简 ═══ */}
      <header
        className="flex h-14 shrink-0 items-center gap-2 border-b border-neutral-100 bg-white px-4"
        style={{ boxShadow: "var(--shadow-xs)" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 pr-1">
          <WeaveMark />
          <span className="text-[14px] font-semibold tracking-tight text-neutral-900">WeaveAI</span>
        </div>

        <div className="ml-auto flex items-center gap-1.5">

          <SaveStatusBadge status={saveStatus} lastSavedAt={lastSavedAt} />

          {/* 未配置时给一个轻提示，点击直接打开 Settings */}
          {!isConfigValid(aiConfig) && (
            <button
              onClick={() => setSettingsOpen(true)}
              className="ml-1 flex h-9 items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 text-[12.5px] font-medium text-amber-700 transition-colors hover:bg-amber-100"
              title="点击配置 API"
            >
              <span className="size-1.5 rounded-full bg-amber-500 animate-pulse-dot" />
              配置 API
            </button>
          )}

          {/* Compile button — only when something selected */}
          {selectedIds.length > 0 && (
            <button
              onClick={() => setCompileOpen(true)}
              className="ml-1 flex h-9 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-[12.5px] font-medium text-white transition-colors hover:bg-neutral-800 animate-fade-in"
            >
              <Sparkles className="size-3.5" />
              Compile
            </button>
          )}

          {/* Settings */}
          <button
            onClick={() => setSettingsOpen(true)}
            className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
              isConfigValid(aiConfig)
                ? "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
                : "text-neutral-400 hover:bg-neutral-100"
            }`}
            title="AI 设置"
          >
            <Settings className="size-[18px]" />
          </button>

          {/* Agent toggle — ghost icon button */}
          <button
            onClick={() => setAgentVisible((v) => !v)}
            className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
              agentVisible
                ? "bg-neutral-100 text-neutral-900"
                : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
            }`}
            title="切换 Agent 面板"
          >
            <PanelRight className="size-[18px]" />
          </button>
        </div>
      </header>

      {/* ═══ Body ═══ */}
      <div className="relative flex flex-1 overflow-hidden">

        {/* 画布区域 — 全屏沉浸 */}
        <main className="relative flex-1 overflow-hidden">
          <div className="canvas-bg" />
          <div className="absolute inset-0">
            <ExcalidrawClient
              ref={wrapperRef}
              initialElements={initialElements}
              onSnapshotChange={handleSnapshotChange}
              onSelectionChange={handleSelectionChange}
              onInitialApplied={handleInitialApplied}
            />
          </div>

          {/* 选区工具栏 */}
          <div className="pointer-events-none absolute inset-0">
            <SelectionToolbar
              selectedCount={selectedIds.length}
              onCompile={() => setCompileOpen(true)}
            />
          </div>
        </main>

        {/* ═══ Agent 抽屉（Linear 风：滑出） ═══ */}
        {/* 抽屉本体 */}
        <div
          className={`absolute right-0 top-0 z-40 h-full w-96 border-l border-neutral-100 bg-white transition-transform duration-300 ease-out ${
            agentVisible ? "translate-x-0" : "translate-x-full"
          }`}
          style={{ boxShadow: "var(--shadow-drawer)" }}
        >
          <AgentPanel
            boardId={CANVAS_BOARD_ID}
            selectionText={selectionText}
            initialPrompt={compiledPrompt}
            aiConfig={aiConfig}
            onClose={() => setAgentVisible(false)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </div>

        {/* 抽屉手柄：未展开时显示，hover 微亮 */}
        {!agentVisible && (
          <button
            onMouseEnter={() => setAgentHover(true)}
            onMouseLeave={() => setAgentHover(false)}
            onClick={() => setAgentVisible(true)}
            className={`absolute right-0 top-1/2 z-30 -translate-y-1/2 rounded-l-md border border-r-0 border-neutral-200 bg-white py-4 pl-2.5 pr-2 transition-all hover:border-indigo-300 hover:bg-indigo-50 ${
              agentHover ? "translate-x-0 shadow-md" : "translate-x-1 shadow-sm"
            }`}
            title="打开 Agent 面板"
          >
            <svg width="8" height="32" viewBox="0 0 8 32" fill="none">
              <circle cx="4" cy="6" r="1.6" fill={agentHover ? "#5e6ad2" : "#8c93a1"} />
              <circle cx="4" cy="16" r="1.6" fill={agentHover ? "#5e6ad2" : "#8c93a1"} />
              <circle cx="4" cy="26" r="1.6" fill={agentHover ? "#5e6ad2" : "#8c93a1"} />
            </svg>
          </button>
        )}
      </div>
 
      {/* ═══ Compile Modal ═══ */}
      <PromptModal
        open={compileOpen}
        onOpenChange={setCompileOpen}
        selectedIds={selectedIds}
        getAllElements={getAllElementsForCompile}
        selectionPreview={selectionText}
        apiConfig={aiConfig}
        preset="agent-task"
        onCompiled={(p) => {
          setCompiledPrompt(p);
          setAgentVisible(true);
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("weaveai:agent-initial-prompt", { detail: p }));
          }
        }}
      />

      {/* ═══ Settings Modal ═══ */}
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onConfigChange={(c) => setAiConfig(c)}
      />
    </div>
  );
}

/* ── WeaveAI brand mark — 编织交错的节点 ───────────────── */
function WeaveMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="1" y="1" width="16" height="16" rx="4" fill="#5e6ad2" />
      {/* 三个节点 */}
      <circle cx="5" cy="5" r="1.4" fill="#fff" />
      <circle cx="13" cy="5" r="1.4" fill="#fff" />
      <circle cx="9" cy="13" r="1.4" fill="#fff" />
      {/* 编织连线 */}
      <path
        d="M5 5 L13 5 L9 13 L5 5"
        stroke="#fff"
        strokeWidth="1"
        strokeOpacity=".85"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13 5 L5 5 L9 13 L13 5"
        stroke="#fff"
        strokeWidth="1"
        strokeOpacity=".55"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── Save status — minimal, inline ──────────────────────── */
function SaveStatusBadge({ status, lastSavedAt }: { status: SaveStatus; lastSavedAt: number | null }) {
  if (status === "idle") {
    return (
      <span className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-neutral-400">
        <span className="size-1 rounded-full bg-neutral-300" />
        就绪
      </span>
    );
  }
  if (status === "saving") {
    return (
      <span className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-neutral-400">
        <span className="size-1 rounded-full bg-neutral-300" />
        保存中
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-rose-500">
        <span className="size-1 rounded-full bg-rose-500" />
        保存失败
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-neutral-500">
      <span className="size-1 rounded-full bg-emerald-500 animate-pulse-dot" />
      {lastSavedAt ? `已保存 · ${formatTimeAgo(lastSavedAt)}` : "已保存"}
    </span>
  );
}

function formatTimeAgo(unixMs: number): string {
  const diff = Math.max(0, Date.now() - unixMs);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h`;
}

