import {NextResponse} from "next/server";
import sql from "@/lib/db";

/**
 * mall_sales_settlement_orders 테이블 생성 마이그레이션
 * 정산 데이터와 주문 데이터를 연결하는 중간 테이블
 */
export async function POST() {
  try {
    await sql`BEGIN`;

    // mall_sales_settlement_orders 테이블 생성
    await sql`
      CREATE TABLE IF NOT EXISTS mall_sales_settlement_orders (
        id SERIAL PRIMARY KEY,
        settlement_id INTEGER NOT NULL REFERENCES mall_sales_settlements(id) ON DELETE CASCADE,
        order_id INTEGER NOT NULL REFERENCES upload_rows(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(settlement_id, order_id)
      )
    `;

    // 인덱스 생성
    await sql`
      CREATE INDEX IF NOT EXISTS idx_mall_sales_settlement_orders_settlement_id 
      ON mall_sales_settlement_orders(settlement_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_mall_sales_settlement_orders_order_id 
      ON mall_sales_settlement_orders(order_id)
    `;

    await sql`COMMIT`;

    return NextResponse.json({
      success: true,
      message: "mall_sales_settlement_orders 테이블이 성공적으로 생성되었습니다.",
    });
  } catch (error: any) {
    await sql`ROLLBACK`;
    console.error("mall_sales_settlement_orders 테이블 생성 실패:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "알 수 없는 오류가 발생했습니다.",
      },
      {status: 500}
    );
  }
}
