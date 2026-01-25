import {NextResponse} from "next/server";
import sql from "@/lib/db";

/**
 * 다운로드 히스토리 테이블 생성
 */
export async function POST() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS download_history (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        vendor_name VARCHAR(255),
        file_name VARCHAR(255) NOT NULL,
        form_type VARCHAR(50) NOT NULL CHECK (form_type IN ('운송장', '사방넷 AB', '전체 사방넷 AB')),
        upload_id INTEGER REFERENCES uploads(id) ON DELETE SET NULL,
        date_filter VARCHAR(20),
        downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 인덱스 생성 (조회 성능 향상)
    await sql`
      CREATE INDEX IF NOT EXISTS idx_download_history_user_id ON download_history(user_id)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_download_history_company_id ON download_history(company_id)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_download_history_downloaded_at ON download_history(downloaded_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_download_history_user_company ON download_history(user_id, company_id)
    `;

    return NextResponse.json({
      success: true,
      message: "다운로드 히스토리 테이블이 성공적으로 생성되었습니다.",
    });
  } catch (error: any) {
    console.error("테이블 생성 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
