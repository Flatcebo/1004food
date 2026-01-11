import {NextResponse} from "next/server";
import sql from "@/lib/db";

/**
 * mall_sales_settlements 테이블 생성 마이그레이션
 * 쇼핑몰별 매출 정산 데이터를 저장하는 테이블
 */
export async function POST() {
  try {
    await sql`BEGIN`;

    // mall_sales_settlements 테이블 생성
    await sql`
      CREATE TABLE IF NOT EXISTS mall_sales_settlements (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        mall_id INTEGER NOT NULL REFERENCES mall(id) ON DELETE CASCADE,
        period_start_date DATE NOT NULL,
        period_end_date DATE NOT NULL,
        -- 주문
        order_quantity INTEGER NOT NULL DEFAULT 0,
        order_amount INTEGER NOT NULL DEFAULT 0,
        -- 취소
        cancel_quantity INTEGER NOT NULL DEFAULT 0,
        cancel_amount INTEGER NOT NULL DEFAULT 0,
        -- 순매출
        net_sales_quantity INTEGER NOT NULL DEFAULT 0,
        net_sales_amount INTEGER NOT NULL DEFAULT 0,
        -- 총이익
        total_profit_amount INTEGER NOT NULL DEFAULT 0,
        total_profit_rate DECIMAL(10, 2) NOT NULL DEFAULT 0,
        -- 판매수수료 (일단 공란으로 두지만 구조는 만들어둠)
        sales_fee_amount INTEGER DEFAULT NULL,
        sales_fee_rate DECIMAL(10, 2) DEFAULT NULL,
        -- 순이익
        net_profit_amount INTEGER NOT NULL DEFAULT 0,
        net_profit_rate DECIMAL(10, 2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id, mall_id, period_start_date, period_end_date)
      )
    `;

    // 인덱스 생성
    await sql`
      CREATE INDEX IF NOT EXISTS idx_mall_sales_settlements_company_id 
      ON mall_sales_settlements(company_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_mall_sales_settlements_mall_id 
      ON mall_sales_settlements(mall_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_mall_sales_settlements_period 
      ON mall_sales_settlements(period_start_date, period_end_date)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_mall_sales_settlements_company_period 
      ON mall_sales_settlements(company_id, period_start_date, period_end_date)
    `;

    await sql`COMMIT`;

    return NextResponse.json({
      success: true,
      message: "mall_sales_settlements 테이블이 성공적으로 생성되었습니다.",
    });
  } catch (error: any) {
    await sql`ROLLBACK`;
    console.error("mall_sales_settlements 테이블 생성 실패:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "알 수 없는 오류가 발생했습니다.",
      },
      {status: 500}
    );
  }
}
