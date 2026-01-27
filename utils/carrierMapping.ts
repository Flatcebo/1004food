/**
 * 택배사 이름 표준화 유틸리티
 * 엑셀에서 읽어온 다양한 택배사 명칭을 표준화된 이름으로 변환
 */

// 택배사 매핑 규칙
const CARRIER_MAPPING_RULES = [
  {
    keywords: ["cj", "cj택배", "cj대한통운", "cj대통", "cj대", "대한통운"],
    standardName: "CJ택배",
  },
  {
    keywords: ["우체국", "우체국택배", "한국우체국"],
    standardName: "우체국택배",
  },
  {
    keywords: ["한진", "한진택배"],
    standardName: "한진택배",
  },
  {keywords: ["천일", "천일택배", "천일특송"], standardName: "천일택배"},
  {
    keywords: ["롯데", "롯데택배", "롯데글로벌", "롯데(현대)택배"],
    standardName: "롯데택배",
  },
  {keywords: ["로젠", "로젠택배", "로젠글로벌"], standardName: "로젠택배"},
];

/**
 * 택배사 이름을 표준화된 이름으로 변환
 * @param carrier 원본 택배사 이름
 * @returns 표준화된 택배사 이름
 */
export function normalizeCarrierName(carrier: string): string {
  if (!carrier || typeof carrier !== "string") {
    return carrier;
  }

  // 공백 제거 및 소문자 변환
  const normalizedInput = carrier.trim().toLowerCase();

  // 각 매핑 규칙에 대해 확인
  for (const rule of CARRIER_MAPPING_RULES) {
    // 키워드 중 하나라도 포함되어 있는지 확인
    const hasKeyword = rule.keywords.some((keyword) =>
      normalizedInput.includes(keyword.toLowerCase()),
    );

    if (hasKeyword) {
      return rule.standardName;
    }
  }

  // 매칭되는 규칙이 없으면 원본 값 반환
  return carrier.trim();
}

/**
 * 지원되는 택배사 목록 반환
 * @returns 표준화된 택배사 이름 목록
 */
export function getSupportedCarriers(): string[] {
  return CARRIER_MAPPING_RULES.map((rule) => rule.standardName);
}

/**
 * 택배사 매핑 규칙 설명 반환
 * @returns 매핑 규칙 설명
 */
export function getCarrierMappingDescription(): string {
  return CARRIER_MAPPING_RULES.map(
    (rule) => `${rule.keywords.join(", ")} → ${rule.standardName}`,
  ).join("\n");
}
