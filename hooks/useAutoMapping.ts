import {useEffect, useRef} from "react";

interface UseAutoMappingProps {
  tableData: any[][];
  codes: Array<{name: string; code: string; [key: string]: any}>;
  productCodeMap: {[name: string]: string};
  headerIndex: {nameIdx?: number} | null;
  setTableData: (data: any[][]) => void;
  setProductCodeMap: (map: {[name: string]: string}) => void;
  setHeaderIndex: (v: {nameIdx?: number} | null) => void;
}

export function useAutoMapping({
  tableData,
  codes,
  productCodeMap,
  headerIndex,
  setTableData,
  setProductCodeMap,
  setHeaderIndex,
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
      (h: any) => h && typeof h === "string" && h.includes("상품명")
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
      const found = codes.find((c: any) => c.name === name);
      if (!codeVal && found?.code) codeVal = found.code;

      if (mappingIdx >= 0 && codeVal && row[mappingIdx] !== codeVal) {
        if (!rowChanged) {
          updatedRow = [...row];
          rowChanged = true;
        }
        updatedRow[mappingIdx] = codeVal;
        changed = true;
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

      // productCodeMap에 비어있고 자동매칭된 코드가 있으면 map에도 채워둠
      if (!newMap[name] && found?.code) {
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
    if (
      originalKeys.length !== newKeys.length ||
      originalKeys.some((k) => productCodeMap[k] !== newMap[k])
    ) {
      setProductCodeMap(newMap);
    }
  }, [
    tableData,
    headerIndex,
    codes,
    productCodeMap,
    setTableData,
    setProductCodeMap,
  ]);

  return {
    codesOriginRef,
  };
}

