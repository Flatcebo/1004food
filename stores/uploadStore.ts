import {create} from "zustand";
import {RefObject, createRef} from "react";
import stringSimilarity from "string-similarity";
import * as XLSX from "xlsx";

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

  codes: Array<{name: string; code: string; [key: string]: any}>;
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
    const getSuggestions = get().getSuggestions;
    const suggestions = getSuggestions(value);
    const codes = get().codes;
    if (!suggestions.length) {
      // 직접 입력 모달 오픈, 모든 columns key 추출
      const fields = codes.length
        ? Object.keys(codes[0])
        : ["name", "code", "etc"];
      get().setDirectInputModal({
        open: true,
        fields,
        values: {name: value},
        rowIdx,
        targetName: value,
      });
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
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {header: 1});
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
  saveDirectInputModal: () => {
    const {
      directInputModal,
      productCodeMap,
      setProductCodeMap,
      setCodes,
      codes,
    }: any = get();
    if (directInputModal.values.name && directInputModal.values.code) {
      setProductCodeMap({
        ...productCodeMap,
        [directInputModal.values.name]: directInputModal.values.code,
      });
      setCodes([...codes, {...directInputModal.values}]); // codes에도 항상 push
    }
    set({directInputModal: {...directInputModal, open: false}});
  },
}));
