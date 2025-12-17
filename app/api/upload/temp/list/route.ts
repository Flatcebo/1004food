import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    // 모든 임시 파일 조회 (세션 구분 없음)
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
      FROM temp_files
      ORDER BY created_at DESC
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

