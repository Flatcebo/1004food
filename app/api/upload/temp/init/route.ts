import {NextResponse} from "next/server";
import sql from "@/lib/db";

export async function POST() {
  try {
    // 단순한 임시 파일 테이블 생성 (세션 개념 제거)
    await sql`
      CREATE TABLE IF NOT EXISTS temp_files (
        id SERIAL PRIMARY KEY,
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
      CREATE INDEX IF NOT EXISTS idx_temp_files_file_id ON temp_files(file_id)
    `;
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_temp_files_created_at ON temp_files(created_at)
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

