import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {sessionId, files} = body;

    if (!sessionId || !files || !Array.isArray(files)) {
      return NextResponse.json(
        {success: false, error: "필수 데이터가 누락되었습니다."},
        {status: 400}
      );
    }

    // 한국 시간(KST) 생성
    const koreaTime = new Date(Date.now() + 9 * 60 * 60 * 1000);

    // temp_uploads에 세션 생성 또는 업데이트
    const tempUploadResult = await sql`
      INSERT INTO temp_uploads (session_id, created_at, updated_at)
      VALUES (${sessionId}, ${koreaTime.toISOString()}::timestamp, ${koreaTime.toISOString()}::timestamp)
      ON CONFLICT (session_id) DO UPDATE SET
        updated_at = ${koreaTime.toISOString()}::timestamp
      RETURNING id
    `;

    const tempUploadId = tempUploadResult[0].id;

    // 각 파일을 temp_upload_files에 저장
    const savePromises = files.map(async (file: any) => {
      const {id, fileName, rowCount, tableData, headerIndex, productCodeMap} = file;

      if (!id || !fileName || !tableData) {
        console.warn("파일 데이터가 불완전합니다:", file);
        return null;
      }

      try {
        const result = await sql`
          INSERT INTO temp_upload_files (
            temp_upload_id, file_id, file_name, row_count,
            table_data, header_index, product_code_map,
            created_at, updated_at
          )
          VALUES (
            ${tempUploadId},
            ${id},
            ${fileName},
            ${rowCount},
            ${JSON.stringify(tableData)},
            ${JSON.stringify(headerIndex || {})},
            ${JSON.stringify(productCodeMap || {})},
            ${koreaTime.toISOString()}::timestamp,
            ${koreaTime.toISOString()}::timestamp
          )
          ON CONFLICT (file_id) DO UPDATE SET
            file_name = EXCLUDED.file_name,
            row_count = EXCLUDED.row_count,
            table_data = EXCLUDED.table_data,
            header_index = EXCLUDED.header_index,
            product_code_map = EXCLUDED.product_code_map,
            updated_at = ${koreaTime.toISOString()}::timestamp
          RETURNING id
        `;
        return result[0];
      } catch (error: any) {
        console.error(`파일 ${fileName} 저장 실패:`, error);
        return null;
      }
    });

    const results = await Promise.all(savePromises);
    const successCount = results.filter((r) => r !== null).length;

    return NextResponse.json({
      success: true,
      tempUploadId,
      savedCount: successCount,
      totalCount: files.length,
      message: `${successCount}/${files.length}개 파일이 임시 저장되었습니다.`,
    });
  } catch (error: any) {
    console.error("임시 저장 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

