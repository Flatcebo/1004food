import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { rowIds } = body;

    if (!rowIds || !Array.isArray(rowIds) || rowIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "rowIds 배열이 필요합니다." },
        { status: 400 }
      );
    }

    // 선택된 행들의 주문상태를 취소로 업데이트
    const updatePromises = rowIds.map((rowId: number) =>
      sql`
        UPDATE upload_rows
        SET row_data = jsonb_set(
          row_data,
          '{주문상태}',
          to_jsonb('취소'::text)
        )
        WHERE id = ${rowId}
        RETURNING id
      `
    );

    const results = await Promise.all(updatePromises);
    const updatedIds = results.map((r) => r[0]?.id).filter(Boolean);

    return NextResponse.json({
      success: true,
      updatedCount: updatedIds.length,
      updatedIds,
    });
  } catch (error: any) {
    console.error("주문 취소 실패:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

