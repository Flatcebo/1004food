import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const {searchParams} = new URL(request.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json(
        {success: false, error: "sessionId가 필요합니다."},
        {status: 400}
      );
    }

    // 세션 ID로 temp_uploads 조회
    const tempUploadResult = await sql`
      SELECT id FROM temp_uploads
      WHERE session_id = ${sessionId}
    `;

    if (tempUploadResult.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        message: "임시 저장된 파일이 없습니다.",
      });
    }

    const tempUploadId = tempUploadResult[0].id;

    // 해당 세션의 모든 파일 조회
    const files = await sql`
      SELECT 
        file_id as id,
        file_name as "fileName",
        row_count as "rowCount",
        table_data as "tableData",
        header_index as "headerIndex",
        product_code_map as "productCodeMap",
        is_confirmed as "isConfirmed",
        created_at,
        updated_at
      FROM temp_upload_files
      WHERE temp_upload_id = ${tempUploadId}
      ORDER BY created_at ASC
    `;

    return NextResponse.json({
      success: true,
      data: files,
      count: files.length,
    });
  } catch (error: any) {
    console.error("임시 파일 목록 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

