/**
 * 共享的 Excalidraw 画布工具函数
 */
import type { ExcalidrawElementLike } from "@/components/ExcalidrawWrapper";
import type { SelectionTextItem } from "./extract";

/**
 * 自动补全选区中的箭头/线条。
 * 用户往往只框选形状而忽略了箭头。为了让 AI 看到"节点 + 关系"完整结构，
 * 自动把两端都在选区内的箭头/线条也补进来。
 *
 * @param selectedIds 用户选中的元素 ID 列表
 * @param allElements 画布上所有元素
 * @returns 补全后的元素 ID 列表（包含新增的箭头）
 */
export function augmentSelectionWithArrows(
  selectedIds: string[],
  allElements: ExcalidrawElementLike[]
): string[] {
  const selectedSet = new Set(selectedIds.map(String));
  const augmentedIds: string[] = [...selectedIds];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const el of allElements as any[]) {
    if (!el) continue;
    if (el.type !== "arrow" && el.type !== "line") continue;

    const startId = el.startBinding?.elementId
      ? String(el.startBinding.elementId)
      : undefined;
    const endId = el.endBinding?.elementId
      ? String(el.endBinding.elementId)
      : undefined;

    // 如果箭头两端都连接了选区内的元素，则自动加入
    if (startId && endId && selectedSet.has(startId) && selectedSet.has(endId)) {
      const arrowId = String(el.id);
      if (!selectedSet.has(arrowId)) {
        selectedSet.add(arrowId);
        augmentedIds.push(arrowId);
      }
    }
  }

  return augmentedIds;
}

/**
 * 诊断信息：生成画布结构的文本描述，用于调试和提示词构建
 */
export interface CanvasDiagnostic {
  /** 原始选中的 ID 数量 */
  originalCount: number;
  /** 补全后的 ID 数量 */
  augmentedCount: number;
  /** 新增的箭头 ID 列表 */
  addedArrows: string[];
  /** 没有绑定的孤立箭头数量 */
  orphanArrows: number;
  /** 箭头连接的详细信息 */
  connections: Array<{
    arrowId: string;
    from: string | null;
    to: string | null;
    hasLabel: boolean;
  }>;
}

export function diagnoseCanvasSelection(
  selectedIds: string[],
  allElements: ExcalidrawElementLike[]
): CanvasDiagnostic {
  const selectedSet = new Set(selectedIds.map(String));
  const addedArrows: string[] = [];
  let orphanArrows = 0;
  const connections: CanvasDiagnostic["connections"] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const el of allElements as any[]) {
    if (!el) continue;
    if (el.type !== "arrow" && el.type !== "line") continue;

    const arrowId = String(el.id);
    const startId = el.startBinding?.elementId
      ? String(el.startBinding.elementId)
      : undefined;
    const endId = el.endBinding?.elementId
      ? String(el.endBinding.elementId)
      : undefined;

    // 检查是否有绑定的文字
    const hasLabel = Boolean(
      el.boundElements?.some((b: { type: string }) => b.type === "text") ||
        (typeof el.text === "string" && el.text.trim())
    );

    connections.push({
      arrowId,
      from: startId ?? null,
      to: endId ?? null,
      hasLabel,
    });

    if (startId && endId) {
      if (selectedSet.has(startId) && selectedSet.has(endId)) {
        if (!selectedSet.has(arrowId)) {
          addedArrows.push(arrowId);
        }
      }
    } else {
      orphanArrows++;
    }
  }

  return {
    originalCount: selectedIds.length,
    augmentedCount: selectedIds.length + addedArrows.length,
    addedArrows,
    orphanArrows,
    connections,
  };
}

/**
 * 生成增强的画布描述，包含箭头关系信息
 */
export function buildEnhancedCanvasContext(
  items: SelectionTextItem[],
  diagnostic: CanvasDiagnostic
): string {
  const lines: string[] = [];

  // 基础结构化描述
  const nodes = items.filter((i) => i.type !== "arrow");
  const edges = items.filter((i) => i.type === "arrow");

  if (nodes.length > 0) {
    lines.push("【节点】");
    nodes.forEach((n, idx) => {
      const shapeDesc = n.shape === "text" ? "文字" : n.shape;
      const text = n.raw || "（无文字）";
      lines.push(`- [N${idx + 1} · ${shapeDesc}] ${text}`);
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

      const fromLabel = from ? `N${nodes.indexOf(from) + 1}` : "(孤立起点)";
      const toLabel = to ? `N${nodes.indexOf(to) + 1}` : "(孤立终点)";
      const label = e.raw ? ` · "${e.raw}"` : "";

      if (e.startId && e.endId) {
        lines.push(`- ${fromLabel} → ${toLabel}${label}`);
      } else if (e.raw) {
        lines.push(`- ${fromLabel} → ${toLabel} (${e.raw})`);
      }
    });
  }

  // 添加诊断信息
  if (diagnostic.addedArrows.length > 0) {
    lines.push("");
    lines.push(`> 💡 已自动补全 ${diagnostic.addedArrows.length} 条两端都在选区内的箭头`);
  }

  if (diagnostic.orphanArrows > 0) {
    lines.push(`> ⚠️ 选区内有 ${diagnostic.orphanArrows} 条孤立箭头（未连接到任何形状）`);
  }

  return lines.join("\n");
}
