import sql from "@/lib/db";

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
  increment: number
): string {
  const dateStr = getDateString();
  // company_id는 더 이상 사용하지 않음 (호환성을 위해 파라미터는 유지)
  const mallIdStr = mallId ? String(mallId).padStart(4, "0") : "0000";
  const incrementStr = String(increment).padStart(4, "0");
  return `${dateStr}${mallIdStr}${incrementStr}`;
}

// DB에서 특정 mall_id와 날짜에 대한 최대 일련번호 조회
export async function getMaxIncrement(
  companyId: number,
  mallId: number | null,
  dateStr: string
): Promise<number> {
  try {
    // company_id는 더 이상 사용하지 않음 (호환성을 위해 파라미터는 유지)
    const mallIdStr = mallId ? String(mallId).padStart(4, "0") : "0000";
    const codePrefix = `${dateStr}${mallIdStr}`;
    const expectedLength = codePrefix.length + 4; // 날짜(6) + mall_id(4) + increment(4) = 14자리

    // 해당 날짜, mall_id로 시작하고 정확히 14자리인 내부코드만 조회
    let result;
    if (mallId === null) {
      result = await sql`
        SELECT row_data->>'내부코드' as code 
        FROM upload_rows 
        WHERE row_data->>'내부코드' LIKE ${codePrefix + "%"}
          AND LENGTH(row_data->>'내부코드') = ${expectedLength}
          AND mall_id IS NULL
        ORDER BY row_data->>'내부코드' DESC
        LIMIT 1
      `;
    } else {
      result = await sql`
        SELECT row_data->>'내부코드' as code 
        FROM upload_rows 
        WHERE row_data->>'내부코드' LIKE ${codePrefix + "%"}
          AND LENGTH(row_data->>'내부코드') = ${expectedLength}
          AND mall_id = ${mallId}
        ORDER BY row_data->>'내부코드' DESC
        LIMIT 1
      `;
    }

    if (result.length === 0) {
      return 0;
    }

    // 코드에서 일련번호 부분 추출 (마지막 4자리)
    const code = result[0].code;
    const incrementPart = code.slice(-4);
    const increment = parseInt(incrementPart) || 0;

    return increment;
  } catch (error) {
    console.error("최대 일련번호 조회 실패:", error);
    return 0;
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
  mallIds: (number | null)[]
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
      })
    )
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

