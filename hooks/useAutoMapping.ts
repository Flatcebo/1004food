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

  // 상품명 인덱스 자동 추출
  useEffect(() => {
    if (!tableData.length) {
      setHeaderIndex(null);
      return;
    }
    const headerRow = tableData[0];
    const nameIdx = headerRow.findIndex(
      (h: any) => h && typeof h === "string" && h.includes("상품명"),
    );
    setHeaderIndex({nameIdx});
  }, [tableData, setHeaderIndex]);

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

      // 코드 우선순위: 직접 입력(productCodeMap) > codes.json 자동 매칭
      let codeVal = newMap[name];

      // 온라인 유저: 발주서에 이미 있는 매핑코드 사용, 상품명 기반 자동 매핑 스킵
      // 일반 유저: 상품명 기반 자동 매핑도 수행
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
        // 일반 유저: 택배사가 있는 상품 우선 선택
        const productsWithPostType = codes.filter(
          (c: any) =>
            c.name === name && c.postType && String(c.postType).trim() !== "",
        );
        const productsWithoutPostType = codes.filter(
          (c: any) =>
            c.name === name &&
            (!c.postType || String(c.postType).trim() === ""),
        );
        found =
          productsWithPostType.length > 0
            ? productsWithPostType[0]
            : productsWithoutPostType[0];
        if (!codeVal && found?.code) codeVal = found.code;

        // 일반 유저만 매핑코드 컬럼 업데이트
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
