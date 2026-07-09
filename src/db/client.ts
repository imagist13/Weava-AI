import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

const DB_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DB_DIR, "weaveai.db");

// 首次运行时创建 data 目录
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// 防止 Next.js dev hot reload 重复打开 sqlite
const globalForDb = globalThis as unknown as {
  __weaveai_sqlite__?: Database.Database;
};

const sqlite =
  globalForDb.__weaveai_sqlite__ ??
  new Database(DB_FILE, { fileMustExist: false });

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

if (process.env.NODE_ENV !== "production") {
  globalForDb.__weaveai_sqlite__ = sqlite;
}

export const db = drizzle(sqlite, { schema });
export { sqlite, schema };

let initialized = false;

export function ensureSchema() {
  if (initialized) return;
  initialized = true;

  // 与 drizzle-kit push 的输出对齐；首次启动幂等创建
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS boards (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      snapshot     TEXT NOT NULL DEFAULT '[]',
      app_state    TEXT,
      version      INTEGER NOT NULL DEFAULT 1,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_boards_updated_at
      ON boards (updated_at DESC);
  `);
}
