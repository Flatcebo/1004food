import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {checkFileValidation} from "@/utils/fileValidation";
import {getCompanyIdFromRequest, getUserIdFromRequest} from "@/lib/company";

// 중복 파일명 체크 함수 (전역적으로 파일명만 체크, company_id만 필터링)
async function checkDuplicateFileName(
  fileName: string,
  companyId: number,
): Promise<boolean> {
  try {
    // 같은 회사 내에서 파일명이 이미 존재하는지 체크 (모든 세션, 모든 유저)
    const existingFiles = await sql`
      SELECT file_name FROM temp_files
      WHERE file_name = ${fileName} 
        AND company_id = ${companyId}
    `;

    return existingFiles.length > 0;
  } catch (error: any) {
    console.error("중복 파일명 체크 실패:", error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400},
      );
    }

    // user_id 추출 (필수)
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: "user_id가 필요합니다. 로그인 후 다시 시도해주세요.",
        },
        {status: 401},
      );
    }

    const body = await request.json();
    const {files, sessionId} = body;

    if (!sessionId) {
      return NextResponse.json(
        {success: false, error: "세션 ID가 필요합니다."},
        {status: 400},
      );
    }

    if (!files || !Array.isArray(files)) {
      return NextResponse.json(
        {success: false, error: "필수 데이터가 누락되었습니다."},
        {status: 400},
      );
    }

    // 현재 시간을 UTC로 저장 (PostgreSQL timestamp는 타임존 정보 없이 저장됨)
    // 표시할 때 한국 시간으로 변환하므로 여기서는 UTC로 저장
    const now = new Date();

    // 각 파일을 temp_files 테이블에 직접 저장
    const savePromises = files.map(async (file: any) => {
      const {
        id,
        fileName,
        rowCount,
        tableData,
        headerIndex,
        productCodeMap,
        productIdMap,
        vendorName,
        userId: fileUserId,
        originalHeader,
        originalData,
      } = file;

      if (!id || !fileName || !tableData) {
        console.warn("파일 데이터가 불완전합니다:", file);
        return null;
      }

      // 디버깅: 원본 헤더 확인
      console.log(`📋 파일 "${fileName}"의 originalHeader:`, originalHeader);
      console.log(
        `📋 파일 "${fileName}"의 originalHeader 타입:`,
        typeof originalHeader,
      );
      console.log(
        `📋 파일 "${fileName}"의 originalHeader 배열 여부:`,
        Array.isArray(originalHeader),
      );

      // 파일 객체의 userId가 있으면 우선 사용, 없으면 헤더의 userId 사용
      const finalUserId = fileUserId || userId;

      try {
        // 같은 file_id가 이미 존재하는지 확인 (업데이트인 경우)
        const existingFile = await sql`
          SELECT file_id FROM temp_files WHERE file_id = ${id}
        `;

        // 같은 file_id가 없으면 중복 파일명 체크 (전역적으로 파일명만 체크)
        if (existingFile.length === 0) {
          const isDuplicate = await checkDuplicateFileName(fileName, companyId);

          if (isDuplicate) {
            console.log(`❌ 중복 파일명 감지로 저장 거부: "${fileName}"`);
            return {
              error: "DUPLICATE_FILENAME",
              fileName: fileName,
              message: `파일명 "${fileName}"이 이미 존재합니다.`,
            };
          }
        }

        // 파일 검증 수행
        const validationResult = checkFileValidation({
          id,
          fileName,
          rowCount,
          tableData,
          headerIndex,
          productCodeMap,
        });

        // validation_status, user_id, original_header, original_table_data 컬럼이 없으면 추가
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
                            WHERE table_name = 'temp_files' AND column_name = 'original_header') THEN
                ALTER TABLE temp_files ADD COLUMN original_header JSONB;
              END IF;
              IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                            WHERE table_name = 'temp_files' AND column_name = 'original_table_data') THEN
                ALTER TABLE temp_files ADD COLUMN original_table_data JSONB;
              END IF;
            END
            $$;
          `;
        } catch (error: any) {
          // 컬럼 추가 실패는 무시 (이미 존재할 수 있음)
          console.log("컬럼 확인:", error.message);
        }

        // session_id 컬럼 존재 여부에 따라 다르게 처리
        let result;
        try {
          result = await sql`
            INSERT INTO temp_files (
              file_id, file_name, session_id, company_id, user_id, row_count,
              table_data, header_index, product_code_map, product_id_map,
              validation_status, vendor_name, original_header, original_table_data, created_at, updated_at
            )
            VALUES (
              ${id},
              ${fileName},
              ${sessionId},
              ${companyId},
              ${finalUserId || null},
              ${rowCount},
              ${JSON.stringify(tableData)},
              ${JSON.stringify(headerIndex || {})},
              ${JSON.stringify(productCodeMap || {})},
              ${JSON.stringify(productIdMap || {})},
              ${JSON.stringify(validationResult)},
              ${vendorName || null},
              ${
                originalHeader && Array.isArray(originalHeader)
                  ? JSON.stringify(originalHeader)
                  : null
              },
              ${JSON.stringify(originalData || tableData)},
              ${now.toISOString()}::timestamp,
              ${now.toISOString()}::timestamp
            )
            ON CONFLICT (file_id) DO UPDATE SET
              file_name = EXCLUDED.file_name,
              session_id = EXCLUDED.session_id,
              company_id = EXCLUDED.company_id,
              user_id = EXCLUDED.user_id,
              row_count = EXCLUDED.row_count,
              table_data = EXCLUDED.table_data,
              header_index = EXCLUDED.header_index,
              product_code_map = EXCLUDED.product_code_map,
              product_id_map = EXCLUDED.product_id_map,
              validation_status = EXCLUDED.validation_status,
              vendor_name = EXCLUDED.vendor_name,
              original_header = COALESCE(EXCLUDED.original_header, temp_files.original_header),
              original_table_data = COALESCE(EXCLUDED.original_table_data, temp_files.original_table_data),
              updated_at = ${now.toISOString()}::timestamp
            RETURNING id, created_at, original_header, original_table_data
          `;
        } catch (error: any) {
          // validation_status 또는 user_id 컬럼이 없으면 다시 시도 (컬럼 추가 후)
          if (
            error.message &&
            (error.message.includes(
              'column "validation_status" does not exist',
            ) ||
              error.message.includes('column "user_id" does not exist'))
          ) {
            // 컬럼 추가 시도
            try {
              if (
                error.message.includes(
                  'column "validation_status" does not exist',
                )
              ) {
                await sql`ALTER TABLE temp_files ADD COLUMN validation_status JSONB`;
              }
              if (error.message.includes('column "user_id" does not exist')) {
                await sql`ALTER TABLE temp_files ADD COLUMN user_id VARCHAR(255)`;
              }
            } catch (addError: any) {
              // 이미 존재할 수 있음
              console.log("컬럼 추가:", addError.message);
            }
            // 다시 저장 시도
            result = await sql`
              INSERT INTO temp_files (
                file_id, file_name, session_id, company_id, user_id, row_count,
                table_data, header_index, product_code_map, product_id_map,
                validation_status, vendor_name, original_header, original_table_data, created_at, updated_at
              )
              VALUES (
                ${id},
                ${fileName},
                ${sessionId},
                ${companyId},
                ${finalUserId || null},
                ${rowCount},
                ${JSON.stringify(tableData)},
                ${JSON.stringify(headerIndex || {})},
                ${JSON.stringify(productCodeMap || {})},
                ${JSON.stringify(productIdMap || {})},
                ${JSON.stringify(validationResult)},
                ${vendorName || null},
                ${
                  originalHeader && Array.isArray(originalHeader)
                    ? JSON.stringify(originalHeader)
                    : null
                },
                ${JSON.stringify(originalData || tableData)},
                ${now.toISOString()}::timestamp,
                ${now.toISOString()}::timestamp
              )
              ON CONFLICT (file_id) DO UPDATE SET
                file_name = EXCLUDED.file_name,
                session_id = EXCLUDED.session_id,
                company_id = EXCLUDED.company_id,
                user_id = EXCLUDED.user_id,
                row_count = EXCLUDED.row_count,
                table_data = EXCLUDED.table_data,
                header_index = EXCLUDED.header_index,
                product_code_map = EXCLUDED.product_code_map,
                product_id_map = EXCLUDED.product_id_map,
                validation_status = EXCLUDED.validation_status,
                vendor_name = EXCLUDED.vendor_name,
                original_header = COALESCE(EXCLUDED.original_header, temp_files.original_header),
                original_table_data = COALESCE(EXCLUDED.original_table_data, temp_files.original_table_data),
                updated_at = ${now.toISOString()}::timestamp
              RETURNING id, created_at, original_header, original_table_data
            `;
          } else if (
            error.message &&
            error.message.includes('column "session_id" does not exist')
          ) {
            // session_id 컬럼이 없으면 session_id 없이 저장 (company_id, user_id는 포함)
            // user_id 컬럼이 있는지 확인
            let hasUserIdColumn = true;
            try {
              const columnCheck = await sql`
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'temp_files' AND column_name = 'user_id'
              `;
              hasUserIdColumn = columnCheck.length > 0;
            } catch (e) {
              hasUserIdColumn = false;
            }

            if (hasUserIdColumn) {
              result = await sql`
                INSERT INTO temp_files (
                  file_id, file_name, company_id, user_id, row_count,
                  table_data, header_index, product_code_map, product_id_map,
                  validation_status, vendor_name, original_header, original_table_data, created_at, updated_at
                )
                VALUES (
                ${id},
                ${fileName},
                ${companyId},
                ${finalUserId || null},
                ${rowCount},
                  ${JSON.stringify(tableData)},
                  ${JSON.stringify(headerIndex || {})},
                  ${JSON.stringify(productCodeMap || {})},
                  ${JSON.stringify(productIdMap || {})},
                  ${JSON.stringify(validationResult)},
                  ${vendorName || null},
                  ${
                    originalHeader && Array.isArray(originalHeader)
                      ? JSON.stringify(originalHeader)
                      : null
                  },
                  ${JSON.stringify(originalData || tableData)},
                  ${now.toISOString()}::timestamp,
                  ${now.toISOString()}::timestamp
                )
                ON CONFLICT (file_id) DO UPDATE SET
                  file_name = EXCLUDED.file_name,
                  company_id = EXCLUDED.company_id,
                  user_id = EXCLUDED.user_id,
                  row_count = EXCLUDED.row_count,
                  table_data = EXCLUDED.table_data,
                  header_index = EXCLUDED.header_index,
                  product_code_map = EXCLUDED.product_code_map,
                  product_id_map = EXCLUDED.product_id_map,
                  validation_status = EXCLUDED.validation_status,
                  vendor_name = EXCLUDED.vendor_name,
                  original_header = COALESCE(EXCLUDED.original_header, temp_files.original_header),
                  original_table_data = COALESCE(EXCLUDED.original_table_data, temp_files.original_table_data),
                  updated_at = ${now.toISOString()}::timestamp
                RETURNING id, created_at, original_header, original_table_data
              `;
            } else {
              result = await sql`
                INSERT INTO temp_files (
                  file_id, file_name, company_id, row_count,
                  table_data, header_index, product_code_map, product_id_map,
                  validation_status, vendor_name, original_header, original_table_data, created_at, updated_at
                )
                VALUES (
                  ${id},
                  ${fileName},
                  ${companyId},
                  ${rowCount},
                  ${JSON.stringify(tableData)},
                  ${JSON.stringify(headerIndex || {})},
                  ${JSON.stringify(productCodeMap || {})},
                  ${JSON.stringify(productIdMap || {})},
                  ${JSON.stringify(validationResult)},
                  ${vendorName || null},
                  ${
                    originalHeader && Array.isArray(originalHeader)
                      ? JSON.stringify(originalHeader)
                      : null
                  },
                  ${JSON.stringify(originalData || tableData)},
                  ${now.toISOString()}::timestamp,
                  ${now.toISOString()}::timestamp
                )
                ON CONFLICT (file_id) DO UPDATE SET
                  file_name = EXCLUDED.file_name,
                  company_id = EXCLUDED.company_id,
                  row_count = EXCLUDED.row_count,
                  table_data = EXCLUDED.table_data,
                  header_index = EXCLUDED.header_index,
                  product_code_map = EXCLUDED.product_code_map,
                  product_id_map = EXCLUDED.product_id_map,
                  validation_status = EXCLUDED.validation_status,
                  vendor_name = EXCLUDED.vendor_name,
                  original_header = COALESCE(EXCLUDED.original_header, temp_files.original_header),
                  original_table_data = COALESCE(EXCLUDED.original_table_data, temp_files.original_table_data),
                  updated_at = ${now.toISOString()}::timestamp
                RETURNING id, created_at, original_header, original_table_data
              `;
            }
          } else {
            throw error;
          }
        }
        // 디버깅: 저장된 원본 헤더 확인
        console.log(`✅ 파일 "${fileName}" 저장 완료:`, {
          id: result[0].id,
          savedOriginalHeader: result[0].original_header,
        });

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
      (r) => r.error === "DUPLICATE_FILENAME",
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
        {status: 409},
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
      {status: 500},
    );
  }
}
