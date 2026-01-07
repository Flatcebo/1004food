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

    const body = await request.json();
    const {rowIds} = body;

    if (!rowIds || !Array.isArray(rowIds) || rowIds.length === 0) {
      return NextResponse.json(
        {success: false, error: "rowIds 배열이 필요합니다."},
        {status: 400}
      );
    }

    // 선택된 행들을 삭제 (company_id 필터링)
    const result = await sql`
      DELETE FROM upload_rows ur
      USING uploads u
      WHERE ur.upload_id = u.id 
        AND ur.id = ANY(${rowIds}::int[])
        AND u.company_id = ${companyId}
      RETURNING ur.id
    `;

    if (result.length === 0) {
      return NextResponse.json(
        {success: false, error: "삭제할 데이터를 찾을 수 없습니다."},
        {status: 404}
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
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
