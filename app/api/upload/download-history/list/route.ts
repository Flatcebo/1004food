import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest, getUserIdFromRequest} from "@/lib/company";

/**
 * 다운로드 히스토리 조회 API
 * GET /api/upload/download-history/list
 */
export async function GET(request: NextRequest) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    const userId = await getUserIdFromRequest(request);

    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400}
      );
    }

    if (!userId) {
      return NextResponse.json(
        {success: false, error: "user_id가 필요합니다."},
        {status: 400}
      );
    }

    // 쿼리 파라미터에서 limit 가져오기 (기본값 100)
    const {searchParams} = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    // 해당 사용자의 히스토리 조회 (최신 순)
    const history = await sql`
      SELECT 
        id,
        vendor_name,
        file_name,
        form_type,
        upload_id,
        date_filter,
        downloaded_at
      FROM download_history
      WHERE user_id = ${userId} AND company_id = ${companyId}
      ORDER BY downloaded_at DESC
      LIMIT ${limit}
    `;

    return NextResponse.json({
      success: true,
      data: history,
    });
  } catch (error: any) {
    console.error("히스토리 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

/**
 * 다운로드 히스토리 삭제 API
 * DELETE /api/upload/download-history/list?id=123
 */
export async function DELETE(request: NextRequest) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    const userId = await getUserIdFromRequest(request);

    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400}
      );
    }

    if (!userId) {
      return NextResponse.json(
        {success: false, error: "user_id가 필요합니다."},
        {status: 400}
      );
    }

    const {searchParams} = new URL(request.url);
    const id = searchParams.get("id");

    if (id) {
      // 특정 히스토리 삭제
      await sql`
        DELETE FROM download_history
        WHERE id = ${parseInt(id, 10)} 
          AND user_id = ${userId} 
          AND company_id = ${companyId}
      `;
    } else {
      // 전체 히스토리 삭제
      await sql`
        DELETE FROM download_history
        WHERE user_id = ${userId} AND company_id = ${companyId}
      `;
    }

    return NextResponse.json({
      success: true,
      message: id ? "히스토리가 삭제되었습니다." : "전체 히스토리가 삭제되었습니다.",
    });
  } catch (error: any) {
    console.error("히스토리 삭제 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
