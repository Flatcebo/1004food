import {create} from "zustand";
import {RefObject, createRef} from "react";
import stringSimilarity from "string-similarity";
import * as XLSX from "xlsx";

type ColumnDef = {
  key: string;
  label: string;
  aliases: string[];
};

// 내부 절대 컬럼 순서 정의
const INTERNAL_COLUMNS: ColumnDef[] = [
  {
    key: "vendor",
    label: "업체명",
    aliases: ["업체명", "업체", "거래처명", "고객주문처명"],
  },
  {key: "inout", label: "내외주", aliases: ["내외주"]},
  {key: "carrier", label: "택배사", aliases: ["택배사", "택배사명", "택배"]},

  {
    key: "receiverName",
    label: "수취인명",
    aliases: ["수취인명", "수취인", "받는분", "받는 사람"],
  },
  {
    key: "receiverPhone",
    label: "수취인 전화번호",
    aliases: [
      "수취인 연락처",
      "수취인 전화",
      "수취인 전화번호",
      "수취인전화번호",
      "받는분연락처",
      "받는사람전화",
    ],
  },
  {
    key: "zip",
    label: "우편",
    aliases: ["우편", "우편번호", "우편번호(수취인)", "우편번호(배송지)"],
  },
  {
    key: "address",
    label: "주소",
    aliases: ["주소", "배송지주소", "수취인주소"],
  },
  {key: "qty", label: "수량", aliases: ["수량", "주문수량", "총수량"]},
  {
    key: "productName",
    label: "상품명",
    aliases: ["상품명", "아이템명", "품목명", "상품"],
  },

  {
    key: "ordererName",
    label: "주문자명",
    aliases: ["주문자명", "주문자", "주문자 이름"],
  },
  {
    key: "ordererPhone",
    label: "주문자 전화번호",
    aliases: ["주문자 연락처", "주문자 전화번화", "주문자전화번호"],
  },
  {
    key: "message",
    label: "배송메시지",
    aliases: ["배송메시지", "배송요청", "요청사항", "배송요청사항"],
  },
  // {
  //   key: "supplyPrice",
  //   label: "공급가",
  //   aliases: ["공급가", "공급가격", "상품공급가"],
  // },
  // {
  //   key: "box",
  //   label: "박스",
  //   aliases: ["박스", "박스정보", "박스크기"],
  // },
  // {
  //   key: "volume",
  //   label: "부피",
  //   aliases: ["부피", "용량", "중량", "무게"],
  // },
  // {
  //   key: "packageMat",
  //   label: "포장재",
  //   aliases: ["포장재", "포장자재", "포장방법", "포장"],
  // },
];

export interface UploadStoreState {
  tableData: any[][];
  setTableData: (data: any[][]) => void;

  isModalOpen: boolean;
  setIsModalOpen: (v: boolean) => void;

  dragActive: boolean;
  setDragActive: (v: boolean) => void;

  fileInputRef: RefObject<HTMLInputElement>;
  setFileInputRef: (ref: RefObject<HTMLInputElement>) => void;

  fileName: string;
  setFileName: (v: string) => void;

  codes: Array<{name: string; code: string; [key: string]: any} | any>;
  setCodes: (
    codes: Array<{name: string; code: string; [key: string]: any}>
  ) => void;

  productCodeMap: {[name: string]: string};
  setProductCodeMap: (map: {[name: string]: string}) => void;

  headerIndex: {nameIdx?: number} | null;
  setHeaderIndex: (v: {nameIdx?: number} | null) => void;

  recommendIdx: number | null;
  setRecommendIdx: (idx: number | null) => void;
  recommendList: Array<{name: string; code: string; [key: string]: any}>;
  setRecommendList: (
    list: Array<{name: string; code: string; [key: string]: any}>
  ) => void;

  directInputModal: {
    open: boolean;
    fields: string[];
    values: {[key: string]: string};
    rowIdx: number | null;
    targetName: string;
  };
  setDirectInputModal: (modalState: {
    open: boolean;
    fields: string[];
    values: {[key: string]: string};
    rowIdx: number | null;
    targetName: string;
  }) => void;
  setDirectInputValue: (k: string, v: string) => void;
  closeDirectInputModal: () => void;
  saveDirectInputModal: () => void;
  openDirectInputModal: (targetName: string, rowIdx: number | null) => void;

  handleCodeMatch: () => void;
  handleInputCode: (name: string, code: string) => void;
  handleSave: () => void;
  getSuggestions: (
    inputValue: string
  ) => Array<{name: string; code: string; [key: string]: any}>;
  handleRecommendClick: (rowIdx: number, value: string) => void;
  handleSelectSuggest: (name: string, code: string) => void;
  handleFile: (file: File) => void;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export const useUploadStore = create<UploadStoreState>((set, get) => ({
  tableData: [],
  setTableData: (data) => set({tableData: data}),
  isModalOpen: false,
  setIsModalOpen: (v) => set({isModalOpen: v}),
  dragActive: false,
  setDragActive: (v) => set({dragActive: v}),
  fileInputRef: createRef<HTMLInputElement | any>(),
  setFileInputRef: (ref) => set({fileInputRef: ref}),
  fileName: "",
  setFileName: (v) => set({fileName: v}),
  codes: [],
  setCodes: (codes) => set({codes}),
  productCodeMap: {},
  setProductCodeMap: (map) => set({productCodeMap: map}),
  headerIndex: null,
  setHeaderIndex: (v) => set({headerIndex: v}),
  recommendIdx: null,
  setRecommendIdx: (idx) => set({recommendIdx: idx}),
  recommendList: [],
  setRecommendList: (list) => set({recommendList: list}),

  handleCodeMatch: () => {
    const {headerIndex, tableData, codes, setProductCodeMap} = get();
    if (
      !headerIndex ||
      typeof headerIndex.nameIdx !== "number" ||
      headerIndex.nameIdx === -1
    ) {
      return;
    }
    const _map: {[name: string]: string} = {};
    (tableData.slice(1) as any[][]).forEach((row) => {
      if (typeof headerIndex.nameIdx === "number" && row[headerIndex.nameIdx]) {
        const name = row[headerIndex.nameIdx] as string;
        const found = codes.find((c: any) => c.name === name);
        if (found) _map[name] = found.code;
      }
    });
    setProductCodeMap(_map);
  },
  handleInputCode: (name, code) => {
    const {productCodeMap, setProductCodeMap} = get();
    setProductCodeMap({...productCodeMap, [name]: code});
  },
  handleSave: () => {
    const {headerIndex, tableData, productCodeMap} = get();
    if (!headerIndex || headerIndex.nameIdx === -1) return;
    const merged = tableData.slice(1).map((row) => {
      let name = "";
      if (typeof headerIndex?.nameIdx === "number") {
        name = row[headerIndex.nameIdx] as string;
      }
      return {
        ...row,
        상품명: name,
        code: name ? productCodeMap[name] || "" : "",
      };
    });
    console.log(merged);
    alert("저장됨! 콘솔(log) 참고");
  },
  getSuggestions: (inputValue: string) => {
    const codes = get().codes;
    const codeNames: string[] = codes.map((c: any) => c.name);
    const results = stringSimilarity.findBestMatch(inputValue, codeNames);
    return results.ratings
      .sort((a: any, b: any) => b.rating - a.rating)
      .filter((r: any) => r.rating > 0.3)
      .slice(0, 5)
      .map((r: any) => codes.find((c: any) => c.name === r.target))
      .filter((it: any): it is {name: string; code: string} => !!it);
  },
  handleRecommendClick: (rowIdx, value) => {
    const suggestions = get().getSuggestions(value);
    if (!suggestions.length) {
      get().openDirectInputModal(value, rowIdx);
      return;
    }
    get().setRecommendIdx(rowIdx);
    get().setRecommendList(suggestions as {name: string; code: string}[]);
  },
  handleSelectSuggest: (name, code) => {
    const {productCodeMap, setProductCodeMap, setRecommendIdx} = get();
    setProductCodeMap({...productCodeMap, [name]: code});
    setRecommendIdx(null);
  },
  handleFile: (file) => {
    const {setFileName, setTableData} = get();
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, {type: "array"});
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const raw = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
      }) as any[][];

      if (!raw.length) {
        setTableData([]);
        return;
      }

      const rawHeader = raw[0] as any[];
      const normalize = (v: any) =>
        typeof v === "string" ? v.replace(/\s+/g, "").toLowerCase() : "";

      // 각 내부 컬럼에 대응하는 원본 인덱스 계산
      const indexMap: {[key: string]: number} = {};
      INTERNAL_COLUMNS.forEach((col) => {
        const idx = rawHeader.findIndex((h) =>
          col.aliases.some((al) => normalize(h) === normalize(al))
        );
        indexMap[col.key] = idx; // 없으면 -1
      });

      // 내부 절대 순서로 헤더/데이터 재구성
      const canonicalHeader = INTERNAL_COLUMNS.map((c) => c.label);
      const canonicalRows = raw.slice(1).map((row) =>
        INTERNAL_COLUMNS.map((c) => {
          const idx = indexMap[c.key];
          let value = idx >= 0 ? row[idx] ?? "" : "";

          // 박스, 부피 기본값 자동 세팅
          if (
            value === undefined ||
            value === null ||
            String(value).trim() === ""
          ) {
            if (c.key === "box") {
              value = 2;
            } else if (c.key === "volume") {
              value = 60;
            }
          }

          return value;
        })
      );

      const jsonData = [canonicalHeader, ...canonicalRows];

      // 수취인명/이름(내부 컬럼 기준) 동명이인 번호 붙이기
      if (jsonData.length > 1) {
        const headerRow = jsonData[0] as any[];
        const receiverIdx = headerRow.findIndex(
          (h: any) =>
            h &&
            typeof h === "string" &&
            (h.includes("수취인명") || h === "이름")
        );

        if (receiverIdx !== -1) {
          const nameCount: {[name: string]: number} = {};
          for (let i = 1; i < jsonData.length; i += 1) {
            const row = jsonData[i];
            const rawName = row[receiverIdx];
            if (!rawName || typeof rawName !== "string") continue;

            const name = rawName.trim();
            if (!name) continue;

            const count = nameCount[name] ?? 0;
            if (count > 0) {
              row[receiverIdx] = `${name}${count}`;
            }
            nameCount[name] = count + 1;
          }
        }
      }

      setTableData(jsonData as any[][]);
    };
    reader.readAsArrayBuffer(file);
  },
  handleFileChange: (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    get().handleFile(file);
  },
  directInputModal: {
    open: false,
    fields: [] as string[],
    values: {} as {[key: string]: string},
    rowIdx: null as number | null,
    targetName: "",
  },
  setDirectInputModal: (modalState) => set({directInputModal: modalState}),
  setDirectInputValue: (k: string, v: string) => {
    set((state: any) => ({
      directInputModal: {
        ...state.directInputModal,
        values: {...state.directInputModal.values, [k]: v},
      },
    }));
  },
  closeDirectInputModal: () => {
    set((state: any) => ({
      directInputModal: {...state.directInputModal, open: false},
    }));
  },
  openDirectInputModal: (targetName, rowIdx) => {
    const codes = get().codes;
    const baseFields = codes.length
      ? Object.keys(codes[0])
      : ["name", "code", "etc"];
    const fields = baseFields.filter((k) => k !== "id");
    get().setDirectInputModal({
      open: true,
      fields,
      values: {name: targetName},
      rowIdx,
      targetName,
    });
  },
  saveDirectInputModal: () => {
    const {
      directInputModal,
      productCodeMap,
      setProductCodeMap,
      setCodes,
      codes,
    } = get();

    const values = directInputModal.values;

    // 필수값: id, etc를 제외한 모든 필드는 값이 있어야 저장
    const requiredKeys = directInputModal.fields.filter(
      (k) => k !== "id" && k !== "etc"
    );
    const hasAllRequired = requiredKeys.every((k) => {
      const v = values[k];
      return v !== undefined && v !== null && String(v).trim() !== "";
    });

    if (!hasAllRequired) {
      alert("필수 항목이 모두 입력되어야 저장됩니다. (etc는 선택 사항)");
      return;
    }

    if (values.name && values.code) {
      setProductCodeMap({
        ...productCodeMap,
        [values.name]: values.code,
      });
      setCodes([...codes, {...values}]); // codes에도 항상 push
    }
    set({directInputModal: {...directInputModal, open: false}});
  },
}));
