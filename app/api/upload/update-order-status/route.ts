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
    const {rowIds, orderStatus} = body;

    if (!rowIds || !Array.isArray(rowIds) || rowIds.length === 0) {
      return NextResponse.json(
        {success: false, error: "rowIds 배열이 필요합니다."},
        {status: 400}
      );
    }

    if (!orderStatus) {
      return NextResponse.json(
        {success: false, error: "orderStatus가 필요합니다."},
        {status: 400}
      );
    }

    // 유효한 주문 상태인지 확인
    const validStatuses = [
      "공급중",
      "발주서 다운",
      "사방넷 다운",
      "배송중",
      "취소",
    ];
    if (!validStatuses.includes(orderStatus)) {
      return NextResponse.json(
        {success: false, error: "유효하지 않은 주문 상태입니다."},
        {status: 400}
      );
    }

    // 효율적인 단일 쿼리로 모든 row의 주문상태를 업데이트
    const result = await sql`
      UPDATE upload_rows ur
      SET row_data = jsonb_set(
        row_data,
        '{주문상태}',
        to_jsonb(${orderStatus}::text),
        true
      )
      FROM uploads u
      WHERE ur.upload_id = u.id 
        AND ur.id = ANY(${rowIds}::int[])
        AND u.company_id = ${companyId}
      RETURNING ur.id
    `;

    const updatedCount = result.length;

    return NextResponse.json({
      success: true,
      updatedCount,
      updatedIds: result.map((r) => r.id),
    });
  } catch (error: any) {
    console.error("주문 상태 업데이트 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
