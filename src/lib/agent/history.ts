const HISTORY_PREFIX = "weaveai:agent-history:";
const MAX_MESSAGES = 100;       // 单个画布最多保留的消息条数
const MAX_CONTENT_LENGTH = 8000; // 单条消息最大字符数（防止 localStorage 爆炸）

export interface PersistedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
}

/** 序列化前的裁剪：丢弃空 assistant + 截断过长文本 + 限制条数 */
function sanitize(messages: PersistedMessage[]): PersistedMessage[] {
  return messages
    .filter((m) => m.content && m.content.trim().length > 0)
    .map((m) => ({
      ...m,
      content:
        m.content.length > MAX_CONTENT_LENGTH
          ? m.content.slice(0, MAX_CONTENT_LENGTH) + "…"
          : m.content,
    }))
    .slice(-MAX_MESSAGES);
}

export function loadHistory(boardId: string): PersistedMessage[] {
  if (typeof window === "undefined" || !boardId) return [];
  try {
    const raw = localStorage.getItem(HISTORY_PREFIX + boardId);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sanitize(parsed as PersistedMessage[]);
  } catch {
    return [];
  }
}

export function saveHistory(
  boardId: string,
  history: PersistedMessage[]
): void {
  if (typeof window === "undefined" || !boardId) return;
  try {
    const cleaned = sanitize(history);
    // 完全没有消息时主动清空 key，避免无限写入空字符串
    if (cleaned.length === 0) {
      localStorage.removeItem(HISTORY_PREFIX + boardId);
      return;
    }
    localStorage.setItem(HISTORY_PREFIX + boardId, JSON.stringify(cleaned));
  } catch (err) {
    // localStorage 满了或被禁用 —— 静默
    console.warn("[WeaveAI] 保存历史失败:", err);
  }
}

export function clearHistory(boardId: string): void {
  if (typeof window === "undefined" || !boardId) return;
  try {
    localStorage.removeItem(HISTORY_PREFIX + boardId);
  } catch {}
}

/** 列出所有历史 key（用于调试 / 未来的会话列表） */
export function listAllHistories(): Array<{ boardId: string; count: number; updatedAt: number }> {
  if (typeof window === "undefined") return [];
  const out: Array<{ boardId: string; count: number; updatedAt: number }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(HISTORY_PREFIX)) continue;
    const boardId = k.slice(HISTORY_PREFIX.length);
    try {
      const arr = JSON.parse(localStorage.getItem(k) || "[]");
      const ts = Array.isArray(arr) && arr.length > 0
        ? Math.max(...arr.map((m: PersistedMessage) => m.ts || 0))
        : 0;
      out.push({ boardId, count: Array.isArray(arr) ? arr.length : 0, updatedAt: ts });
    } catch { /* ignore */ }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}