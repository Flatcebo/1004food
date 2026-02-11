/**
 * 발주서 발송 원본 저장용 order_sheet_snapshots 테이블 생성
 *
 * 사용법:
 *   node scripts/create-order-sheet-snapshots-table.js
 *   또는: node --env-file=.env.local scripts/create-order-sheet-snapshots-table.js
 *
 * 테이블: 발주서 다운로드/이메일/카카오톡 발송 시 원본 데이터 저장
 */

const fs = require("fs");
const path = require("path");

// .env.local 또는 .env 로드 (DATABASE_URL 미설정 시)
if (!process.env.DATABASE_URL) {
  for (const file of [".env.local", ".env"]) {
    const envPath = path.join(process.cwd(), file);
    if (fs.existsSync(envPath)) {
      fs.readFileSync(envPath, "utf8")
        .split("\n")
        .forEach((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) return;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx <= 0) return;
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1);
          }
          process.env[key] = val;
        });
      break;
    }
  }
}

const {neon} = require("@neondatabase/serverless");

if (!process.env.DATABASE_URL) {
  console.error(
    "❌ DATABASE_URL이 설정되지 않았습니다. .env.local 또는 .env를 확인해주세요.",
  );
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function createOrderSheetSnapshotsTable() {
  console.log("🚀 order_sheet_snapshots 테이블 생성 시작...\n");

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS order_sheet_snapshots (
        id SERIAL PRIMARY KEY,
        company_id VARCHAR(255) NOT NULL,
        purchase_id INTEGER NOT NULL REFERENCES purchase(id) ON DELETE CASCADE,
        order_batch_id INTEGER REFERENCES order_batches(id) ON DELETE SET NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        send_type VARCHAR(20) NOT NULL CHECK (send_type IN ('download', 'email', 'kakaotalk')),
        file_name VARCHAR(255),
        headers JSONB NOT NULL DEFAULT '[]',
        row_data JSONB NOT NULL DEFAULT '[]',
        file_data BYTEA,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log("✅ order_sheet_snapshots 테이블 생성 완료\n");

    // user_id 컬럼 추가 (이미 생성된 테이블인 경우 - CREATE TABLE IF NOT EXISTS는 기존 테이블 변경 안 함)
    const colExists = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'order_sheet_snapshots' AND column_name = 'user_id'
    `;
    if (colExists.length === 0) {
      await sql`
        ALTER TABLE order_sheet_snapshots
        ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
      `;
      console.log("✅ user_id 컬럼 추가 완료\n");
    } else {
      console.log("ℹ️ user_id 컬럼이 이미 존재합니다.\n");
    }

    await sql`
      CREATE INDEX IF NOT EXISTS idx_order_sheet_snapshots_company_id
      ON order_sheet_snapshots(company_id)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_order_sheet_snapshots_purchase_id
      ON order_sheet_snapshots(purchase_id)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_order_sheet_snapshots_batch_id
      ON order_sheet_snapshots(order_batch_id)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_order_sheet_snapshots_created_at
      ON order_sheet_snapshots(created_at)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_order_sheet_snapshots_user_id
      ON order_sheet_snapshots(user_id)
    `;
    console.log("✅ 인덱스 생성 완료\n");

    console.log("🎉 order_sheet_snapshots 테이블 생성 완료!");
  } catch (error) {
    console.error("❌ 오류 발생:", error);
    process.exit(1);
  }
}

createOrderSheetSnapshotsTable();
