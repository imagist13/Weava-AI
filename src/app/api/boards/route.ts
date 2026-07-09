import { NextRequest, NextResponse } from "next/server";
import { CreateBoardSchema } from "@/lib/boards/types";
import { createBoard, listBoards } from "@/lib/boards/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const boards = await listBoards();
    return NextResponse.json(boards);
  } catch (error) {
    console.error("listBoards failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "internal error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const parse = CreateBoardSchema.safeParse(body);
    if (!parse.success) {
      return NextResponse.json(
        { error: "invalid body", issues: parse.error.issues },
        { status: 400 }
      );
    }

    const board = await createBoard(parse.data);
    return NextResponse.json(board, { status: 201 });
  } catch (error) {
    console.error("createBoard failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "internal error" },
      { status: 500 }
    );
  }
}
