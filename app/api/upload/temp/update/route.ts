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

    // user_id 추출 (필수)
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        {success: false, error: "user_id가 필요합니다. 로그인 후 다시 시도해주세요."},
        {status: 401}
      );
    }

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
    // user_id는 필수이므로 항상 user_id 필터링 사용
    let result;
    try {
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
        // 다시 업데이트 시도 (user_id 필수)
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
        throw error;
      }
    }

    if (!result || result.length === 0) {
      console.error("❌ 파일을 찾을 수 없음. fileId:", fileId);
      
      // 이미 정식으로 저장된 파일인지 확인 (file_id 패턴으로 uploads 테이블 검색)
      // file_id에서 파일명을 추출하기 어려우므로, 최근 저장된 파일이 있는지 확인
      try {
        // 최근 5분 이내에 저장된 파일이 있는지 확인 (같은 company_id)
        const recentSaved = await sql`
          SELECT id, file_name, created_at
          FROM uploads
          WHERE company_id = ${companyId}
          AND created_at > NOW() - INTERVAL '5 minutes'
          ORDER BY created_at DESC
          LIMIT 5
        `;
        
        if (recentSaved.length > 0) {
          console.log("ℹ️ 최근 저장된 파일 발견:", recentSaved.map((f: any) => f.file_name));
          return NextResponse.json(
            {
              success: false, 
              error: "ALREADY_SAVED",
              message: "이 파일은 이미 저장되었습니다. 페이지를 새로고침해주세요.",
              recentFiles: recentSaved.map((f: any) => ({
                id: f.id,
                fileName: f.file_name,
                createdAt: f.created_at
              }))
            },
            {status: 409}
          );
        }
      } catch (checkError) {
        console.error("저장된 파일 확인 실패:", checkError);
      }
      
      return NextResponse.json(
        {success: false, error: "파일을 찾을 수 없습니다. 파일이 삭제되었거나 이미 저장되었을 수 있습니다."},
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
