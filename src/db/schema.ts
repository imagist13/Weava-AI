import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const boards = sqliteTable("boards", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  snapshot: text("snapshot").notNull().default("[]"),
  appState: text("app_state"),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export type BoardRow = typeof boards.$inferSelect;
export type BoardInsert = typeof boards.$inferInsert;
