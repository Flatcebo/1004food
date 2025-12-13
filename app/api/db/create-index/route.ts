import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

/**
 * DB 인덱스 생성 API
 * 내부코드 검색 성능을 위한 인덱스 생성
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

    return NextResponse.json({
      success: true,
      message: "인덱스가 성공적으로 생성되었습니다.",
    });
  } catch (error: any) {
    console.error("인덱스 생성 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
