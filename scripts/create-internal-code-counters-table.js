/**
 * 내부코드 카운터 테이블 생성
 *
 * 발주서 파일 업로드 시 내부코드 생성할 때, 삭제 후 재업로드해도
 * 마지막 번호부터 순차적으로 부여되도록 마지막 카운트를 저장합니다.
 *
 * 사용법:
 *   node scripts/create-internal-code-counters-table.js
 *   또는: node --env-file=.env.local scripts/create-internal-code-counters-table.js
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

async function main() {
  console.log("📦 internal_code_counters 테이블 생성 중...");

  await sql`
    CREATE TABLE IF NOT EXISTS internal_code_counters (
      company_id INTEGER NOT NULL,
      counter_key VARCHAR(50) NOT NULL,
      date_str VARCHAR(10) NOT NULL,
      last_increment INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      PRIMARY KEY (company_id, counter_key, date_str)
    )
  `;

  console.log("✅ internal_code_counters 테이블 생성 완료");

  // 인덱스 생성 (조회 성능 향상)
  try {
    await sql`
      CREATE INDEX IF NOT EXISTS idx_internal_code_counters_lookup
      ON internal_code_counters (company_id, counter_key, date_str)
    `;
    console.log("✅ 인덱스 생성 완료");
  } catch (e) {
    console.warn("⚠️ 인덱스 생성 스킵 (이미 존재할 수 있음):", e.message);
  }
}

main().catch((err) => {
  console.error("❌ 실행 실패:", err);
  process.exit(1);
});
