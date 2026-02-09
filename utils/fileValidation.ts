import {UploadedFile} from "@/stores/uploadStore";

interface ValidationOptions {
  userGrade?: string;
  codes?: Array<{
    name: string;
    code: string;
    id?: number | string;
    [key: string]: any;
  }>;
  productIdMap?: {[name: string]: string | number};
}

/**
 * 파일의 매핑코드와 업체명이 모두 입력되었는지 확인
 * @param file 검증할 파일 객체
 * @param options 검증 옵션 (userGrade, codes, productIdMap)
 * @returns 모든 row의 매핑코드와 업체명이 공란이 아니면 true, 검증 실패 이유를 포함한 객체
 */
export function checkFileValidation(
  file: UploadedFile | any,
  options?: ValidationOptions,
): {
  isValid: boolean;
  errors: string[];
} {
  const {userGrade, codes = [], productIdMap = {}} = options || {};
  if (!file || !file.tableData || !file.tableData.length) {
    console.log("파일 데이터가 없습니다:", file);
    return {isValid: false, errors: ["파일 데이터가 없습니다"]}; // 파일이 없거나 데이터가 없으면 무효
  }

  const errors: string[] = [];

  const headerRow = file.tableData[0];
  const nameIdx = file.headerIndex?.nameIdx;
  const mappingIdx = headerRow.findIndex(
    (h: any) => h === "매핑코드" || h === "매핑 코드",
  );
  const vendorIdx = headerRow.findIndex(
    (h: any) => h === "업체명" || h === "업체",
  );

  // 파일 레벨의 업체명 검증 (업체명 컬럼이 없는 경우에만 파일 레벨 업체명 필요)
  // 업체명 컬럼이 있으면 각 행의 업체명만 검증하므로 파일 레벨 업체명은 선택사항
  const fileVendorName = String(file.vendorName || "").trim();

  // 업체명 컬럼이 없고 파일 레벨 업체명도 없으면 에러
  if (vendorIdx === -1 && !fileVendorName) {
    const errorMsg = "파일의 업체명이 공란입니다. 업체명을 입력해주세요.";
    console.log(`❌ ${errorMsg}`, {
      fileName: file.fileName,
      vendorName: file.vendorName,
      vendorNameType: typeof file.vendorName,
    });
    errors.push(errorMsg);
  }
  const typeIdx = headerRow.findIndex((h: any) => h === "내외주");
  const postTypeIdx = headerRow.findIndex((h: any) => h === "택배사");
  const qtyIdx = headerRow.findIndex((h: any) => h === "수량");

  // 상품명 인덱스가 없으면 업체명만 확인
  if (typeof nameIdx !== "number" || nameIdx === -1) {
    if (vendorIdx === -1) return {isValid: true, errors: []};
    for (let i = 1; i < file.tableData.length; i++) {
      const row = file.tableData[i];
      const vendorName = String(row[vendorIdx] || "").trim();
      if (!vendorName) {
        const errorMsg = `행 ${i}: 업체명이 공란입니다.`;
        console.log(errorMsg);
        errors.push(errorMsg);
      }
    }
    return {isValid: errors.length === 0, errors};
  }

  // productCodeMap 가져오기
  const productCodeMap = file.productCodeMap || {};

  // 각 row를 확인
  for (let i = 1; i < file.tableData.length; i++) {
    const row = file.tableData[i];
    const productName = String(row[nameIdx] || "").trim();

    // 상품명이 없는 경우 검증 오류로 처리
    if (!productName) {
      const errorMsg = `행 ${i}: 상품명이 공란입니다.`;
      console.log(errorMsg);
      errors.push(errorMsg);
      continue; // 상품명이 없으면 매핑코드 등 다른 검증은 건너뛰기
    }

    // 매핑코드 확인
    let hasMappingCode = false;

    if (userGrade === "온라인") {
      // 온라인 유저: 실제로 DB에서 매핑된 상품이 있는지 확인
      // 수집된 매핑코드(row[mappingIdx])만으로는 검증 통과 불가
      const selectedProductId = productIdMap[productName];
      let matchedProduct = null;

      if (selectedProductId !== undefined) {
        // 사용자가 수동으로 선택한 상품이 있으면 매핑됨
        matchedProduct = codes.find((c: any) => c.id === selectedProductId);
      } else {
        // 상품명이 정확히 일치하는 상품이 있으면 자동 매핑
        matchedProduct = codes.find((c: any) => c.name === productName);
      }

      hasMappingCode = !!matchedProduct?.code;
    } else {
      // 일반 유저: 기존 로직 유지 (productCodeMap > 테이블 컬럼)
      let mappingCode = "";

      // 1. productCodeMap에서 먼저 확인
      mappingCode = productCodeMap[productName] || "";

      // 2. productCodeMap에 없으면 테이블 컬럼에서 확인
      if (!mappingCode && mappingIdx !== -1) {
        mappingCode = String(row[mappingIdx] || "").trim();
      }

      hasMappingCode = !!mappingCode;
    }

    // 업체명 확인
    const vendorName =
      vendorIdx !== -1 ? String(row[vendorIdx] || "").trim() : "";

    // 내외주 확인
    const type = typeIdx !== -1 ? String(row[typeIdx] || "").trim() : "";

    // 택배사 확인
    const postType =
      postTypeIdx !== -1 ? String(row[postTypeIdx] || "").trim() : "";

    // 매핑코드가 없으면 false
    if (!hasMappingCode) {
      const errorMsg = `행 ${i}: 매핑코드가 공란입니다. 상품명: "${productName}"`;
      console.log(errorMsg);
      errors.push(errorMsg);
    }

    // 업체명 컬럼이 있는 경우: 업체명이 공란이 아니어야 함
    if (vendorIdx !== -1 && !vendorName) {
      const errorMsg = `행 ${i}: 업체명이 공란입니다. 상품명: "${productName}"`;
      console.log(errorMsg);
      errors.push(errorMsg);
    }

    // 내외주/택배사는 검증에서 제외 (자동 매핑으로 채워질 수 있음)
  }

  // console.log("파일 검증 완료:", file.fileName, {
  //   isValid: errors.length === 0,
  //   errorCount: errors.length,
  // });
  return {isValid: errors.length === 0, errors}; // 모든 row의 매핑코드와 업체명이 공란이 아니면 true
}
