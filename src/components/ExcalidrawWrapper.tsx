"use client";

import { useEffect, useState, useRef, useImperativeHandle, forwardRef, useCallback } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";

// Excalidraw 0.18 样式与字体资源路径通过 package.json exports 与 layout.tsx 全局配置维护
import "@excalidraw/excalidraw/index.css";

// 配置 Excalidraw 字体资源路径
const configureExcalidrawAssets = () => {
  if (typeof window !== "undefined" && !window.EXCALIDRAW_ASSET_PATH) {
    window.EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";
  }
};

// 声明全局类型
declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string;
  }
}

// 简化的元素类型接口
export interface ExcalidrawElementLike {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  strokeColor?: string;
  backgroundColor?: string;
  [key: string]: unknown;
}

// 暴露给父组件的方法
export interface ExcalidrawWrapperRef {
  getElements: () => ExcalidrawElementLike[];
  clearCanvas: () => void;
  /** 让父组件注入 selection 状态（如从 URL 来的元素） */
  setInitialElements: (elements: ExcalidrawElementLike[]) => void;
}

interface ExcalidrawWrapperProps {
  /** 外部“受控”的元素；为空时仅做内部使用 */
  initialElements?: ExcalidrawElementLike[];
  /** 当画布内容变化时调用（自动保存用） */
  onSnapshotChange?: (elements: ExcalidrawElementLike[]) => void;
  /** 选区变化时调用（用于显示 SelectionToolbar） */
  onSelectionChange?: (selectedIds: string[], selectedElements: ExcalidrawElementLike[]) => void;
  /** 首次注入完成（或确认是空场景）时调用，用于通知父组件“可以放行保存了” */
  onInitialApplied?: () => void;
}

const ExcalidrawWrapper = forwardRef<ExcalidrawWrapperRef, ExcalidrawWrapperProps>(
  function ExcalidrawWrapper(
    { initialElements, onSnapshotChange, onSelectionChange, onInitialApplied },
    ref
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [Excalidraw, setExcalidraw] = useState<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
    const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const prevElementsRef = useRef<ExcalidrawElementLike[]>([]);
    const isReadyRef = useRef(false);
    const initialAppliedRef = useRef(false);
    // 在 setInitialElements / 注入 initialElements 后，下一次 onChange 是 Excalidraw 的回放，需要抑制回传
    const suppressNextChangeRef = useRef(false);
    const lastSelectionRef = useRef<string[]>([]);

    useImperativeHandle(ref, () => ({
      getElements: () => {
        if (!excalidrawAPI) return [];
        // 返回完整元素对象（与 save 的口径一致），不再简化字段
        const sceneElements = excalidrawAPI.getSceneElements() || [];
        return sceneElements.map((el: ExcalidrawElementLike) => ({ ...el }));
      },
      clearCanvas: () => {
        if (excalidrawAPI) {
          excalidrawAPI.updateScene({
            elements: [],
            captureUpdate: CaptureUpdateAction.IMMEDIATELY,
          });
          prevElementsRef.current = [];
        }
      },
      setInitialElements: (elements) => {
        if (!excalidrawAPI) return;
        const existing = excalidrawAPI.getSceneElements() || [];
        const ids = new Set(existing.map((el: ExcalidrawElementLike) => el.id));
        const additions = (elements || []).filter((e) => !ids.has(e.id));
        if (additions.length === 0) return;
        // 抑制 Excalidraw 在 updateScene 后回放的那次 onChange
        suppressNextChangeRef.current = true;
        excalidrawAPI.updateScene({
          elements: [...existing, ...additions],
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
      },
    }), [excalidrawAPI]);

    const updateDimensions = useCallback(() => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.height < 10000) {
          setDimensions({ width: rect.width, height: rect.height });
        }
      }
    }, []);

    useEffect(() => {
      configureExcalidrawAssets();
      updateDimensions();
      window.addEventListener('resize', updateDimensions);
      const resizeObserver = new ResizeObserver(updateDimensions);
      if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
      }
      return () => {
        window.removeEventListener('resize', updateDimensions);
        resizeObserver.disconnect();
      };
    }, [updateDimensions]);

    useEffect(() => {
      import("@excalidraw/excalidraw").then((mod) => {
        setExcalidraw(() => mod.Excalidraw);
      });
    }, []);

    // 给历史保存的“简化版”元素补全必要字段，避免 Excalidraw 校验失败丢弃。
// 之后所有保存都会走完整结构，这个补全是仅为兼容老数据。
function normalizeImportedElement(el: ExcalidrawElementLike): ExcalidrawElementLike {
  const out: Record<string, unknown> = { ...el };
  // 通用字段默认值
  if (out.strokeColor === undefined) out.strokeColor = "#1e1e1e";
  if (out.backgroundColor === undefined) out.backgroundColor = "transparent";
  if (out.fillStyle === undefined) out.fillStyle = "solid";
  if (out.strokeWidth === undefined) out.strokeWidth = 2;
  if (out.strokeStyle === undefined) out.strokeStyle = "solid";
  if (out.roughness === undefined) out.roughness = 1;
  if (out.opacity === undefined) out.opacity = 100;
  if (out.angle === undefined) out.angle = 0;
  if (!Array.isArray(out.groupIds)) out.groupIds = [];
  if (out.frameId === undefined) out.frameId = null;
  if (out.index === undefined) out.index = null;
  if (out.roundness === undefined) out.roundness = null;
  if (out.seed === undefined) out.seed = Math.floor(Math.random() * 100000);
  if (out.version === undefined) out.version = 1;
  if (out.versionNonce === undefined) out.versionNonce = Math.floor(Math.random() * 1000000000);
  if (out.isDeleted === undefined) out.isDeleted = false;
  if (out.boundElements === undefined) out.boundElements = null;
  if (out.updated === undefined) out.updated = Date.now();
  if (out.link === undefined) out.link = null;
  if (out.locked === undefined) out.locked = false;
  // 类型相关
  if (el.type === "arrow" || el.type === "line") {
    if (out.startBinding === undefined) out.startBinding = null;
    if (out.endBinding === undefined) out.endBinding = null;
    if (out.points === undefined) out.points = [];
    if (out.lastCommittedPoint === undefined) out.lastCommittedPoint = null;
    if (out.startArrowhead === undefined) out.startArrowhead = null;
    if (out.endArrowhead === undefined) out.endArrowhead = "arrow";
  }
  if (el.type === "text") {
    if (out.textAlign === undefined) out.textAlign = "left";
    if (out.verticalAlign === undefined) out.verticalAlign = "top";
    if (out.containerId === undefined) out.containerId = null;
    if (out.originalText === undefined) out.originalText = el.text ?? "";
    if (out.lineHeight === undefined) out.lineHeight = 1.25;
    if (out.fontSize === undefined) out.fontSize = 20;
    if (out.fontFamily === undefined) out.fontFamily = 1;
    if (out.autoResize === undefined) out.autoResize = true;
  }
  return out as ExcalidrawElementLike;
}
    useEffect(() => {
      if (!excalidrawAPI || !isReadyRef.current || initialAppliedRef.current) {
        return;
      }
      // ★ 初始元素已经通过 <Excalidraw initialData={...} /> 在挂载时注入，
      //    这里不再重复调用 updateScene。只做"标记 ready + 通知父组件"。
      console.log("[WeaveAI][wrapper] initialData 已由 Excalidraw 挂载时接管，标记 ready");
      initialAppliedRef.current = true;
      if (initialElements && initialElements.length > 0) {
        const normalized = initialElements.map(normalizeImportedElement);
        prevElementsRef.current = normalized;
      }
      onInitialApplied?.();
    }, [excalidrawAPI, initialElements, onInitialApplied]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleExcalidrawAPI = (api: any) => {
      if (api) {
        setExcalidrawAPI(api);
        isReadyRef.current = true;
        setTimeout(() => fixExcalidrawLayout(), 100);
      }
    };

    const handleChange = (
      elements: readonly ExcalidrawElementLike[],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      appState?: any
    ) => {
      // 抑制：刚注入的 initialElements / setInitialElements 触发的回放
      if (suppressNextChangeRef.current) {
        suppressNextChangeRef.current = false;
        return;
      }

      if (elements && onSnapshotChange) {
        // 必须保存完整的 Excalidraw 元素对象 —— 不能简化字段。
        // 简化（如只保留 id/type/x/y/...）会丢掉 groupIds/binding/opacity/roughness/strokeStyle 等关键字段，
        // 下次加载时 Excalidraw 会认为元素不合法并丢弃，导致画布"消失"。
        const fullElements = elements.map((el) => ({ ...el }));
        prevElementsRef.current = fullElements;
        onSnapshotChange(fullElements);
      }

      if (appState && onSelectionChange && excalidrawAPI) {
        const selectedIdsObj =
          appState.selectedElementIds ??
          appState.selectedElements ??
          {};
        const ids: string[] = Object.keys(selectedIdsObj).filter(
          (id) => (selectedIdsObj as Record<string, unknown>)[id]
        );
        if (
          ids.length !== lastSelectionRef.current.length ||
          ids.some((id, i) => id !== lastSelectionRef.current[i])
        ) {
          lastSelectionRef.current = ids;
          const sceneElements = excalidrawAPI.getSceneElements() || [];
          const idSet = new Set(ids);
          const selected = sceneElements
            .filter((el: ExcalidrawElementLike) => idSet.has(el.id))
            .map((el: ExcalidrawElementLike) => ({
              id: el.id,
              type: el.type,
              x: Math.round(el.x),
              y: Math.round(el.y),
              width: el.width ? Math.round(el.width as number) : undefined,
              height: el.height ? Math.round(el.height as number) : undefined,
              text: el.type === "text" ? el.text : undefined,
              strokeColor: el.strokeColor,
              backgroundColor: el.backgroundColor,
            }));
          onSelectionChange(ids, selected);
        }
      }
    };

    const fixExcalidrawLayout = () => {
      if (!containerRef.current) return;

      const container = containerRef.current;
      const height = container.getBoundingClientRect().height;

      const layerUI = container.querySelector('.layer-ui__wrapper') as HTMLElement;
      if (layerUI) {
        layerUI.style.height = `${height}px`;
        layerUI.style.overflow = 'hidden';
        layerUI.style.pointerEvents = 'none';
      }

      const fixedContainers = container.querySelectorAll('.FixedSideContainer');
      fixedContainers.forEach((el) => {
        (el as HTMLElement).style.height = 'auto';
        (el as HTMLElement).style.maxHeight = `${height}px`;
        (el as HTMLElement).style.pointerEvents = 'none';
      });

      const appMenus = container.querySelectorAll('.App-menu, .App-menu_top');
      appMenus.forEach((el) => {
        (el as HTMLElement).style.height = 'auto';
        (el as HTMLElement).style.pointerEvents = 'none';
      });

      const islands = container.querySelectorAll('.Island');
      islands.forEach((el) => {
        (el as HTMLElement).style.height = 'auto';
        (el as HTMLElement).style.maxHeight = 'fit-content';
        (el as HTMLElement).style.pointerEvents = 'auto';
      });

      const buttons = layerUI?.querySelectorAll('button, input, [role="radio"], [role="checkbox"]');
      buttons?.forEach((el) => {
        (el as HTMLElement).style.pointerEvents = 'auto';
      });
    };

    const isLoading = !Excalidraw || !dimensions;

    return (
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {isLoading ? (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            width: "100%",
            background: "#f9fafb",
            color: "#6b7280"
          }}>
            加载 Excalidraw...
          </div>
        ) : (
          <div
            style={{
              width: dimensions.width,
              height: dimensions.height,
              position: "absolute",
              top: 0,
              left: 0,
            }}
          >
            <Excalidraw
              excalidrawAPI={handleExcalidrawAPI}
              onChange={handleChange}
              // ★ 关键：初始元素通过 initialData 传给 Excalidraw，让它在挂载时就装载好。
              //    之前用 updateScene 二次注入的方式不可靠（时序 + 字段校验），会导致场景为空。
              initialData={
                initialElements && initialElements.length > 0
                  ? { elements: initialElements.map(normalizeImportedElement), appState: { viewBackgroundColor: "#ffffff" }, scrollToContent: true }
                  : null
              }
              // Excalidraw 0.18 selection change handler name 在不同版本中可能略不同；
              // 这里用 onPointerUpdate 之外的备选：直接通过 api 读取选中。
              UIOptions={{
                canvasActions: {
                  changeViewBackgroundColor: true,
                  clearCanvas: true,
                  export: false,
                  loadScene: false,
                  saveAsImage: false,
                  saveToActiveFile: false,
                  toggleTheme: true,
                },
              }}
            />
          </div>
        )}
      </div>
    );
  }
);

export default ExcalidrawWrapper;
