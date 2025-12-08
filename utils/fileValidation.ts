import {UploadedFile} from "@/stores/uploadStore";

/**
 * 파일의 매핑코드와 업체명이 모두 입력되었는지 확인
 * @param file 검증할 파일 객체
 * @returns 모든 row의 매핑코드와 업체명이 공란이 아니면 true
 */
export function checkFileValidation(file: UploadedFile | any): boolean {
  if (!file.tableData || !file.tableData.length) return true; // 데이터가 없으면 유효

  const headerRow = file.tableData[0];
  const nameIdx = file.headerIndex?.nameIdx;
  const mappingIdx = headerRow.findIndex(
    (h: any) => h === "매핑코드" || h === "매핑 코드"
  );
  const vendorIdx = headerRow.findIndex(
    (h: any) => h === "업체명" || h === "업체"
  );
  const messageIdx = headerRow.findIndex(
    (h: any) =>
      h &&
      typeof h === "string" &&
      (h === "배송메시지" ||
        h === "배송메세지" ||
        h === "배송요청" ||
        h === "요청사항" ||
        h === "배송요청사항")
  );

  // 상품명 인덱스가 없으면 유효로 간주 (데이터 구조가 맞지 않음)
  if (typeof nameIdx !== "number" || nameIdx === -1) {
    // 업체명만 확인
    if (vendorIdx === -1) return true;
    for (let i = 1; i < file.tableData.length; i++) {
      const row = file.tableData[i];
      const vendorName = String(row[vendorIdx] || "").trim();
      if (!vendorName) return false;
    }
    return true;
  }

  // productCodeMap 가져오기
  const productCodeMap = file.productCodeMap || {};

  // 각 row를 확인
  for (let i = 1; i < file.tableData.length; i++) {
    const row = file.tableData[i];
    const productName = String(row[nameIdx] || "").trim();

    // 매핑코드 확인 (우선순위: productCodeMap > 테이블 컬럼)
    let mappingCode = "";
    if (productName) {
      // productCodeMap에서 먼저 확인
      mappingCode = productCodeMap[productName] || "";
      // productCodeMap에 없으면 테이블 컬럼에서 확인
      if (!mappingCode && mappingIdx !== -1) {
        mappingCode = String(row[mappingIdx] || "").trim();
      }
    } else if (mappingIdx !== -1) {
      // 상품명이 없어도 매핑코드 컬럼이 있으면 확인
      mappingCode = String(row[mappingIdx] || "").trim();
    }

    // 업체명 확인
    const vendorName =
      vendorIdx !== -1 ? String(row[vendorIdx] || "").trim() : "";

    // 배송메시지 확인
    const message =
      messageIdx !== -1 ? String(row[messageIdx] || "").trim() : "";

    // 매핑코드 체크: 상품명이 있으면 매핑코드가 반드시 있어야 함
    // 또는 매핑코드 컬럼이 있으면 매핑코드가 있어야 함
    if (productName || mappingIdx !== -1) {
      if (!mappingCode) {
        return false; // 상품명이 있거나 매핑코드 컬럼이 있는데 매핑코드가 공란이면 false
      }
    }

    // 업체명 컬럼이 있는 경우: 업체명이 공란이 아니어야 함
    if (vendorIdx !== -1) {
      if (!vendorName) {
        return false; // 업체명이 공란이면 false
      }
    }

    // 배송메시지 컬럼이 있는 경우: 배송메시지가 공란이 아니어야 함
    if (messageIdx !== -1) {
      if (!message) {
        return false; // 배송메시지가 공란이면 false
      }
    }
  }

  return true; // 모든 row의 매핑코드와 업체명이 공란이 아니면 true
}
