import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest, getUserIdFromRequest} from "@/lib/company";

/**
 * 다운로드 히스토리 저장 API
 * POST /api/upload/download-history/save
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const {vendorName, fileName, formType, uploadId, dateFilter} = body;

    if (!fileName || !formType) {
      return NextResponse.json(
        {success: false, error: "파일명과 양식 타입이 필요합니다."},
        {status: 400}
      );
    }

    // 히스토리 저장
    const result = await sql`
      INSERT INTO download_history (
        user_id,
        company_id,
        vendor_name,
        file_name,
        form_type,
        upload_id,
        date_filter
      ) VALUES (
        ${userId},
        ${companyId},
        ${vendorName || null},
        ${fileName},
        ${formType},
        ${uploadId || null},
        ${dateFilter || null}
      )
      RETURNING id, downloaded_at
    `;

    return NextResponse.json({
      success: true,
      data: result[0],
    });
  } catch (error: any) {
    console.error("히스토리 저장 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
