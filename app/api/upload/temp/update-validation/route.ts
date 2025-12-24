import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {checkFileValidation} from "@/utils/fileValidation";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {fileId} = body;

    if (!fileId) {
      return NextResponse.json(
        {success: false, error: "파일 ID가 필요합니다."},
        {status: 400}
      );
    }

    // 파일 데이터 가져오기
    const files = await sql`
      SELECT
        file_id,
        file_name,
        row_count,
        table_data,
        header_index,
        product_code_map
      FROM temp_files
      WHERE file_id = ${fileId}
    ` as any[];

    if (files.length === 0) {
      return NextResponse.json(
        {success: false, error: "파일을 찾을 수 없습니다."},
        {status: 404}
      );
    }

    const file = files[0];

    // 파일 검증 수행
    const validationResult = checkFileValidation({
      id: file.file_id,
      fileName: file.file_name,
      rowCount: file.row_count,
      tableData: file.table_data,
      headerIndex: file.header_index,
      productCodeMap: file.product_code_map,
    });

    // 검증 상태 업데이트
    await sql`
      UPDATE temp_files
      SET validation_status = ${JSON.stringify(validationResult)},
          updated_at = CURRENT_TIMESTAMP
      WHERE file_id = ${fileId}
    `;

    return NextResponse.json({
      success: true,
      validationStatus: validationResult,
    });
  } catch (error: any) {
    console.error("검증 상태 업데이트 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

