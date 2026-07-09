import type { SelectionTextItem } from "./extract";

/**
 * 按阅读顺序（从上到下、从左到右）对 SelectionTextItem 重新排序。
 * 策略：
 * 1. 把 y 坐标相近的元素（±30px 容差）归为同一行
 * 2. 同行按 x 升序排列
 * 3. 行间按行首 y 升序排列
 */
export function sortByReadingOrder(items: SelectionTextItem[]): SelectionTextItem[] {
  if (items.length <= 1) return items;

  const ROW_TOLERANCE = 30; // px

  // 先按 y 粗排，然后分组
  const sorted = [...items].sort((a, b) => a.y - b.y);

  const rows: SelectionTextItem[][] = [];
  let currentRow: SelectionTextItem[] = [];
  let currentRowTop = sorted[0]?.y ?? 0;

  for (const item of sorted) {
    if (Math.abs(item.y - currentRowTop) <= ROW_TOLERANCE) {
      currentRow.push(item);
    } else {
      if (currentRow.length > 0) rows.push(currentRow);
      currentRow = [item];
      currentRowTop = item.y;
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  // 每行内部按 x 排序
  const result: SelectionTextItem[] = [];
  let order = 0;
  for (const row of rows) {
    const sortedRow = row.sort((a, b) => a.x - b.x);
    for (const item of sortedRow) {
      result.push({ ...item, order: order++ });
    }
  }

  return result;
}
