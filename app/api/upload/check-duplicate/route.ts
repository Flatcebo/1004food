import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

export async function POST(request: NextRequest) {
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
    const {fileName} = body;

    if (!fileName) {
      return NextResponse.json(
        {success: false, error: "파일명이 필요합니다."},
        {status: 400}
      );
    }

    // uploads 테이블에서 파일명 중복 체크
    const existingFile = await sql`
      SELECT file_name FROM uploads
      WHERE file_name = ${fileName} AND company_id = ${companyId}
      LIMIT 1
    `;

    const isDuplicate = existingFile.length > 0;

    return NextResponse.json({
      success: true,
      isDuplicate,
      fileName,
    });
  } catch (error: any) {
    console.error("파일명 중복 체크 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
