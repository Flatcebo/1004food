// 데이터 매핑 함수 - 템플릿 헤더에 맞게 데이터 변환
export function mapDataToTemplate(
  row: any,
  header: string,
  options?: {templateName?: string; preferSabangName?: boolean}
): any {
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

  // 우편번호 관련 특별 처리
  if (
    normalizedHeader.includes("우편") ||
    normalizedHeader.includes("우편번호") ||
    header.includes("우편")
  ) {
    // 우편번호 또는 우편 필드 찾기
    const postalValue =
      row["우편"] || row["우편번호"] || row["우편 번호"] || "";
    if (postalValue) return postalValue;
  }

  // 공급가 관련 특별 처리 (salePrice 우선 사용)
  // 공급가 헤더인 경우 명시적으로 처리
  if (
    normalizedHeader.includes("공급가") ||
    header === "공급가" ||
    header.includes("공급가") ||
    (normalizedHeader.includes("가격") && header.includes("공급"))
  ) {
    // 공급가 필드 우선 확인 (명시적으로 설정된 값)
    const priceValue =
      row["공급가"] ||
      row["salePrice"] ||
      row["sale_price"] ||
      row["가격"] ||
      "";
    // 숫자로 변환 시도 (문자열이면 숫자로 변환)
    if (priceValue !== null && priceValue !== undefined && priceValue !== "") {
      const numValue =
        typeof priceValue === "string"
          ? parseFloat(priceValue.replace(/,/g, ""))
          : Number(priceValue);
      if (!isNaN(numValue)) {
        return numValue;
      }
      return priceValue;
    }
    return "";
  }

  // 일반 가격 필드 처리 (공급가가 아닌 경우)
  if (
    normalizedHeader.includes("가격") &&
    !normalizedHeader.includes("공급가")
  ) {
    const priceValue = row["가격"] || row["price"] || "";
    if (priceValue !== null && priceValue !== undefined && priceValue !== "") {
      const numValue =
        typeof priceValue === "string"
          ? parseFloat(priceValue.replace(/,/g, ""))
          : Number(priceValue);
      if (!isNaN(numValue)) {
        return numValue;
      }
      return priceValue;
    }
    return "";
  }

  // 상품명 컬럼: 사방넷명이 있으면 무조건 사방넷명 우선 사용
  if (
    normalizedHeader.includes("상품명") ||
    header === "상품명" ||
    header.includes("상품명")
  ) {
    // 디버깅 로그 (처음 3개만)
    if (!row._logged) {
      console.log(`\n[mapDataToTemplate] 상품명 매핑`);
      console.log(`- 템플릿명: ${options?.templateName}`);
      console.log(`- row["사방넷명"]: ${row["사방넷명"]}`);
      console.log(`- row["sabangName"]: ${row["sabangName"]}`);
      console.log(`- row["상품명"]: ${row["상품명"]}`);
      row._logged = true;
    }

    // 사방넷명이 있으면 무조건 사방넷명 우선 사용
    const sabangValue =
      row["사방넷명"] || row["sabangName"] || row["sabang_name"] || "";
    if (sabangValue !== null && sabangValue !== undefined) {
      const sabangStr = String(sabangValue).trim();
      if (sabangStr) {
        // 맨 앞의 'ㄱ'만 제거
        const cleaned =
          sabangStr.startsWith("ㄱ") && sabangStr.length > 1
            ? sabangStr.slice(1)
            : sabangStr;
        if (!row._logged2) {
          console.log(`✓ 사방넷명 사용: ${cleaned}`);
          row._logged2 = true;
        }
        return cleaned;
      }
    }

    // 사방넷명이 없으면 원래 상품명 사용
    const productName =
      row["상품명"] || row[header] || row[header.replace(/\s+/g, "")] || "";
    if (!row._logged2) {
      console.log(`→ 원본 상품명 사용 (사방넷명 없음): ${productName}`);
      row._logged2 = true;
    }
    return productName || "";
  }

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
