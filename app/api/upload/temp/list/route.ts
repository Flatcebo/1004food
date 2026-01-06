import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const {searchParams} = new URL(request.url);
    const sessionId = searchParams.get("sessionId");

    // validation_status, vendor_name 컬럼이 없으면 추가
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
        files = (await sql`
          SELECT
            file_id as id,
            file_name as "fileName",
            'all-sessions' as "sessionId",
            row_count as "rowCount",
            table_data as "tableData",
            header_index as "headerIndex",
            product_code_map as "productCodeMap",
            validation_status as "validationStatus",
            is_confirmed as "isConfirmed",
            created_at,
            updated_at
          FROM temp_files
          ORDER BY created_at DESC
        `) as any[];
      } else if (sessionId) {
        // 임시 해결: session_id 컬럼 문제로 모든 파일을 반환
        files = (await sql`
          SELECT
            file_id as id,
            file_name as "fileName",
            'default-session' as "sessionId",
            row_count as "rowCount",
            table_data as "tableData",
            header_index as "headerIndex",
            product_code_map as "productCodeMap",
            validation_status as "validationStatus",
            is_confirmed as "isConfirmed",
            vendor_name as "vendorName",
            created_at as "createdAt",
            updated_at
          FROM temp_files
          ORDER BY created_at DESC
        `) as any[];
      }
    } catch (error: any) {
      // validation_status 컬럼이 없으면 컬럼 없이 조회
      if (
        error.message &&
        error.message.includes('column "validation_status" does not exist')
      ) {
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
              NULL as "validationStatus",
              is_confirmed as "isConfirmed",
              created_at,
              updated_at
            FROM temp_files
            ORDER BY created_at DESC
          `) as any[];
        } else if (sessionId) {
          files = (await sql`
            SELECT
              file_id as id,
              file_name as "fileName",
              'default-session' as "sessionId",
              row_count as "rowCount",
              table_data as "tableData",
              header_index as "headerIndex",
              product_code_map as "productCodeMap",
              NULL as "validationStatus",
              is_confirmed as "isConfirmed",
              vendor_name as "vendorName",
              created_at as "createdAt",
              updated_at
            FROM temp_files
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
