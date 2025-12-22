import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

/**
 * DB 인덱스 생성 API
 * 내부코드 검색 성능을 위한 인덱스 생성 및 사용자별 세션 지원을 위한 컬럼 추가
 *
 * 사용법: GET /api/db/create-index
 */
export async function GET(request: NextRequest) {
  try {
    // 내부코드 검색을 위한 GIN 인덱스 생성
    await sql`
      CREATE INDEX IF NOT EXISTS idx_upload_rows_internal_code
      ON upload_rows USING GIN ((row_data->'내부코드'))
    `;

    // 사용자별 세션 관리를 위한 user_id 컬럼 추가
    await sql`
      ALTER TABLE upload_sessions
      ADD COLUMN IF NOT EXISTS user_id VARCHAR(255)
    `;

    // user_id에 대한 인덱스 생성
    await sql`
      CREATE INDEX IF NOT EXISTS idx_upload_sessions_user_id
      ON upload_sessions(user_id)
    `;

    return NextResponse.json({
      success: true,
      message: "인덱스와 사용자별 세션 지원 컬럼이 성공적으로 생성되었습니다.",
    });
  } catch (error: any) {
    console.error("인덱스 및 컬럼 생성 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
