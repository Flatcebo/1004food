import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest, getUserIdFromRequest} from "@/lib/company";

export async function GET(request: NextRequest) {
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

    // 관리자 권한 확인
    let isAdmin = false;
    try {
      const userResult = await sql`
        SELECT grade FROM users WHERE id = ${userId} AND company_id = ${companyId}
      `;
      if (userResult.length > 0 && userResult[0].grade === "관리자") {
        isAdmin = true;
      }
    } catch (error) {
      console.error("사용자 권한 확인 실패:", error);
    }

    const {searchParams} = new URL(request.url);
    const sessionId = searchParams.get("sessionId");

    // validation_status, vendor_name, user_id 컬럼이 없으면 추가
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
        END
        $$;
      `;
    } catch (error: any) {
      // 컬럼 추가 실패는 무시 (이미 존재할 수 있음)
      console.log("컬럼 확인:", error.message);
    }

    let files: any[] = [];
    try {
      if (sessionId === "all") {
        // 모든 세션의 파일 조회
        // 관리자는 모든 파일 조회, 일반 사용자는 본인 파일만 조회
        if (isAdmin) {
          // 관리자: company_id만 필터링하여 모든 파일 조회
          files = (await sql`
            SELECT
              file_id as id,
              file_name as "fileName",
              'all-sessions' as "sessionId",
              row_count as "rowCount",
              table_data as "tableData",
              header_index as "headerIndex",
              product_code_map as "productCodeMap",
              product_id_map as "productIdMap",
              validation_status as "validationStatus",
              is_confirmed as "isConfirmed",
              vendor_name as "vendorName",
              original_header as "originalHeader",
              created_at as "createdAt",
              updated_at
            FROM temp_files
            WHERE company_id = ${companyId}
            ORDER BY created_at DESC
          `) as any[];
        } else if (userId) {
          // 일반 사용자: 본인 파일만 조회
          files = (await sql`
            SELECT
              file_id as id,
              file_name as "fileName",
              'all-sessions' as "sessionId",
              row_count as "rowCount",
              table_data as "tableData",
              header_index as "headerIndex",
              product_code_map as "productCodeMap",
              product_id_map as "productIdMap",
              validation_status as "validationStatus",
              is_confirmed as "isConfirmed",
              vendor_name as "vendorName",
              original_header as "originalHeader",
              created_at as "createdAt",
              updated_at
            FROM temp_files
            WHERE company_id = ${companyId} AND user_id = ${userId}
            ORDER BY created_at DESC
          `) as any[];
        } else {
          // user_id는 위에서 필수 체크됨, 이 분기는 도달하지 않음
          return NextResponse.json(
            {success: false, error: "user_id가 필요합니다."},
            {status: 401}
          );
        }
      } else if (sessionId) {
        // 특정 세션의 파일 조회
        // 관리자는 모든 파일 조회, 일반 사용자는 본인 파일만 조회
        if (isAdmin) {
          // 관리자: company_id와 session_id만 필터링하여 모든 파일 조회
          files = (await sql`
            SELECT
              file_id as id,
              file_name as "fileName",
              COALESCE(session_id, 'default-session') as "sessionId",
              row_count as "rowCount",
              table_data as "tableData",
              header_index as "headerIndex",
              product_code_map as "productCodeMap",
              product_id_map as "productIdMap",
              validation_status as "validationStatus",
              is_confirmed as "isConfirmed",
              vendor_name as "vendorName",
              original_header as "originalHeader",
              created_at as "createdAt",
              updated_at
            FROM temp_files
            WHERE company_id = ${companyId}
            AND COALESCE(session_id, 'default-session') = ${sessionId}
            ORDER BY created_at DESC
          `) as any[];
        } else if (userId) {
          // 일반 사용자: 본인 파일만 조회
          files = (await sql`
            SELECT
              file_id as id,
              file_name as "fileName",
              COALESCE(session_id, 'default-session') as "sessionId",
              row_count as "rowCount",
              table_data as "tableData",
              header_index as "headerIndex",
              product_code_map as "productCodeMap",
              product_id_map as "productIdMap",
              validation_status as "validationStatus",
              is_confirmed as "isConfirmed",
              vendor_name as "vendorName",
              original_header as "originalHeader",
              created_at as "createdAt",
              updated_at
            FROM temp_files
            WHERE company_id = ${companyId}
            AND user_id = ${userId}
            AND COALESCE(session_id, 'default-session') = ${sessionId}
            ORDER BY created_at DESC
          `) as any[];
        } else {
          // user_id는 위에서 필수 체크됨, 이 분기는 도달하지 않음
          return NextResponse.json(
            {success: false, error: "user_id가 필요합니다."},
            {status: 401}
          );
        }
      }
    } catch (error: any) {
      // validation_status 또는 user_id 컬럼이 없으면 컬럼 없이 조회
      if (
        error.message &&
        (error.message.includes('column "validation_status" does not exist') ||
          error.message.includes('column "user_id" does not exist'))
      ) {
        // user_id 컬럼이 없으면 user_id 필터링 없이 조회 (관리자 권한과 관계없이 company_id만 필터링)
        if (sessionId === "all") {
          files = (await sql`
            SELECT
              file_id as id,
              file_name as "fileName",
              'all-sessions' as "sessionId",
              row_count as "rowCount",
              table_data as "tableData",
              header_index as "headerIndex",
              product_code_map as "productCodeMap",
              product_id_map as "productIdMap",
              NULL as "validationStatus",
              is_confirmed as "isConfirmed",
              vendor_name as "vendorName",
              original_header as "originalHeader",
              created_at as "createdAt",
              updated_at
            FROM temp_files
            WHERE company_id = ${companyId}
            ORDER BY created_at DESC
          `) as any[];
        } else if (sessionId) {
          files = (await sql`
            SELECT
              file_id as id,
              file_name as "fileName",
              COALESCE(session_id, 'default-session') as "sessionId",
              row_count as "rowCount",
              table_data as "tableData",
              header_index as "headerIndex",
              product_code_map as "productCodeMap",
              product_id_map as "productIdMap",
              NULL as "validationStatus",
              is_confirmed as "isConfirmed",
              vendor_name as "vendorName",
              original_header as "originalHeader",
              created_at as "createdAt",
              updated_at
            FROM temp_files
            WHERE company_id = ${companyId}
            AND COALESCE(session_id, 'default-session') = ${sessionId}
            ORDER BY created_at DESC
          `) as any[];
        }
      } else {
        throw error;
      }
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
