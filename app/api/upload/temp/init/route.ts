import {NextResponse} from "next/server";
import sql from "@/lib/db";

export async function POST() {
  try {
    // 임시 업로드 세션 테이블 생성
    await sql`
      CREATE TABLE IF NOT EXISTS temp_uploads (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 임시 업로드 파일 테이블 생성
    await sql`
      CREATE TABLE IF NOT EXISTS temp_upload_files (
        id SERIAL PRIMARY KEY,
        temp_upload_id INTEGER REFERENCES temp_uploads(id) ON DELETE CASCADE,
        file_id VARCHAR(255) UNIQUE NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        row_count INTEGER NOT NULL,
        table_data JSONB NOT NULL,
        header_index JSONB,
        product_code_map JSONB,
        is_confirmed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 인덱스 생성
    await sql`
      CREATE INDEX IF NOT EXISTS idx_temp_uploads_session_id ON temp_uploads(session_id)
    `;
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_temp_upload_files_file_id ON temp_upload_files(file_id)
    `;
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_temp_upload_files_temp_upload_id ON temp_upload_files(temp_upload_id)
    `;

    return NextResponse.json({
      success: true,
      message: "임시 저장용 테이블이 성공적으로 생성되었습니다.",
    });
  } catch (error: any) {
    console.error("임시 저장용 테이블 생성 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

