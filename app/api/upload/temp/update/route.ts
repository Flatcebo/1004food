import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {checkFileValidation} from "@/utils/fileValidation";

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {fileId, tableData, headerIndex, productCodeMap, isConfirmed} = body;

    console.log("📝 API 업데이트 요청 받음:", {
      fileId,
      tableDataLength: tableData ? tableData.length : 0,
      rowCount: tableData ? tableData.length - 1 : 0,
      isConfirmed,
    });

    if (!fileId) {
      return NextResponse.json(
        {success: false, error: "fileId가 필요합니다."},
        {status: 400}
      );
    }

    // 한국 시간(KST) 생성
    const koreaTime = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const rowCount = Array.isArray(tableData) ? tableData.length - 1 : 0;

    console.log("✅ 업데이트할 데이터:", {
      rowCount,
      isConfirmed: isConfirmed ?? false,
      tableDataRows: tableData?.length,
    });

    // validation_status 컬럼이 없으면 추가
    try {
      await sql`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'temp_files' AND column_name = 'validation_status') THEN
            ALTER TABLE temp_files ADD COLUMN validation_status JSONB;
          END IF;
        END
        $$;
      `;
    } catch (error: any) {
      // 컬럼 추가 실패는 무시 (이미 존재할 수 있음)
      console.log("validation_status 컬럼 확인:", error.message);
    }

    // 파일 검증 수행
    const validationResult = checkFileValidation({
      id: fileId,
      fileName: "",
      rowCount,
      tableData,
      headerIndex,
      productCodeMap,
    });

    // postgres.js 템플릿 리터럴 사용 (더 안전함)
    let result;
    try {
      result = await sql`
        UPDATE temp_files
        SET 
          table_data = ${JSON.stringify(tableData)},
          row_count = ${rowCount},
          header_index = ${JSON.stringify(headerIndex)},
          product_code_map = ${JSON.stringify(productCodeMap)},
          validation_status = ${JSON.stringify(validationResult)},
          is_confirmed = ${isConfirmed ?? false},
          updated_at = ${koreaTime.toISOString()}
        WHERE file_id = ${fileId}
        RETURNING *
      `;
    } catch (error: any) {
      // validation_status 컬럼이 없으면 컬럼 추가 후 다시 시도
      if (error.message && error.message.includes('column "validation_status" does not exist')) {
        try {
          await sql`ALTER TABLE temp_files ADD COLUMN validation_status JSONB`;
        } catch (addError: any) {
          // 이미 존재할 수 있음
          console.log("validation_status 컬럼 추가:", addError.message);
        }
        // 다시 업데이트 시도
        result = await sql`
          UPDATE temp_files
          SET 
            table_data = ${JSON.stringify(tableData)},
            row_count = ${rowCount},
            header_index = ${JSON.stringify(headerIndex)},
            product_code_map = ${JSON.stringify(productCodeMap)},
            validation_status = ${JSON.stringify(validationResult)},
            is_confirmed = ${isConfirmed ?? false},
            updated_at = ${koreaTime.toISOString()}
          WHERE file_id = ${fileId}
          RETURNING *
        `;
      } else {
        throw error;
      }
    }

    console.log("✅ 쿼리 실행 완료. 결과:", {
      resultLength: result.length,
      fileId: result[0]?.file_id,
      rowCount: result[0]?.row_count,
      isConfirmed: result[0]?.is_confirmed,
    });

    if (!result || result.length === 0) {
      console.error("❌ 파일을 찾을 수 없음. fileId:", fileId);
      return NextResponse.json(
        {success: false, error: "파일을 찾을 수 없습니다."},
        {status: 404}
      );
    }

    return NextResponse.json({
      success: true,
      data: result[0],
      message: "파일이 성공적으로 업데이트되었습니다.",
    });
  } catch (error: any) {
    console.error("❌ 임시 파일 업데이트 실패:", error);
    console.error("❌ 에러 상세:", {
      message: error.message,
      stack: error.stack,
    });
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

