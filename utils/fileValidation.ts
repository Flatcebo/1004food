import {UploadedFile} from "@/stores/uploadStore";

/**
 * 파일의 매핑코드와 업체명이 모두 입력되었는지 확인
 * @param file 검증할 파일 객체
 * @returns 모든 row의 매핑코드와 업체명이 공란이 아니면 true, 검증 실패 이유를 포함한 객체
 */
export function checkFileValidation(file: UploadedFile | any): {
  isValid: boolean;
  errors: string[];
} {
  if (!file || !file.tableData || !file.tableData.length) {
    console.log("파일 데이터가 없습니다:", file);
    return {isValid: false, errors: ["파일 데이터가 없습니다"]}; // 파일이 없거나 데이터가 없으면 무효
  }

  const headerRow = file.tableData[0];
  const nameIdx = file.headerIndex?.nameIdx;
  const mappingIdx = headerRow.findIndex(
    (h: any) => h === "매핑코드" || h === "매핑 코드"
  );
  const vendorIdx = headerRow.findIndex(
    (h: any) => h === "업체명" || h === "업체"
  );
  const typeIdx = headerRow.findIndex((h: any) => h === "내외주");
  const postTypeIdx = headerRow.findIndex((h: any) => h === "택배사");
  const qtyIdx = headerRow.findIndex((h: any) => h === "수량");

  const errors: string[] = [];

  console.log("파일 검증 시작:", {
    fileName: file.fileName,
    nameIdx,
    mappingIdx,
    vendorIdx,
    qtyIdx,
    rowCount: file.tableData.length - 1,
    productCodeMapKeys: Object.keys(file.productCodeMap || {}),
  });

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

    // 매핑코드 확인 (우선순위: productCodeMap > 테이블 컬럼)
    let mappingCode = "";

    // 1. productCodeMap에서 먼저 확인
    mappingCode = productCodeMap[productName] || "";

    // 2. productCodeMap에 없으면 테이블 컬럼에서 확인
    if (!mappingCode && mappingIdx !== -1) {
      mappingCode = String(row[mappingIdx] || "").trim();
    }

    // 업체명 확인
    const vendorName =
      vendorIdx !== -1 ? String(row[vendorIdx] || "").trim() : "";

    // 내외주 확인
    const type = typeIdx !== -1 ? String(row[typeIdx] || "").trim() : "";

    // 택배사 확인
    const postType =
      postTypeIdx !== -1 ? String(row[postTypeIdx] || "").trim() : "";

    console.log(`행 ${i} 검증:`, {
      productName,
      mappingCode,
      vendorName,
      type,
      postType,
      hasProductCodeMap: !!productCodeMap[productName],
      hasTableMapping:
        mappingIdx !== -1 && !!String(row[mappingIdx] || "").trim(),
    });

    // 매핑코드가 없으면 false
    if (!mappingCode) {
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

    // 내외주 컬럼이 있는 경우: 내외주가 공란이 아니어야 함
    if (typeIdx !== -1 && !type) {
      const errorMsg = `행 ${i}: 내외주가 공란입니다. 상품명: "${productName}"`;
      console.log(errorMsg);
      errors.push(errorMsg);
    }

    // 택배사 컬럼이 있는 경우: 택배사가 공란이 아니어야 함
    // if (postTypeIdx !== -1 && !postType) {
    //   const errorMsg = `행 ${i}: 택배사가 공란입니다. 상품명: "${productName}"`;
    //   console.log(errorMsg);
    //   errors.push(errorMsg);
    // }
  }

  // console.log("파일 검증 완료:", file.fileName, {
  //   isValid: errors.length === 0,
  //   errorCount: errors.length,
  // });
  return {isValid: errors.length === 0, errors}; // 모든 row의 매핑코드와 업체명이 공란이 아니면 true
}
