import {NextResponse} from "next/server";
import sql from "@/lib/db";

/**
 * mall_promotions 테이블 생성 마이그레이션
 * 행사가를 저장 관리하는 테이블
 */
export async function POST() {
  try {
    await sql`BEGIN`;

    // mall_promotions 테이블 생성
    await sql`
      CREATE TABLE IF NOT EXISTS mall_promotions (
        id SERIAL PRIMARY KEY,
        mall_id INTEGER NOT NULL REFERENCES mall(id) ON DELETE CASCADE,
        product_code VARCHAR(50) NOT NULL,
        discount_rate DECIMAL(5, 2),
        event_price INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(mall_id, product_code)
      )
    `;

    // 인덱스 생성
    await sql`
      CREATE INDEX IF NOT EXISTS idx_mall_promotions_mall_id 
      ON mall_promotions(mall_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_mall_promotions_product_code 
      ON mall_promotions(product_code)
    `;

    await sql`COMMIT`;

    return NextResponse.json({
      success: true,
      message: "mall_promotions 테이블이 성공적으로 생성되었습니다.",
    });
  } catch (error: any) {
    await sql`ROLLBACK`;
    console.error("mall_promotions 테이블 생성 실패:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "알 수 없는 오류가 발생했습니다.",
      },
      {status: 500}
    );
  }
}
