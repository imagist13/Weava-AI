import { nanoid } from "nanoid";
import { eq, desc } from "drizzle-orm";
import { db, ensureSchema, schema } from "@/db/client";
import { Board, BoardPatch, CreateBoardInput } from "./types";

function newBoardId() {
  return `b_${nanoid(10)}`;
}

function rowToBoard(row: typeof schema.boards.$inferSelect): Board {
  let snapshot: unknown[] = [];
  try {
    const parsed = JSON.parse(row.snapshot || "[]");
    if (Array.isArray(parsed)) snapshot = parsed;
  } catch {
    snapshot = [];
  }

  let appState: Record<string, unknown> | null | undefined = undefined;
  if (row.appState != null) {
    try {
      appState = JSON.parse(row.appState);
    } catch {
      appState = undefined;
    }
  }

  return {
    id: row.id,
    name: row.name,
    snapshot,
    appState,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listBoards(): Promise<Board[]> {
  ensureSchema();
  const rows = await db
    .select()
    .from(schema.boards)
    .orderBy(desc(schema.boards.updatedAt));
  return rows.map(rowToBoard);
}

export async function getBoard(id: string): Promise<Board | null> {
  ensureSchema();
  const rows = await db
    .select()
    .from(schema.boards)
    .where(eq(schema.boards.id, id))
    .limit(1);
  return rows[0] ? rowToBoard(rows[0]) : null;
}

function generateDefaultName(existingCount: number): string {
  return `未命名画布 #${existingCount + 1}`;
}

export async function createBoard(input?: CreateBoardInput): Promise<Board> {
  ensureSchema();
  const existing = await listBoards();
  const id = newBoardId();
  const now = Date.now();
  const row = {
    id,
    name: input?.name?.trim() || generateDefaultName(existing.length),
    snapshot: "[]",
    appState: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(schema.boards).values(row).run();
  return rowToBoard(row);
}

export async function patchBoard(
  id: string,
  patch: BoardPatch
): Promise<Board | null> {
  ensureSchema();
  const existing = await getBoard(id);
  if (!existing) return null;

  const updatedAt = Date.now();
  const updates: Partial<typeof schema.boards.$inferInsert> = {
    updatedAt,
  };
  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.snapshot !== undefined) {
    updates.snapshot = JSON.stringify(patch.snapshot ?? []);
  }
  if (patch.appState !== undefined) {
    updates.appState = patch.appState ? JSON.stringify(patch.appState) : null;
  }

  await db.update(schema.boards).set(updates).where(eq(schema.boards.id, id)).run();
  return getBoard(id);
}

export async function deleteBoard(id: string): Promise<boolean> {
  ensureSchema();
  const result = await db
    .delete(schema.boards)
    .where(eq(schema.boards.id, id))
    .run();
  // better-sqlite3 driver 在 drizzle 上返回 { changes, lastInsertRowid }
  return Boolean((result as { changes?: number }).changes);
}
