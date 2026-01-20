import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {checkFileValidation} from "@/utils/fileValidation";
import {getCompanyIdFromRequest, getUserIdFromRequest} from "@/lib/company";

export async function PUT(request: NextRequest) {
  try {
    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400}
      );
    }

    // user_id 추출
    const userId = await getUserIdFromRequest(request);

    const body = await request.json();
    const {
      fileId,
      tableData,
      headerIndex,
      productCodeMap,
      productIdMap,
      vendorName,
      mallId,
      isConfirmed,
    } = body;

    console.log("📝 API 업데이트 요청 받음:", {
      fileId,
      tableDataLength: tableData ? tableData.length : 0,
      rowCount: tableData ? tableData.length - 1 : 0,
      vendorName,
      mallId,
      isConfirmed,
    });

    if (!fileId) {
      return NextResponse.json(
        {success: false, error: "fileId가 필요합니다."},
        {status: 400}
      );
    }

    // 현재 시간을 UTC로 저장 (PostgreSQL timestamp는 타임존 정보 없이 저장됨)
    // 표시할 때 한국 시간으로 변환하므로 여기서는 UTC로 저장
    const now = new Date();
    const rowCount = Array.isArray(tableData) ? tableData.length - 1 : 0;

    console.log("✅ 업데이트할 데이터:", {
      rowCount,
      isConfirmed: isConfirmed ?? false,
      tableDataRows: tableData?.length,
    });

    // validation_status, vendor_name, product_id_map, user_id, mall_id 컬럼이 없으면 추가
    try {
      await sql`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'temp_files' AND column_name = 'validation_status') THEN
            ALTER TABLE temp_files ADD COLUMN validation_status JSONB;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'temp_files' AND column_name = 'vendor_name') THEN
            ALTER TABLE temp_files ADD COLUMN vendor_name VARCHAR(500);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'temp_files' AND column_name = 'product_id_map') THEN
            ALTER TABLE temp_files ADD COLUMN product_id_map JSONB;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'temp_files' AND column_name = 'user_id') THEN
            ALTER TABLE temp_files ADD COLUMN user_id VARCHAR(255);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'temp_files' AND column_name = 'mall_id') THEN
            ALTER TABLE temp_files ADD COLUMN mall_id INTEGER REFERENCES mall(id) ON DELETE SET NULL;
          END IF;
        END
        $$;
      `;
    } catch (error: any) {
      // 컬럼 추가 실패는 무시 (이미 존재할 수 있음)
      console.log("컬럼 확인:", error.message);
    }

    // user_id 컬럼 존재 여부 확인
    let hasUserIdColumn = false;
    try {
      const columnCheck = await sql`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'temp_files' AND column_name = 'user_id'
      `;
      hasUserIdColumn = columnCheck.length > 0;
    } catch (error) {
      // 테이블이 없거나 다른 에러인 경우 무시
      console.log("컬럼 확인 실패:", error);
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

    // postgres.js 템플릿 리터럴 사용 (더 안전함, company_id, user_id 필터링)
    let result;
    try {
      if (userId && hasUserIdColumn) {
        result = await sql`
          UPDATE temp_files
          SET 
            table_data = ${JSON.stringify(tableData)},
            row_count = ${rowCount},
            header_index = ${JSON.stringify(headerIndex)},
            product_code_map = ${JSON.stringify(productCodeMap)},
            product_id_map = ${JSON.stringify(productIdMap || {})},
            validation_status = ${JSON.stringify(validationResult)},
            vendor_name = ${vendorName || null},
            mall_id = ${mallId || null},
            user_id = COALESCE(user_id, ${userId}),
            is_confirmed = ${isConfirmed ?? false},
                updated_at = ${now.toISOString()}
          WHERE file_id = ${fileId} AND company_id = ${companyId} AND (user_id = ${userId} OR user_id IS NULL)
          RETURNING *
        `;
      } else {
        result = await sql`
          UPDATE temp_files
          SET 
            table_data = ${JSON.stringify(tableData)},
            row_count = ${rowCount},
            header_index = ${JSON.stringify(headerIndex)},
            product_code_map = ${JSON.stringify(productCodeMap)},
            product_id_map = ${JSON.stringify(productIdMap || {})},
            validation_status = ${JSON.stringify(validationResult)},
            vendor_name = ${vendorName || null},
            mall_id = ${mallId || null},
            is_confirmed = ${isConfirmed ?? false},
                updated_at = ${now.toISOString()}
          WHERE file_id = ${fileId} AND company_id = ${companyId}
          RETURNING *
        `;
      }
    } catch (error: any) {
      // validation_status 컬럼이 없으면 컬럼 추가 후 다시 시도
      if (
        error.message &&
        error.message.includes('column "validation_status" does not exist')
      ) {
        try {
          await sql`ALTER TABLE temp_files ADD COLUMN validation_status JSONB`;
        } catch (addError: any) {
          // 이미 존재할 수 있음
          console.log("validation_status 컬럼 추가:", addError.message);
        }
        // 다시 업데이트 시도
        if (userId && hasUserIdColumn) {
          result = await sql`
            UPDATE temp_files
            SET 
              table_data = ${JSON.stringify(tableData)},
              row_count = ${rowCount},
              header_index = ${JSON.stringify(headerIndex)},
              product_code_map = ${JSON.stringify(productCodeMap)},
              product_id_map = ${JSON.stringify(productIdMap || {})},
              validation_status = ${JSON.stringify(validationResult)},
              vendor_name = ${vendorName || null},
              mall_id = ${mallId || null},
              user_id = COALESCE(user_id, ${userId}),
              is_confirmed = ${isConfirmed ?? false},
                updated_at = ${now.toISOString()}
            WHERE file_id = ${fileId} AND company_id = ${companyId} AND (user_id = ${userId} OR user_id IS NULL)
            RETURNING *
          `;
        } else {
          result = await sql`
            UPDATE temp_files
            SET 
              table_data = ${JSON.stringify(tableData)},
              row_count = ${rowCount},
              header_index = ${JSON.stringify(headerIndex)},
              product_code_map = ${JSON.stringify(productCodeMap)},
              product_id_map = ${JSON.stringify(productIdMap || {})},
              validation_status = ${JSON.stringify(validationResult)},
              vendor_name = ${vendorName || null},
              mall_id = ${mallId || null},
              is_confirmed = ${isConfirmed ?? false},
                updated_at = ${now.toISOString()}
            WHERE file_id = ${fileId} AND company_id = ${companyId}
            RETURNING *
          `;
        }
      } else {
        throw error;
      }
    }

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
