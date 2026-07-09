import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { patchBoard } from "@/lib/boards/repo";

export const dynamic = "force-dynamic";

const SnapshotSchema = z.object({
  snapshot: z.array(z.unknown()),
  appState: z.record(z.string(), z.unknown()).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const parse = SnapshotSchema.safeParse(body);
    if (!parse.success) {
      return NextResponse.json(
        { error: "invalid body", issues: parse.error.issues },
        { status: 400 }
      );
    }

    const snapshotLen = Array.isArray(parse.data.snapshot) ? parse.data.snapshot.length : 0;
    console.log(`[snapshot PATCH] board=${id} elements=${snapshotLen} ts=${Date.now()}`);

    const board = await patchBoard(id, parse.data);
    if (!board) {
      return NextResponse.json({ error: "board not found" }, { status: 404 });
    }
    // 只回写 updatedAt，避免前端拿到巨大 snapshot 回包
    return NextResponse.json({
      id: board.id,
      updatedAt: board.updatedAt,
    });
  } catch (error) {
    console.error("snapshot patch failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "internal error" },
      { status: 500 }
    );
  }
}
