import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

// 중복 파일명 체크 함수 (세션별)
async function checkDuplicateFileName(fileName: string, sessionId: string): Promise<boolean> {
  try {
    const existingFiles = await sql`
      SELECT file_name FROM temp_files
      WHERE file_name = ${fileName} AND COALESCE(session_id, 'default-session') = ${sessionId}
    `;

    return existingFiles.length > 0;
  } catch (error: any) {
    // session_id 컬럼이 없으면 파일명만으로 체크
    if (error.message && error.message.includes('column "session_id" does not exist')) {
      const existingFiles = await sql`
        SELECT file_name FROM temp_files WHERE file_name = ${fileName}
      `;
      return existingFiles.length > 0;
    }
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {files, sessionId} = body;

    if (!sessionId) {
      return NextResponse.json(
        {success: false, error: "세션 ID가 필요합니다."},
        {status: 400}
      );
    }

    if (!files || !Array.isArray(files)) {
      return NextResponse.json(
        {success: false, error: "필수 데이터가 누락되었습니다."},
        {status: 400}
      );
    }

    // 한국 시간(KST) 생성
    const koreaTime = new Date(Date.now() + 9 * 60 * 60 * 1000);

    // 각 파일을 temp_files 테이블에 직접 저장
    const savePromises = files.map(async (file: any) => {
      const {id, fileName, rowCount, tableData, headerIndex, productCodeMap} =
        file;

      if (!id || !fileName || !tableData) {
        console.warn("파일 데이터가 불완전합니다:", file);
        return null;
      }

      try {
        // 중복 파일명 체크 (세션별)
        const isDuplicate = await checkDuplicateFileName(fileName, sessionId);

        if (isDuplicate) {
          console.log(`❌ 중복 파일명 감지로 저장 거부: "${fileName}"`);
          return {
            error: "DUPLICATE_FILENAME",
            fileName: fileName,
            message: `파일명 "${fileName}"이 이미 존재합니다.`,
          };
        }

        // session_id 컬럼 존재 여부에 따라 다르게 처리
        let result;
        try {
          result = await sql`
            INSERT INTO temp_files (
              file_id, file_name, session_id, row_count,
              table_data, header_index, product_code_map,
              created_at, updated_at
            )
            VALUES (
              ${id},
              ${fileName},
              ${sessionId},
              ${rowCount},
              ${JSON.stringify(tableData)},
              ${JSON.stringify(headerIndex || {})},
              ${JSON.stringify(productCodeMap || {})},
              ${koreaTime.toISOString()}::timestamp,
              ${koreaTime.toISOString()}::timestamp
            )
            ON CONFLICT (file_id) DO UPDATE SET
              file_name = EXCLUDED.file_name,
              session_id = EXCLUDED.session_id,
              row_count = EXCLUDED.row_count,
              table_data = EXCLUDED.table_data,
              header_index = EXCLUDED.header_index,
              product_code_map = EXCLUDED.product_code_map,
              updated_at = ${koreaTime.toISOString()}::timestamp
            RETURNING id
          `;
        } catch (error: any) {
          // session_id 컬럼이 없으면 session_id 없이 저장
          if (error.message && error.message.includes('column "session_id" does not exist')) {
            result = await sql`
              INSERT INTO temp_files (
                file_id, file_name, row_count,
                table_data, header_index, product_code_map,
                created_at, updated_at
              )
              VALUES (
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
          } else {
            throw error;
          }
        }
        return {
          ...result[0],
          fileName: fileName,
          success: true,
        };
      } catch (error: any) {
        console.error(`파일 ${fileName} 저장 실패:`, error);
        return null;
      }
    });

    const results = await Promise.all(savePromises);
    const validResults = results.filter((r) => r !== null);
    const successResults = validResults.filter((r: any) => r.success);
    const duplicateResults = validResults.filter(
      (r) => r.error === "DUPLICATE_FILENAME"
    );

    const successCount = successResults.length;
    const duplicateCount = duplicateResults.length;

    if (duplicateCount > 0) {
      const duplicateFiles = duplicateResults.map((r) => r.fileName);

      return NextResponse.json(
        {
          success: false,
          error: "DUPLICATE_FILENAMES",
          message: `${duplicateCount}개 파일이 중복된 파일명으로 인해 저장되지 않았습니다.`,
          duplicateFiles,
          savedCount: successCount,
          totalCount: files.length,
        },
        {status: 409}
      ); // 409 Conflict
    }

    return NextResponse.json({
      success: true,
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
