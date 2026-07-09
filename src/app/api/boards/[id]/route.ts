import { NextRequest, NextResponse } from "next/server";
import { BoardPatchSchema } from "@/lib/boards/types";
import { deleteBoard, getBoard, patchBoard } from "@/lib/boards/repo";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const board = await getBoard(id);
    if (!board) {
      return NextResponse.json({ error: "board not found" }, { status: 404 });
    }
    return NextResponse.json(board);
  } catch (error) {
    console.error("getBoard failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "internal error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const parse = BoardPatchSchema.safeParse(body);
    if (!parse.success) {
      return NextResponse.json(
        { error: "invalid body", issues: parse.error.issues },
        { status: 400 }
      );
    }

    const board = await patchBoard(id, parse.data);
    if (!board) {
      return NextResponse.json({ error: "board not found" }, { status: 404 });
    }
    return NextResponse.json(board);
  } catch (error) {
    console.error("patchBoard failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "internal error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const ok = await deleteBoard(id);
    if (!ok) {
      return NextResponse.json({ error: "board not found" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("deleteBoard failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "internal error" },
      { status: 500 }
    );
  }
}
