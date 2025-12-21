// 택배사 매핑 테스트
const CARRIER_MAPPING_RULES = [
  { keywords: ["cj", "cj택배", "cj대한통운", "cj대통", "cj대"], standardName: "CJ택배" },
  { keywords: ["우체국", "우체국택배", "한국우체국", "우편"], standardName: "우체국택배" },
  { keywords: ["한진", "한진택배", "대한통운", "대통", "한진대통"], standardName: "한진택배" },
  { keywords: ["천일", "천일택배", "천일특송"], standardName: "천일택배" },
  { keywords: ["롯데", "롯데택배", "롯데글로벌"], standardName: "롯데택배" },
  { keywords: ["로젠", "로젠택배", "로젠글로벌"], standardName: "로젠택배" },
];

function normalizeCarrierName(carrier) {
  if (!carrier || typeof carrier !== 'string') {
    return carrier;
  }

  // 공백 제거 및 소문자 변환
  const normalizedInput = carrier.trim().toLowerCase();

  // 각 매핑 규칙에 대해 확인
  for (const rule of CARRIER_MAPPING_RULES) {
    // 키워드 중 하나라도 포함되어 있는지 확인
    const hasKeyword = rule.keywords.some(keyword =>
      normalizedInput.includes(keyword.toLowerCase())
    );

    if (hasKeyword) {
      return rule.standardName;
    }
  }

  // 매칭되는 규칙이 없으면 원본 값 반환
  return carrier.trim();
}

// 테스트 케이스
const testCases = [
  'CJ대한통운',
  'cj택배',
  '우체국택배',
  '한국우체국',
  '한진택배',
  '대한통운',
  '천일특송',
  '롯데글로벌',
  '로젠택배',
  '알수없는택배사',
  '',
  null,
  undefined
];

console.log('=== 택배사 명 표준화 테스트 ===');
console.log('');

testCases.forEach(input => {
  const result = normalizeCarrierName(input);
  console.log(`${input || 'null/undefined'} -> ${result}`);
});

console.log('');
console.log('=== 지원되는 택배사 목록 ===');
console.log(CARRIER_MAPPING_RULES.map(rule => rule.standardName));
