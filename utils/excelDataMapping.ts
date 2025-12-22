import {
  prepareExcelCellValue,
  normalizeNumberValue,
  normalizeStringValue,
} from "./excelTypeConversion";

// 전화번호에 하이픈을 추가하여 형식 맞춤
function formatPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber || phoneNumber.length < 9) return phoneNumber;

  const numOnly = phoneNumber.replace(/\D/g, "");

  // 이미 하이픈이 제대로 되어 있는지 확인
  if (phoneNumber.includes("-")) {
    const parts = phoneNumber.split("-");
    if (parts.length === 3) {
      // 하이픈이 3부분으로 나뉘어 있는 경우 올바른 형식인지 확인
      const formatted = formatPhoneNumber(parts.join(""));
      if (formatted !== parts.join("")) {
        return formatted;
      }
      return phoneNumber; // 이미 올바른 형식이면 그대로 반환
    }
  }

  // 02 지역번호 (02-XXXX-XXXX)
  if (numOnly.startsWith("02")) {
    if (numOnly.length === 9) { // 02-XXX-XXXX
      return `${numOnly.slice(0, 2)}-${numOnly.slice(2, 5)}-${numOnly.slice(5)}`;
    } else if (numOnly.length === 10) { // 02-XXXX-XXXX
      return `${numOnly.slice(0, 2)}-${numOnly.slice(2, 6)}-${numOnly.slice(6)}`;
    }
  }
  // 휴대폰 및 기타 지역번호 (0XX-XXXX-XXXX)
  else if (numOnly.startsWith("0") && numOnly.length === 11) { // 010-XXXX-XXXX 등
    return `${numOnly.slice(0, 3)}-${numOnly.slice(3, 7)}-${numOnly.slice(7)}`;
  }
  // 0508 대역 (0508-XXXX-XXXX)
  else if (numOnly.startsWith("0508") && numOnly.length === 12) { // 0508-XXXX-XXXX
    return `${numOnly.slice(0, 4)}-${numOnly.slice(4, 8)}-${numOnly.slice(8)}`;
  }
  // 050X 대역 (050X-XXXX-XXXX) - 0508 제외
  else if (numOnly.startsWith("050") && numOnly.length === 12) { // 050X-XXXX-XXXX (0500, 0501, 0502, 0503, 0504, 0505, 0506, 0507, 0509)
    return `${numOnly.slice(0, 4)}-${numOnly.slice(4, 8)}-${numOnly.slice(8)}`;
  }

  // 기타 경우는 그대로 반환
  return phoneNumber;
}

// 데이터 매핑 함수 - 템플릿 헤더에 맞게 데이터 변환
export function mapDataToTemplate(
  row: any,
  header: string,
  options?: {templateName?: string; preferSabangName?: boolean; isInhouse?: boolean; formatPhone?: boolean}
): any {
  // 절대값으로 설정할 필드들
  const normalizedHeader = header.replace(/\s+/g, "").toLowerCase();

  // 박스단위: 템플릿명에 따라 다르게 처리
  if (
    normalizedHeader.includes("박스") ||
    normalizedHeader === "박스" ||
    normalizedHeader === "박스단위" ||
    normalizedHeader === "박스정보" ||
    normalizedHeader === "박스크기"
  ) {
    // 내주 발주서의 경우 박스단위를 2로 설정
    if (options?.isInhouse || options?.templateName?.includes("내주")) {
      return prepareExcelCellValue(2, true);
    }
    // 그 외의 경우 공란 처리 (CJ외주 발주서용)
    return ""; // 공란 처리
  }

  // 부피단위: 항상 60으로 설정 (숫자 타입)
  if (
    normalizedHeader.includes("부피") ||
    normalizedHeader === "부피" ||
    normalizedHeader === "부피단위" ||
    normalizedHeader === "용량" ||
    normalizedHeader === "중량" ||
    normalizedHeader === "무게"
  ) {
    return prepareExcelCellValue(60, true);
  }

  // 포장재: 항상 "05"로 설정 (문자열 타입 - 숫자로 변환되면 안됨)
  if (
    normalizedHeader.includes("포장") ||
    normalizedHeader === "포장재" ||
    normalizedHeader === "포장자재" ||
    normalizedHeader === "포장방법" ||
    normalizedHeader === "포장"
  ) {
    return "05"; // 문자열로 유지
  }
  // 헤더명 매핑 규칙 (템플릿 헤더 → 내부 데이터 필드명)
  const headerMap: {[key: string]: string} = {
    수취인주소: "주소",
    "수취인 주소": "주소",
    고객주문처명: "업체명",
    상품코드: "매핑코드",
    '상품코드\r\n=IFERROR(IF(VLOOKUP(G2,등록상품,3,0)="공급중",VLOOKUP(G2,등록상품,2,0),"품절상품"),"신규or세트")':
      "매핑코드",
    공급가: "가격",
    배메: "배송메시지",
    "배송 메시지": "배송메시지",
    배송메세지: "배송메시지",
    배송메시지: "배송메시지",
    받는사람: "수취인명",
    "받는사람\r\n(띄어쓰기제거)": "수취인명",
    주문하신분: "주문자명",
    보내는분: "주문자명",
    "보내는 분": "주문자명",
    보내는사람: "주문자명",
    "보내는 사람": "주문자명",
  };

  // 매핑된 헤더명 사용
  const mappedHeader = headerMap[header] || header;

  // 우편번호 관련 특별 처리 (문자열로 유지)
  if (
    normalizedHeader.includes("우편") ||
    normalizedHeader.includes("우편번호") ||
    header.includes("우편")
  ) {
    // 우편번호 또는 우편 필드 찾기
    const postalValue =
      row["우편"] || row["우편번호"] || row["우편 번호"] || "";
    if (postalValue) return normalizeStringValue(postalValue);
  }

  // 전화번호 관련 필드 특별 처리 (문자열로 유지)
  if (normalizedHeader.includes("전화번호") || header.includes("전화번호")) {
    let phoneValue = "";

    // 먼저 해당 헤더명의 필드에서 값을 가져옴
    phoneValue = row[header] || row[header.replace(/\s+/g, "")] || "";

    // 값이 없으면 기존 로직대로 특정 필드에서 가져옴 (하위 호환성 유지)
    if (!phoneValue) {
      // 전화번호1 (수취인 전화번호)
      if (header === "전화번호1" || normalizedHeader === "전화번호1") {
        phoneValue =
          row["전화번호1"] ||
          row["전화번호"] ||
          row["수취인전화번호"] ||
          row["수취인 전화번호"] ||
          "";
      }
      // 전화번호2 (보조 전화번호)
      else if (header === "전화번호2" || normalizedHeader === "전화번호2") {
        phoneValue =
          row["전화번호2"] ||
          row["보조전화번호"] ||
          row["보조 전화번호"] ||
          row["주문자전화번호"] ||
          row["주문자 전화번호"] ||
          "";
      }
      // 전화번호 (주문자 전화번호)
      else if (header === "전화번호" || (normalizedHeader === "전화번호" && !header.includes("1") && !header.includes("2"))) {
        phoneValue =
          row["전화번호"] ||
          row["주문자전화번호"] ||
          row["주문자 전화번호"] ||
          "";
      }
    }

    if (phoneValue) {
      const normalized = normalizeStringValue(phoneValue);
      if (options?.formatPhone) {
        return formatPhoneNumber(normalized);
      }
      return normalized;
    }
  }

  // 공급가 관련 특별 처리 (salePrice 우선 사용, 숫자로 변환)
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

    // 숫자로 변환 (normalizeNumberValue 사용)
    const numValue = normalizeNumberValue(priceValue);
    return numValue === "" ? "" : prepareExcelCellValue(numValue, true);
  }

  // 일반 가격 필드 처리 (공급가가 아닌 경우, 숫자로 변환)
  if (
    normalizedHeader.includes("가격") &&
    !normalizedHeader.includes("공급가")
  ) {
    const priceValue = row["가격"] || row["price"] || "";
    const numValue = normalizeNumberValue(priceValue);
    return numValue === "" ? "" : prepareExcelCellValue(numValue, true);
  }

  // 수량 관련 필드 처리 (숫자로 변환)
  if (
    normalizedHeader.includes("수량") ||
    normalizedHeader.includes("개수") ||
    header.includes("수량") ||
    header.includes("개수")
  ) {
    const qtyValue =
      row["수량"] || row["개수"] || row["quantity"] || row[header] || "";
    const numValue = normalizeNumberValue(qtyValue);
    return numValue === "" ? "" : prepareExcelCellValue(numValue, true);
  }

  // 상품명 컬럼: 사방넷명이 있으면 무조건 사방넷명 우선 사용 (문자열로 정규화)
  if (
    normalizedHeader.includes("상품명") ||
    header === "상품명" ||
    header.includes("상품명")
  ) {
    // 디버깅 로그 (처음 3개만)
    if (!row._logged) {
      // console.log(`\n[mapDataToTemplate] 상품명 매핑`);
      // console.log(`- 템플릿명: ${options?.templateName}`);
      // console.log(`- row["사방넷명"]: ${row["사방넷명"]}`);
      // console.log(`- row["sabangName"]: ${row["sabangName"]}`);
      // console.log(`- row["상품명"]: ${row["상품명"]}`);
      row._logged = true;
    }

    // 사방넷명이 있으면 무조건 사방넷명 우선 사용
    const sabangValue =
      row["사방넷명"] || row["sabangName"] || row["sabang_name"] || "";
    if (sabangValue !== null && sabangValue !== undefined) {
      const sabangStr = normalizeStringValue(sabangValue);
      if (sabangStr) {
        if (!row._logged2) {
          console.log(`✓ 사방넷명 사용: ${sabangStr}`);
          row._logged2 = true;
        }
        return prepareExcelCellValue(sabangStr, false);
      }
    }

    // 사방넷명이 없으면 원래 상품명 사용
    const productName =
      row["상품명"] || row[header] || row[header.replace(/\s+/g, "")] || "";
    if (!row._logged2) {
      console.log(`→ 원본 상품명 사용 (사방넷명 없음): ${productName}`);
      row._logged2 = true;
    }
    return prepareExcelCellValue(productName, false);
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

  // 매핑코드는 문자열로 유지 (숫자로 변환되면 안됨)
  if (
    normalizedHeader.includes("매핑코드") ||
    normalizedHeader.includes("코드") ||
    header.includes("코드")
  ) {
    return normalizeStringValue(value);
  }

  // 일반 값은 Excel 셀 값으로 정규화
  return prepareExcelCellValue(value, false);
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
      (h && h.includes("수취인명")) ||
      (h && h.includes("수취인"))
  );
  const 상품명Idx = columnOrder.findIndex(
    (h: string) =>
      h === "상품명" ||
      h === "상품" ||
      (h && h.includes("상품명")) ||
      (h && h.includes("상품"))
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
