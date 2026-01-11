import {NextResponse} from "next/server";
import sql from "@/lib/db";

/**
 * mall 테이블 생성 마이그레이션
 */
export async function POST() {
  try {
    await sql`BEGIN`;

    // mall 테이블 생성
    await sql`
      CREATE TABLE IF NOT EXISTS mall (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        company_name VARCHAR(255),
        representative_name VARCHAR(255),
        business_number VARCHAR(50),
        market_category VARCHAR(255),
        postal_code VARCHAR(20),
        address1 VARCHAR(500),
        address2 VARCHAR(500),
        business_type VARCHAR(255),
        business_category VARCHAR(255),
        registration_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 인덱스 생성
    await sql`
      CREATE INDEX IF NOT EXISTS idx_mall_code ON mall(code)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_mall_name ON mall(name)
    `;

    await sql`COMMIT`;

    return NextResponse.json({
      success: true,
      message: "mall 테이블이 성공적으로 생성되었습니다.",
    });
  } catch (error: any) {
    await sql`ROLLBACK`;
    console.error("mall 테이블 생성 실패:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "알 수 없는 오류가 발생했습니다.",
      },
      {status: 500}
    );
  }
}
