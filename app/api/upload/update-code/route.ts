import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { rowId, codeData } = body;

    if (!rowId || !codeData) {
      return NextResponse.json(
        { success: false, error: "rowId와 codeData가 필요합니다." },
        { status: 400 }
      );
    }

    // 기존 row_data 조회
    const existingRow = await sql`
      SELECT row_data
      FROM upload_rows
      WHERE id = ${rowId}
    `;

    if (existingRow.length === 0) {
      return NextResponse.json(
        { success: false, error: "해당 행을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const currentRowData = existingRow[0].row_data;
    const currentProductName = currentRowData?.상품명 || "";

    // 기존 row_data를 복사하고 선택한 매핑코드의 모든 필드를 업데이트
    // 단, 상품명은 기존 것을 유지
    const updatedRowData = {
      ...currentRowData,
      매핑코드: codeData.code, // 절대적으로 선택한 매핑코드 사용
      내외주: codeData.type,
      택배사: codeData.postType,
      합포수량: codeData.pkg,
      가격: codeData.price,
      택배비: codeData.postFee,
      기타: codeData.etc || "",
      상품명: currentProductName, // 기존 상품명 유지
    };

    // row_data 업데이트
    const result = await sql`
      UPDATE upload_rows
      SET row_data = ${JSON.stringify(updatedRowData)}::jsonb
      WHERE id = ${rowId}
      RETURNING id
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { success: false, error: "업데이트 실패" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result[0],
    });
  } catch (error: any) {
    console.error("매핑코드 업데이트 실패:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

