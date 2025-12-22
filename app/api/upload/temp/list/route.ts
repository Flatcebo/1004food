import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const {searchParams} = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    let files: any[] = [];
    if (sessionId === 'all') {
      // 모든 세션의 파일 조회
      files = await sql`
        SELECT
          file_id as id,
          file_name as "fileName",
          'all-sessions' as "sessionId",
          row_count as "rowCount",
          table_data as "tableData",
          header_index as "headerIndex",
          product_code_map as "productCodeMap",
          is_confirmed as "isConfirmed",
          created_at,
          updated_at
        FROM temp_files
        ORDER BY created_at DESC
      ` as any[];
    } else if (sessionId) {
      // 임시 해결: session_id 컬럼 문제로 모든 파일을 반환
      files = await sql`
        SELECT
          file_id as id,
          file_name as "fileName",
          'default-session' as "sessionId",
          row_count as "rowCount",
          table_data as "tableData",
          header_index as "headerIndex",
          product_code_map as "productCodeMap",
          is_confirmed as "isConfirmed",
          created_at,
          updated_at
        FROM temp_files
        ORDER BY created_at DESC
      ` as any[];
    }
    // else: files는 이미 빈 배열로 초기화됨

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

