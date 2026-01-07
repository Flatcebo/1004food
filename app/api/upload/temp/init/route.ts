import {NextResponse} from "next/server";
import sql from "@/lib/db";

export async function POST() {
  try {
    // 임시 파일 테이블 생성 (세션별 관리 기능 추가)
    await sql`
      CREATE TABLE IF NOT EXISTS temp_files (
        id SERIAL PRIMARY KEY,
        file_id VARCHAR(255) UNIQUE NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        session_id VARCHAR(255) NOT NULL,
        row_count INTEGER NOT NULL,
        table_data JSONB NOT NULL,
        header_index JSONB,
        product_code_map JSONB,
        is_confirmed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 세션 테이블 생성
    await sql`
      CREATE TABLE IF NOT EXISTS upload_sessions (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) UNIQUE NOT NULL,
        session_name VARCHAR(255) NOT NULL,
        user_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 기존 데이터에 기본 세션 ID 추가 (마이그레이션)
    await sql`
      DO $$
      BEGIN
        -- session_id 컬럼이 존재하지 않으면 추가
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name = 'temp_files' AND column_name = 'session_id') THEN
          ALTER TABLE temp_files ADD COLUMN session_id VARCHAR(255);
        END IF;
      END
      $$;
    `;

    // 기본 세션 ID로 업데이트 (기존 데이터가 있다면)
    await sql`
      UPDATE temp_files SET session_id = 'default-session' WHERE session_id IS NULL OR session_id = ''
    `;

    // session_id 컬럼을 NOT NULL로 설정 (데이터가 모두 채워진 후에)
    await sql`
      ALTER TABLE temp_files ALTER COLUMN session_id SET DEFAULT 'default-session'
    `;

    // validation_status 컬럼 추가 (검증 상태 저장용)
    await sql`
      DO $$
      BEGIN
        -- validation_status 컬럼이 존재하지 않으면 추가
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name = 'temp_files' AND column_name = 'validation_status') THEN
          ALTER TABLE temp_files ADD COLUMN validation_status JSONB;
        END IF;
        -- user_id 컬럼이 존재하지 않으면 추가
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name = 'temp_files' AND column_name = 'user_id') THEN
          ALTER TABLE temp_files ADD COLUMN user_id VARCHAR(255);
        END IF;
      END
      $$;
    `;

    // 인덱스 생성
    await sql`
      CREATE INDEX IF NOT EXISTS idx_temp_files_file_id ON temp_files(file_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_temp_files_session_id ON temp_files(session_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_temp_files_created_at ON temp_files(created_at)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_upload_sessions_session_id ON upload_sessions(session_id)
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

