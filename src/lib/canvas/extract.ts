import type { ExcalidrawElementLike } from "@/components/ExcalidrawWrapper";

export interface Mention {
  /** 原始匹配文本，如 "@context7:next.js" */
  raw: string;
  /** Connector 名称，如 "context7" */
  tool: string;
  /** 查询参数，如 "next.js" */
  query: string;
  /** 在 rawText 中的字符起始位置 */
  index: number;
}

export interface SelectionTextItem {
  id: string;
  type: "text" | "shape-with-text" | "arrow" | "shape-only";
  /** Excalidraw 原始形状类型（rectangle / ellipse / diamond / arrow / line / text …） */
  shape: string;
  /** 原始可见文本；空字符串表示该元素无文本 */
  raw: string;
  /** 阅读顺序 0..N-1 */
  order: number;
  mentions: Mention[];
  /** 用于几何排序 */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 箭头/线条的 startBinding / endBinding 所指向的元素 id（若有） */
  startId?: string;
  endId?: string;
}

// 从完整元素列表中解析所有 @mention
const MENTION_REGEX = /@([a-zA-Z][\w-]*)(?::([^\s@]+))?/g;

export function parseMentions(rawText: string): Mention[] {
  const mentions: Mention[] = [];
  let match: RegExpExecArray | null;
  MENTION_REGEX.lastIndex = 0;
  while ((match = MENTION_REGEX.exec(rawText)) !== null) {
    mentions.push({
      raw: match[0],
      tool: match[1],
      query: match[2] ?? "",
      index: match.index,
    });
  }
  return mentions;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTextFromElement(el: any): string {
  if (typeof el.text === "string" && el.text.trim()) {
    return el.text.trim();
  }
  return "";
}

// 如果形状本身通过 boundElements 关联了一个 text 元素，把那段文字取出来
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findBoundText(el: any, allElements: any[]): string {
  // 方式 1：官方 boundElements 引用（Excalidraw 双击进入形状再打字时会建立）
  const bound = el.boundElements;
  if (Array.isArray(bound)) {
    for (const ref of bound) {
      if (ref.type === "text") {
        const textEl = allElements.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (e: any) => e.id === ref.id && e.type === "text"
        );
        if (textEl) {
          const t = extractTextFromElement(textEl);
          if (t) return t;
        }
      }
    }
  }
  // 方式 2：反向查找 —— 有些 text 元素只填了 containerId，没在容器的 boundElements 里
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byContainer = allElements.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => e.type === "text" && e.containerId === el.id
  );
  if (byContainer) {
    const t = extractTextFromElement(byContainer);
    if (t) return t;
  }
  return "";
}

// 几何兜底：判断某个 text 元素是否几乎完全落在某个 shape 的边界内
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isTextGeometricallyInside(textEl: any, shape: any): boolean {
  const tx = Number(textEl.x) || 0;
  const ty = Number(textEl.y) || 0;
  const tw = Math.abs(Number(textEl.width) || 0);
  const th = Math.abs(Number(textEl.height) || 0);
  const sx = Number(shape.x) || 0;
  const sy = Number(shape.y) || 0;
  const sw = Math.abs(Number(shape.width) || 0);
  const sh = Math.abs(Number(shape.height) || 0);
  if (tw === 0 || th === 0 || sw === 0 || sh === 0) return false;
  // 文字中心点在 shape 内即视为归属；允许 shape 有一点点扩展
  const cx = tx + tw / 2;
  const cy = ty + th / 2;
  return cx >= sx && cx <= sx + sw && cy >= sy && cy <= sy + sh;
}

// 将 Excalidraw 元素映射为 SelectionTextItem
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function elementToItem(el: any, allElements: any[], index: number): SelectionTextItem | null {
  const x = Number(el.x) || 0;
  const y = Number(el.y) || 0;
  const width = Math.abs(Number(el.width) || 0);
  const height = Math.abs(Number(el.height) || 0);
  const t = el.type;

  if (t === "text") {
    // 已经作为其他形状的 label 绑定过（有 containerId），交给容器处理，避免重复
    if (el.containerId) return null;
    const raw = extractTextFromElement(el);
    if (!raw) return null;
    return {
      id: String(el.id),
      type: "text",
      shape: "text",
      raw,
      order: index,
      mentions: parseMentions(raw),
      x,
      y,
      width,
      height,
    };
  }

  if (t === "arrow" || t === "line") {
    // 箭头/线条：取绑定 label 或自身 text；同时保留起止绑定
    const raw = findBoundText(el, allElements) || extractTextFromElement(el);
    const startId = el.startBinding?.elementId ? String(el.startBinding.elementId) : undefined;
    const endId = el.endBinding?.elementId ? String(el.endBinding.elementId) : undefined;
    return {
      id: String(el.id),
      type: "arrow",
      shape: String(t),
      raw,
      order: index,
      mentions: parseMentions(raw),
      x,
      y,
      width,
      height,
      startId,
      endId,
    };
  }

  // 其他带边框的形状（矩形/椭圆/菱形/…）
  let raw = findBoundText(el, allElements);
  if (!raw) raw = extractTextFromElement(el);
  return {
    id: String(el.id),
    type: raw ? "shape-with-text" : "shape-only",
    shape: String(t || "shape"),
    raw,
    order: index,
    mentions: parseMentions(raw),
    x,
    y,
    width,
    height,
  };
}

/**
 * 从 Excalidraw 元素列表中提取框选元素的文本。
 */
export function extractSelectionText(
  selectedIds: string[],
  allElements: ExcalidrawElementLike[]
): SelectionTextItem[] {
  if (!selectedIds.length) return [];

  const items: SelectionTextItem[] = [];

  for (const id of selectedIds) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = (allElements as any[]).find((e) => String(e.id) === String(id));
    if (!el) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item = elementToItem(el, allElements as any[], items.length);
    if (item) items.push(item);
  }

  // ★ 几何兜底：如果某个 shape 没有文字，尝试把选区内几何上落在它内部的独立 text
  //   当作它的 label（并从独立节点列表移除，避免重复输出）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawElById = new Map<string, any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const raw of allElements as any[]) {
    if (raw?.id) rawElById.set(String(raw.id), raw);
  }
  const consumedTextIds = new Set<string>();
  for (const shape of items) {
    if (shape.type !== "shape-only" || shape.raw) continue;
    const shapeRaw = rawElById.get(shape.id);
    if (!shapeRaw) continue;
    // 从选区中找几何落在该 shape 内的独立 text
    const inside = items.find(
      (t) =>
        t.type === "text" &&
        !consumedTextIds.has(t.id) &&
        isTextGeometricallyInside(rawElById.get(t.id), shapeRaw)
    );
    if (inside) {
      shape.raw = inside.raw;
      shape.type = "shape-with-text";
      shape.mentions = inside.mentions;
      consumedTextIds.add(inside.id);
    }
  }
  // 剔除已被吞并为 label 的独立 text
  return items.filter((i) => !(i.type === "text" && consumedTextIds.has(i.id)));
}

/**
 * 将选区聚合为**结构化的画布描述**（节点 + 连接关系），而不是把文本简单拼接。
 * 这样 AI 才能看到"用户为什么使用 → 解决了什么痛点"这样的关系，而不是两个孤立词。
 *
 * 输出示例：
 *   【节点】
 *   - [N1 · rectangle] 用户为什么使用
 *   - [N2 · rectangle] 解决了什么痛点
 *
 *   【连接】
 *   - N1 → N2
 */
export function compileSelection(
  items: SelectionTextItem[]
): { plainText: string; mentions: Mention[] } {
  const sorted = [...items].sort((a, b) => a.order - b.order);

  const nodes = sorted.filter((i) => i.type !== "arrow");
  const edges = sorted.filter((i) => i.type === "arrow");

  const idToLabel = new Map<string, string>();
  const nodeLines: string[] = [];
  nodes.forEach((n, idx) => {
    const label = `N${idx + 1}`;
    idToLabel.set(n.id, label);
    const shapeDesc = n.shape === "text" ? "文字" : n.shape;
    nodeLines.push(
      n.raw
        ? `- [${label} · ${shapeDesc}] ${n.raw}`
        : `- [${label} · ${shapeDesc}] (无文字)`
    );
  });

  const edgeLines: string[] = [];
  for (const e of edges) {
    const from = e.startId ? idToLabel.get(e.startId) : undefined;
    const to = e.endId ? idToLabel.get(e.endId) : undefined;
    const label = e.raw ? ` （${e.raw}）` : "";
    if (from && to) {
      edgeLines.push(`- ${from} → ${to}${label}`);
    } else if (from && !to) {
      edgeLines.push(`- ${from} → (未连接)${label}`);
    } else if (!from && to) {
      edgeLines.push(`- (未连接) → ${to}${label}`);
    } else if (e.raw) {
      // 完全孤立的箭头但带文字：作为提示保留
      edgeLines.push(`- (孤立箭头) ${e.raw}`);
    }
  }

  const parts: string[] = [];
  if (nodeLines.length) {
    parts.push(`【节点】\n${nodeLines.join("\n")}`);
  }
  if (edgeLines.length) {
    parts.push(`【连接】\n${edgeLines.join("\n")}`);
  }

  const plainText = parts.length ? parts.join("\n\n") : "";

  // 汇总 mentions
  const allMentions: Mention[] = [];
  for (const item of sorted) allMentions.push(...item.mentions);

  return { plainText, mentions: allMentions };
}
