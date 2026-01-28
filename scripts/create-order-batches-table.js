/**
 * 발주 차수 추적을 위한 order_batches 테이블 생성 스크립트
 *
 * 사용법: node scripts/create-order-batches-table.js
 *
 * 테이블 구조:
 * - order_batches: 발주 차수 정보 저장
 *   - id: serial primary key
 *   - company_id: varchar (회사 ID)
 *   - purchase_id: integer (매입처 ID, purchase 테이블 참조)
 *   - batch_number: integer (차수 번호: 1, 2, 3...)
 *   - batch_date: date (발주 날짜, 한국 시간 기준)
 *   - created_at: timestamp
 *
 * - upload_rows 테이블에 order_batch_id 컬럼 추가
 *   - order_batch_id: integer (order_batches 테이블 참조, nullable)
 */

const {neon} = require("@neondatabase/serverless");

const sql = neon(process.env.DATABASE_URL);

async function createOrderBatchesTable() {
  console.log("🚀 발주 차수 테이블 생성 시작...\n");

  try {
    // 1. order_batches 테이블 생성
    console.log("📦 order_batches 테이블 생성 중...");
    await sql`
      CREATE TABLE IF NOT EXISTS order_batches (
        id SERIAL PRIMARY KEY,
        company_id VARCHAR(255) NOT NULL,
        purchase_id INTEGER NOT NULL REFERENCES purchase(id) ON DELETE CASCADE,
        batch_number INTEGER NOT NULL,
        batch_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(company_id, purchase_id, batch_number, batch_date)
      )
    `;
    console.log("✅ order_batches 테이블 생성 완료\n");

    // 2. 인덱스 생성
    console.log("📊 인덱스 생성 중...");
    await sql`
      CREATE INDEX IF NOT EXISTS idx_order_batches_company_id 
      ON order_batches(company_id)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_order_batches_purchase_id 
      ON order_batches(purchase_id)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_order_batches_batch_date 
      ON order_batches(batch_date)
    `;
    console.log("✅ 인덱스 생성 완료\n");

    // 3. upload_rows 테이블에 order_batch_id 컬럼 추가
    console.log("📝 upload_rows 테이블에 order_batch_id 컬럼 추가 중...");

    // 컬럼이 이미 있는지 확인
    const columnExists = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'upload_rows' AND column_name = 'order_batch_id'
    `;

    if (columnExists.length === 0) {
      await sql`
        ALTER TABLE upload_rows 
        ADD COLUMN order_batch_id INTEGER REFERENCES order_batches(id) ON DELETE SET NULL
      `;
      console.log("✅ order_batch_id 컬럼 추가 완료\n");

      // 인덱스 추가
      await sql`
        CREATE INDEX IF NOT EXISTS idx_upload_rows_order_batch_id 
        ON upload_rows(order_batch_id)
      `;
      console.log("✅ order_batch_id 인덱스 생성 완료\n");
    } else {
      console.log("ℹ️ order_batch_id 컬럼이 이미 존재합니다.\n");
    }

    console.log("🎉 발주 차수 테이블 생성 완료!");
    console.log("\n📋 생성된 스키마:");
    console.log("  - order_batches: 발주 차수 정보 테이블");
    console.log("  - upload_rows.order_batch_id: 주문별 차수 연결 컬럼\n");
  } catch (error) {
    console.error("❌ 오류 발생:", error);
    process.exit(1);
  }
}

createOrderBatchesTable();
