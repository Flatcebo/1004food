import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { rowIds } = body;

    if (!rowIds || !Array.isArray(rowIds) || rowIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "rowIds 배열이 필요합니다." },
        { status: 400 }
      );
    }

    // 선택된 행들을 삭제
    const result = await sql`
      DELETE FROM upload_rows
      WHERE id = ANY(${rowIds}::int[])
      RETURNING id
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { success: false, error: "삭제할 데이터를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `${result.length}개의 데이터가 성공적으로 삭제되었습니다.`,
      deletedCount: result.length,
      deletedIds: result.map((r) => r.id),
    });
  } catch (error: any) {
    console.error("데이터 삭제 실패:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

