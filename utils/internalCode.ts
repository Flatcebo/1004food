import sql from "@/lib/db";

// internal_code_counters 테이블 존재 여부 (한 번만 확인)
let _countersTableChecked = false;

async function ensureCountersTable(): Promise<void> {
  if (_countersTableChecked) return;
  try {
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
  } catch {
    // 테이블 생성 실패 시 무시 (권한 없음 등)
  }
  _countersTableChecked = true;
}

// 업체명 앞 2글자 추출 (한글, 영문, 숫자)
export function getVendorPrefix(vendorName: string): string {
  if (!vendorName) return "미지정";
  const trimmed = vendorName.trim();
  if (trimmed.length === 0) return "미지정";

  // 앞 2글자 추출 (1글자인 경우 그대로 사용)
  return trimmed.length >= 2 ? trimmed.substring(0, 2) : trimmed;
}

// 날짜 문자열 생성 (YYMMDD) - 년도는 2자리만 사용
export function getDateString(): string {
  const now = new Date();
  const year = String(now.getFullYear() % 100).padStart(2, "0"); // 4자리 년도에서 마지막 2자리만 사용
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

// 내부코드 생성: 날짜(6자리, YYMMDD) + mall_id(4자리) + 일련번호(4자리)
export function generateInternalCode(
  companyId: number,
  mallId: number | null,
  increment: number,
): string {
  const dateStr = getDateString();
  // company_id는 더 이상 사용하지 않음 (호환성을 위해 파라미터는 유지)
  const mallIdStr = mallId ? String(mallId).padStart(4, "0") : "0000";
  const incrementStr = String(increment).padStart(4, "0");
  return `${dateStr}${mallIdStr}${incrementStr}`;
}

// DB에서 특정 mall_id와 날짜에 대한 최대 일련번호 조회
// upload_rows + internal_code_counters 테이블 모두 확인하여 삭제 후에도 순차 부여 유지
export async function getMaxIncrement(
  companyId: number,
  mallId: number | null,
  dateStr: string,
): Promise<number> {
  try {
    const mallIdStr = mallId ? String(mallId).padStart(4, "0") : "0000";
    const codePrefix = `${dateStr}${mallIdStr}`;
    const expectedLength = codePrefix.length + 4; // 날짜(6) + mall_id(4) + increment(4) = 14자리
    const counterKey = `mall_${mallId ?? "null"}`;

    // 1) internal_code_counters 테이블에서 마지막 카운트 조회 (삭제 후에도 유지)
    let counterIncrement = 0;
    try {
      await ensureCountersTable();
      const counterResult = await sql`
        SELECT last_increment FROM internal_code_counters
        WHERE company_id = ${companyId}
          AND counter_key = ${counterKey}
          AND date_str = ${dateStr}
        LIMIT 1
      `;
      if (counterResult.length > 0) {
        counterIncrement = Number(counterResult[0].last_increment) || 0;
      }
    } catch (counterErr) {
      // 테이블이 없을 수 있으므로 무시
    }

    // 2) upload_rows 테이블에서 현재 최대 일련번호 조회
    let rowsIncrement = 0;
    if (mallId === null) {
      const result = await sql`
        SELECT row_data->>'내부코드' as code 
        FROM upload_rows ur
        LEFT JOIN uploads u ON ur.upload_id = u.id
        WHERE (ur.company_id = ${companyId} OR u.company_id = ${companyId})
          AND ur.row_data->>'내부코드' LIKE ${codePrefix + "%"}
          AND LENGTH(ur.row_data->>'내부코드') = ${expectedLength}
          AND ur.mall_id IS NULL
        ORDER BY ur.row_data->>'내부코드' DESC
        LIMIT 1
      `;
      if (result.length > 0) {
        const code = result[0].code;
        rowsIncrement = parseInt(String(code).slice(-4), 10) || 0;
      }
    } else {
      const result = await sql`
        SELECT row_data->>'내부코드' as code 
        FROM upload_rows ur
        LEFT JOIN uploads u ON ur.upload_id = u.id
        WHERE (ur.company_id = ${companyId} OR u.company_id = ${companyId})
          AND ur.row_data->>'내부코드' LIKE ${codePrefix + "%"}
          AND LENGTH(ur.row_data->>'내부코드') = ${expectedLength}
          AND ur.mall_id = ${mallId}
        ORDER BY ur.row_data->>'내부코드' DESC
        LIMIT 1
      `;
      if (result.length > 0) {
        const code = result[0].code;
        rowsIncrement = parseInt(String(code).slice(-4), 10) || 0;
      }
    }

    // 3) 둘 중 큰 값 반환 (삭제 후에도 카운터가 더 크면 그 값 사용)
    return Math.max(counterIncrement, rowsIncrement);
  } catch (error) {
    console.error("최대 일련번호 조회 실패:", error);
    return 0;
  }
}

// 내부코드 생성 후 마지막 카운트를 DB에 저장 (삭제 후에도 순차 부여 유지)
export async function saveLastIncrements(
  companyId: number,
  dateStr: string,
  keyIncrements: Map<string, number>,
): Promise<void> {
  try {
    await ensureCountersTable();
    for (const [key, lastIncrement] of keyIncrements) {
      const counterKey = key === "null" ? "mall_null" : `mall_${key}`;
      await sql`
        INSERT INTO internal_code_counters (company_id, counter_key, date_str, last_increment, updated_at)
        VALUES (${companyId}, ${counterKey}, ${dateStr}, ${lastIncrement}, NOW())
        ON CONFLICT (company_id, counter_key, date_str)
        DO UPDATE SET last_increment = EXCLUDED.last_increment, updated_at = NOW()
      `;
    }
  } catch (error) {
    console.error("마지막 카운트 저장 실패:", error);
    // 실패해도 기존 동작은 유지 (다음 업로드 시 upload_rows에서 조회)
  }
}

// DB에서 내부 코드 중복 확인 (여러 코드를 한 번에 확인)
export async function areCodesUnique(codes: string[]): Promise<boolean> {
  try {
    if (codes.length === 0) return true;

    const result = await sql`
      SELECT COUNT(*) as count FROM upload_rows 
      WHERE row_data->>'내부코드' = ANY(${codes})
    `;

    const count = parseInt(String(result[0].count)) || 0;
    return count === 0;
  } catch (error) {
    console.error("내부 코드 중복 확인 실패:", error);
    throw error;
  }
}

// mall_id별로 내부 코드 생성
export async function generateUniqueCodesForVendors(
  companyId: number,
  mallIds: (number | null)[],
): Promise<string[]> {
  const dateStr = getDateString();
  const codes: string[] = [];

  // mall_id별 현재 increment 추적
  const keyIncrements = new Map<string, number>();

  // 각 고유 mall_id별로 최대 increment 초기화
  const uniqueKeys = Array.from(
    new Set(
      mallIds.map((mallId) => {
        return mallId ? String(mallId) : "null";
      }),
    ),
  );

  for (const key of uniqueKeys) {
    const mallId = key === "null" ? null : parseInt(key, 10);
    // companyId는 호환성을 위해 전달하지만 실제로는 사용하지 않음
    const maxIncrement = await getMaxIncrement(companyId, mallId, dateStr);
    keyIncrements.set(key, maxIncrement);
  }

  // mallIds 배열 순서대로 코드 생성
  for (const mallId of mallIds) {
    const key = mallId === null ? "null" : String(mallId);
    const currentIncrement = keyIncrements.get(key) || 0;
    const nextIncrement = currentIncrement + 1;
    keyIncrements.set(key, nextIncrement);

    // companyId는 호환성을 위해 전달하지만 실제로는 사용하지 않음
    const code = generateInternalCode(companyId, mallId, nextIncrement);
    codes.push(code);
  }

  // 마지막 카운트를 DB에 저장 (삭제 후 재업로드 시에도 순차 부여 유지)
  await saveLastIncrements(companyId, dateStr, keyIncrements);

  // 생성된 코드 내에서 중복 확인
  const codeSet = new Set(codes);
  if (codeSet.size !== codes.length) {
    throw new Error("생성된 코드 배치 내에 중복이 있습니다.");
  }

  // DB에서 중복 확인
  const isUnique = await areCodesUnique(codes);
  if (!isUnique) {
    throw new Error("생성된 코드가 DB에 이미 존재합니다.");
  }

  return codes;
}
