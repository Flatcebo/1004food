import {useEffect, useRef} from "react";

interface UseAutoMappingProps {
  tableData: any[][];
  codes: Array<{name: string; code: string; [key: string]: any}>;
  productCodeMap: {[name: string]: string};
  headerIndex: {nameIdx?: number} | null;
  setTableData: (data: any[][]) => void;
  setProductCodeMap: (map: {[name: string]: string}) => void;
  setHeaderIndex: (v: {nameIdx?: number} | null) => void;
  fileId?: string; // 파일 ID 추가
  userGrade?: string; // 사용자 등급 (온라인 유저는 상품명 기반 자동 매핑 스킵)
}

export function useAutoMapping({
  tableData,
  codes,
  productCodeMap,
  headerIndex,
  setTableData,
  setProductCodeMap,
  setHeaderIndex,
  fileId,
  userGrade,
}: UseAutoMappingProps) {
  const codesOriginRef = useRef<any[]>([]);

  useEffect(() => {
    if (codes.length && codesOriginRef.current.length === 0) {
      codesOriginRef.current = [...codes];
    }
  }, [codes]);

  // 상품명 인덱스 자동 추출 (값이 실제로 변경된 경우에만 업데이트하여 무한 루프 방지)
  useEffect(() => {
    if (!tableData.length) {
      if (headerIndex !== null) setHeaderIndex(null);
      return;
    }
    const headerRow = tableData[0];
    const nameIdx = headerRow.findIndex(
      (h: any) => h && typeof h === "string" && h.includes("상품명"),
    );
    if (headerIndex?.nameIdx === nameIdx) return;
    setHeaderIndex({nameIdx});
  }, [tableData, headerIndex, setHeaderIndex]);

  // 상품명 기준으로 매핑코드 + 타입(내외주) + postType(택배사) 컬럼 자동 연동
  useEffect(() => {
    if (
      !tableData.length ||
      !headerIndex ||
      typeof headerIndex.nameIdx !== "number"
    ) {
      return;
    }

    const headerRow = tableData[0];
    const nameIdx = headerIndex.nameIdx;

    const mappingIdx = headerRow.findIndex((h) => h === "매핑코드");
    const typeIdx = headerRow.findIndex((h) => h === "내외주");
    const postTypeIdx = headerRow.findIndex((h) => h === "택배사");
    const vendorIdx = headerRow.findIndex(
      (h) => h === "업체명" || h === "업체",
    );

    if (mappingIdx === -1 && typeIdx === -1 && postTypeIdx === -1) return;

    let changed = false;
    const newMap: {[name: string]: string} = {...productCodeMap};

    const newTable = tableData.map((row, idx) => {
      if (idx === 0) return row;

      const nameVal = row[nameIdx];
      if (!nameVal || typeof nameVal !== "string") return row;
      const name = nameVal.trim();
      if (!name) return row;

      let rowChanged = false;
      let updatedRow = row;

      // 온라인 유저: 직접 입력(productCodeMap) 사용
      // 온라인 외 유저: 상품명 완전 일치만 사용 (productCodeMap 사용 안 함)
      let codeVal: string | null | undefined =
        userGrade === "온라인" ? newMap[name] : undefined;

      // 온라인 유저: 발주서에 이미 있는 매핑코드 사용, 상품명 기반 자동 매핑 스킵
      // 온라인 외 유저: 상품명 완전 일치만 자동 매핑
      let found: any = null;

      if (userGrade === "온라인") {
        // 온라인 유저: 발주서에 있는 매핑코드를 그대로 사용 (덮어쓰지 않음)
        // 해당 매핑코드가 DB에 있으면 내외주/택배사만 업데이트
        const existingMappingCode =
          mappingIdx >= 0 ? String(row[mappingIdx] || "").trim() : "";
        if (existingMappingCode) {
          found = codes.find(
            (c: any) => c.code && String(c.code).trim() === existingMappingCode,
          );
        }
        // 온라인 유저는 매핑코드 컬럼을 덮어쓰지 않음 (발주서 원본 유지)
      } else {
        // 온라인 외 유저: 원본 상품명과 DB(codes) 상품명이 완전히 일치하는 것만 자동 매핑 (2순위 없음)
        found = codes.find(
          (c: any) => c.name && String(c.name).trim() === name,
        );
        codeVal = found?.code ?? null;

        // 온라인 외 유저만 매핑코드 컬럼 업데이트 (상품명 완전 일치 시에만)
        if (mappingIdx >= 0 && codeVal && row[mappingIdx] !== codeVal) {
          if (!rowChanged) {
            updatedRow = [...row];
            rowChanged = true;
          }
          updatedRow[mappingIdx] = codeVal;
          changed = true;
        }
      }

      if (found) {
        if (typeIdx >= 0 && found.type && row[typeIdx] !== found.type) {
          if (!rowChanged) {
            updatedRow = [...row];
            rowChanged = true;
          }
          updatedRow[typeIdx] = found.type;
          changed = true;
        }
        if (
          postTypeIdx >= 0 &&
          found.postType &&
          row[postTypeIdx] !== found.postType
        ) {
          if (!rowChanged) {
            updatedRow = [...row];
            rowChanged = true;
          }
          updatedRow[postTypeIdx] = found.postType;
          changed = true;
        }
        // 매입처명(purchase)도 업데이트 (온라인 유저 포함)
        if (
          vendorIdx >= 0 &&
          found.purchase &&
          String(found.purchase).trim() !== "" &&
          String(row[vendorIdx] || "").trim() !== String(found.purchase).trim()
        ) {
          if (!rowChanged) {
            updatedRow = [...row];
            rowChanged = true;
          }
          updatedRow[vendorIdx] = found.purchase;
          changed = true;
        }
      }

      // productCodeMap에 비어있고 자동매칭된 코드가 있으면 map에도 채워둠 (일반 유저만)
      if (userGrade !== "온라인" && !newMap[name] && found?.code) {
        newMap[name] = found.code;
      }

      return updatedRow;
    });

    if (changed) {
      setTableData(newTable);
    }
    // productCodeMap이 변경되었다면 갱신
    const originalKeys = Object.keys(productCodeMap);
    const newKeys = Object.keys(newMap);
    const productCodeMapChanged =
      originalKeys.length !== newKeys.length ||
      originalKeys.some((k) => productCodeMap[k] !== newMap[k]);

    if (productCodeMapChanged) {
      setProductCodeMap(newMap);
    }

    // console.log(codes);
    // console.log(productCodeMap);
    // console.log(newMap);

    // 변경사항이 있으면 sessionStorage에 최신 데이터 저장
    if (changed || productCodeMapChanged) {
      if (fileId) {
        const storedFileKey = `uploadedFile_${fileId}`;
        const storedFile = sessionStorage.getItem(storedFileKey);
        if (storedFile) {
          try {
            const parsedFile = JSON.parse(storedFile);
            // 최신 테이블 데이터와 productCodeMap으로 업데이트
            const updatedFile = {
              ...parsedFile,
              tableData: changed ? newTable : parsedFile.tableData,
              productCodeMap: productCodeMapChanged
                ? newMap
                : parsedFile.productCodeMap,
            };
            sessionStorage.setItem(storedFileKey, JSON.stringify(updatedFile));
            console.log(`sessionStorage 업데이트됨: ${fileId}`);
          } catch (error) {
            console.error("sessionStorage 업데이트 실패:", error);
          }
        }
      }
    }
  }, [
    tableData,
    headerIndex,
    codes,
    productCodeMap,
    setTableData,
    setProductCodeMap,
    fileId,
    userGrade,
  ]);

  return {
    codesOriginRef,
  };
}
