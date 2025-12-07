import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function POST() {
  try {
    // 업로드 데이터를 저장할 테이블 생성
    await sql`
      CREATE TABLE IF NOT EXISTS uploads (
        id SERIAL PRIMARY KEY,
        file_name VARCHAR(255) NOT NULL,
        row_count INTEGER NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 업로드된 각 행을 저장할 테이블 생성
    await sql`
      CREATE TABLE IF NOT EXISTS upload_rows (
        id SERIAL PRIMARY KEY,
        upload_id INTEGER REFERENCES uploads(id) ON DELETE CASCADE,
        row_data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 상품 정보를 저장할 테이블 생성
    await sql`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50),
        post_type VARCHAR(50),
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50) NOT NULL,
        pkg VARCHAR(50),
        price INTEGER,
        sale_price INTEGER,
        post_fee INTEGER,
        purchase VARCHAR(255),
        bill_type VARCHAR(50),
        category VARCHAR(255),
        product_type VARCHAR(50),
        sabang_name VARCHAR(255),
        etc TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(name, code)
      )
    `;

    // 인덱스 생성 (검색 성능 향상)
    await sql`
      CREATE INDEX IF NOT EXISTS idx_products_name ON products(name)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_products_code ON products(code)
    `;

    return NextResponse.json({ success: true, message: "스키마가 성공적으로 생성되었습니다." });
  } catch (error: any) {
    console.error("스키마 생성 실패:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

