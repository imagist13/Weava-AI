import { z } from "zod";

// API 响应使用 snake_case 还是 camelCase？我们选 camelCase 对前端友好
export const BoardSchema = z.object({
  id: z.string(),
  name: z.string(),
  snapshot: z.array(z.unknown()).default([]),
  appState: z.record(z.string(), z.unknown()).nullable().optional(),
  version: z.number().int().default(1),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export type Board = z.infer<typeof BoardSchema>;

// PATCH 入参：所有字段可选
export const BoardPatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  snapshot: z.array(z.unknown()).optional(),
  appState: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type BoardPatch = z.infer<typeof BoardPatchSchema>;

// POST 创建入参
export const CreateBoardSchema = z.object({
  name: z.string().min(1).max(120).optional(),
});
export type CreateBoardInput = z.infer<typeof CreateBoardSchema>;
