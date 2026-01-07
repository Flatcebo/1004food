import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

export async function DELETE(request: NextRequest) {
  try {
    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400}
      );
    }

    // 먼저 request body에서 ids를 확인
    const body = await request.json().catch(() => ({}));
    const {ids: bodyIds} = body;

    // URL 쿼리 파라미터에서도 확인 (하위 호환성)
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const ids = url.searchParams.get("ids")?.split(",").map(Number);

    let targetIds: number[];

    if (bodyIds && Array.isArray(bodyIds) && bodyIds.length > 0) {
      // request body에서 여러 ID 삭제
      targetIds = bodyIds.map(Number);
    } else if (id) {
      // 단일 ID 삭제 (쿼리 파라미터)
      targetIds = [parseInt(id)];
    } else if (ids && ids.length > 0) {
      // 여러 ID 삭제 (쿼리 파라미터)
      targetIds = ids;
    } else {
      return NextResponse.json(
        {success: false, error: "삭제할 상품 ID가 필요합니다."},
        {status: 400}
      );
    }

    if (targetIds.some((id) => isNaN(id))) {
      return NextResponse.json(
        {success: false, error: "유효하지 않은 상품 ID입니다."},
        {status: 400}
      );
    }

    // 여러 ID를 한 번에 삭제 (company_id 필터링)
    const result = await sql`
      DELETE FROM products
      WHERE id = ANY(${targetIds}::int[]) AND company_id = ${companyId}
      RETURNING id
    `;

    if (result.length === 0) {
      return NextResponse.json(
        {success: false, error: "삭제할 상품을 찾을 수 없습니다."},
        {status: 404}
      );
    }

    return NextResponse.json({
      success: true,
      message: `${result.length}개의 상품이 성공적으로 삭제되었습니다.`,
      deletedCount: result.length,
    });
  } catch (error: any) {
    console.error("상품 삭제 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
