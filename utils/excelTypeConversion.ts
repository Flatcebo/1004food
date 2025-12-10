// 엑셀 셀 값 타입 정규화 유틸리티
// Microsoft Excel 호환성을 위해 모든 값을 문자열 또는 숫자로 변환

/**
 * 엑셀 셀 값을 정규화 (문자열 또는 숫자로 변환)
 * @param value 변환할 값
 * @returns 정규화된 값 (string | number | boolean | Date | null)
 */
export function normalizeExcelCellValue(
  value: any
): string | number | boolean | Date | null {
  // null 또는 undefined는 빈 문자열로 변환
  if (value === null || value === undefined) {
    return "";
  }

  // 이미 기본 타입인 경우
  if (typeof value === "string") {
    // 빈 문자열은 그대로 반환
    if (value === "") return "";

    // 문자열이 숫자로 변환 가능한지 확인
    const trimmed = value.trim();

    // 쉼표가 포함된 숫자 형식 (예: "1,234.56")
    const numberWithCommas = trimmed.replace(/,/g, "");
    if (/^-?\d+(\.\d+)?$/.test(numberWithCommas)) {
      const num = parseFloat(numberWithCommas);
      if (!isNaN(num) && isFinite(num)) {
        return num;
      }
    }

    return trimmed;
  }

  if (typeof value === "number") {
    // NaN이나 Infinity는 빈 문자열로 변환
    if (!isFinite(value)) {
      return "";
    }
    return value;
  }

  if (typeof value === "boolean") {
    // boolean은 그대로 반환 (Excel에서 TRUE/FALSE로 표시됨)
    return value;
  }

  // Date 객체
  if (value instanceof Date) {
    // 유효한 날짜인지 확인
    if (!isNaN(value.getTime())) {
      return value;
    }
    return "";
  }

  // 배열
  if (Array.isArray(value)) {
    // 배열은 쉼표로 구분된 문자열로 변환
    return value
      .map((item) => normalizeExcelCellValue(item))
      .filter((item) => item !== "")
      .join(", ");
  }

  // 객체
  if (typeof value === "object") {
    // toString() 메서드가 있으면 사용
    if (value.toString && typeof value.toString === "function") {
      const str = value.toString();
      // [object Object] 같은 기본 toString 결과는 JSON으로 변환
      if (str === "[object Object]") {
        try {
          return JSON.stringify(value);
        } catch (e) {
          return String(value);
        }
      }
      return str;
    }

    // JSON으로 변환 시도
    try {
      return JSON.stringify(value);
    } catch (e) {
      return String(value);
    }
  }

  // 그 외의 경우 문자열로 변환
  return String(value);
}

/**
 * 숫자 형식의 값을 숫자로 변환 (가격, 수량 등)
 * @param value 변환할 값
 * @returns 숫자 또는 빈 문자열
 */
export function normalizeNumberValue(value: any): number | string {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (typeof value === "number") {
    if (!isFinite(value)) {
      return "";
    }
    return value;
  }

  if (typeof value === "string") {
    // 쉼표 제거
    const cleaned = value.replace(/,/g, "").trim();
    const num = parseFloat(cleaned);

    if (!isNaN(num) && isFinite(num)) {
      return num;
    }
  }

  return "";
}

/**
 * 문자열 값을 정규화 (앞뒤 공백 제거, null/undefined 처리)
 * @param value 변환할 값
 * @returns 정규화된 문자열
 */
export function normalizeStringValue(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  // 숫자나 boolean은 문자열로 변환
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  // 배열이나 객체는 문자열로 변환
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (typeof value === "object") {
    if (value.toString && typeof value.toString === "function") {
      const str = value.toString();
      if (str === "[object Object]") {
        try {
          return JSON.stringify(value);
        } catch (e) {
          return String(value);
        }
      }
      return str;
    }

    try {
      return JSON.stringify(value);
    } catch (e) {
      return String(value);
    }
  }

  return String(value);
}

/**
 * Excel 수식 문자로 시작하는 문자열 이스케이프
 * (보안 위험 방지 - CSV Injection 방지)
 * @param value 체크할 값
 * @returns 안전한 값
 */
export function escapeExcelFormula(value: any): any {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();

  // Excel 수식 시작 문자: =, +, -, @, \t, \r
  const formulaStarters = ["=", "+", "-", "@", "\t", "\r"];

  if (formulaStarters.some((starter) => trimmed.startsWith(starter))) {
    // 작은따옴표를 앞에 붙여서 텍스트로 처리
    return "'" + trimmed;
  }

  return trimmed;
}

/**
 * Excel 셀에 설정하기 전 최종 값 정규화
 * @param value 원본 값
 * @param isNumberField 숫자 필드인지 여부
 * @returns Excel 셀에 설정할 값
 */
export function prepareExcelCellValue(
  value: any,
  isNumberField: boolean = false
): string | number | boolean | Date | null {
  // 1. 기본 타입 정규화
  let normalized = normalizeExcelCellValue(value);

  // 2. 숫자 필드인 경우 숫자로 변환 시도
  if (isNumberField && typeof normalized === "string") {
    const numValue = normalizeNumberValue(normalized);
    if (typeof numValue === "number") {
      return numValue;
    }
  }

  // 3. 문자열인 경우 수식 이스케이프
  if (typeof normalized === "string") {
    normalized = escapeExcelFormula(normalized);
  }

  return normalized;
}
