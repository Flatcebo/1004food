// 데이터 매핑 함수 - 템플릿 헤더에 맞게 데이터 변환
export function mapDataToTemplate(row: any, header: string): any {
  // 절대값으로 설정할 필드들
  const normalizedHeader = header.replace(/\s+/g, "").toLowerCase();

  // 박스단위: 항상 2로 설정
  if (
    normalizedHeader.includes("박스") ||
    normalizedHeader === "박스" ||
    normalizedHeader === "박스단위" ||
    normalizedHeader === "박스정보" ||
    normalizedHeader === "박스크기"
  ) {
    return 2;
  }

  // 부피단위: 항상 60으로 설정
  if (
    normalizedHeader.includes("부피") ||
    normalizedHeader === "부피" ||
    normalizedHeader === "부피단위" ||
    normalizedHeader === "용량" ||
    normalizedHeader === "중량" ||
    normalizedHeader === "무게"
  ) {
    return 60;
  }

  // 포장재: 항상 "05"로 설정
  if (
    normalizedHeader.includes("포장") ||
    normalizedHeader === "포장재" ||
    normalizedHeader === "포장자재" ||
    normalizedHeader === "포장방법" ||
    normalizedHeader === "포장"
  ) {
    return "05";
  }

  // 헤더명 매핑 규칙 (템플릿 헤더 → 내부 데이터 필드명)
  const headerMap: {[key: string]: string} = {
    수취인주소: "주소",
    "수취인 주소": "주소",
    고객주문처명: "업체명",
    상품코드: "매핑코드",
    공급가: "가격",
    배메: "배송메시지",
    "배송 메시지": "배송메시지",
    배송메세지: "배송메시지",
    배송메시지: "배송메시지",
  };

  // 매핑된 헤더명 사용
  const mappedHeader = headerMap[header] || header;

  // 다양한 변형으로 값 찾기
  let value =
    row[mappedHeader] ||
    row[header] ||
    row[header.replace(/\s+/g, "")] ||
    row[header.toLowerCase()] ||
    "";

  // 배송메시지 관련 추가 검색
  if (!value && (header.includes("배송") || header.includes("배메"))) {
    value =
      row["배송메시지"] ||
      row["배송 메시지"] ||
      row["배메"] ||
      row["배송메세지"] ||
      "";
  }

  // 값이 없으면 빈 문자열 반환
  if (value === null || value === undefined) {
    value = "";
  }

  return value;
}

// 정렬 함수: 상품명 오름차순 후 수취인명 오름차순
export function sortExcelData(
  excelData: any[][],
  columnOrder: string[]
): any[][] {
  const 수취인명Idx = columnOrder.findIndex(
    (h: string) =>
      h === "수취인명" ||
      h === "수취인" ||
      h.includes("수취인명") ||
      h.includes("수취인")
  );
  const 상품명Idx = columnOrder.findIndex(
    (h: string) =>
      h === "상품명" ||
      h === "상품" ||
      h.includes("상품명") ||
      h.includes("상품")
  );

  if (수취인명Idx === -1 && 상품명Idx === -1) {
    return excelData;
  }

  return [...excelData].sort((a, b) => {
    // 상품명으로 먼저 정렬
    if (상품명Idx !== -1) {
      const a상품명 = String(a[상품명Idx] || "").trim();
      const b상품명 = String(b[상품명Idx] || "").trim();
      if (a상품명 !== b상품명) {
        return a상품명.localeCompare(b상품명, "ko");
      }
    }
    // 수취인명으로 정렬
    if (수취인명Idx !== -1) {
      const a수취인명 = String(a[수취인명Idx] || "").trim();
      const b수취인명 = String(b[수취인명Idx] || "").trim();
      return a수취인명.localeCompare(b수취인명, "ko");
    }
    return 0;
  });
}

