import {NextResponse} from "next/server";
import sql from "@/lib/db";

/**
 * mall_sales_settlement_orders 테이블 생성 마이그레이션
 * 정산 데이터와 주문 데이터를 연결하는 중간 테이블
 * order_data 컬럼에 주문 데이터 전체를 저장하여 갱신 시점의 데이터를 보존
 * product_data 컬럼에 상품 정보를 저장하여 상품 정보 변경 시에도 정산이 달라지지 않도록 함
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
        order_data JSONB,
        product_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(settlement_id, order_id)
      )
    `;
    
    // order_data 컬럼이 없으면 추가 (기존 테이블 마이그레이션)
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'mall_sales_settlement_orders' 
          AND column_name = 'order_data'
        ) THEN
          ALTER TABLE mall_sales_settlement_orders ADD COLUMN order_data JSONB;
          -- 기존 데이터의 order_data를 NULL로 설정 (나중에 갱신 시 채워짐)
        END IF;
      END $$;
    `;
    
    // product_data 컬럼이 없으면 추가 (기존 테이블 마이그레이션)
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'mall_sales_settlement_orders' 
          AND column_name = 'product_data'
        ) THEN
          ALTER TABLE mall_sales_settlement_orders ADD COLUMN product_data JSONB;
          -- 기존 데이터의 product_data를 NULL로 설정 (나중에 갱신 시 채워짐)
        END IF;
      END $$;
    `;
    
    // updated_at 컬럼이 없으면 추가
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'mall_sales_settlement_orders' 
          AND column_name = 'updated_at'
        ) THEN
          ALTER TABLE mall_sales_settlement_orders ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        END IF;
      END $$;
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
