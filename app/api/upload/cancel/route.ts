import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

export async function PUT(request: NextRequest) {
  try {
    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400}
      );
    }

    const body = await request.json();
    const {rowIds} = body;

    if (!rowIds || !Array.isArray(rowIds) || rowIds.length === 0) {
      return NextResponse.json(
        {success: false, error: "rowIds 배열이 필요합니다."},
        {status: 400}
      );
    }

    // 선택된 행들의 주문상태를 취소로 업데이트 (company_id 필터링)
    // 모든 상태(공급중, 발주서 다운, 사방넷 다운, 배송중 등)를 "취소"로 업데이트
    const updatePromises = rowIds.map(
      (rowId: number) =>
        sql`
        UPDATE upload_rows ur
        SET row_data = jsonb_set(
          row_data,
          '{주문상태}',
          to_jsonb('취소'::text)
        )
        FROM uploads u
        WHERE ur.upload_id = u.id 
          AND ur.id = ${rowId}
          AND u.company_id = ${companyId}
        RETURNING ur.id
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
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
