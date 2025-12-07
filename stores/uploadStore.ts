import {create} from "zustand";
import {RefObject, createRef} from "react";
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
    aliases: [
      "배송메시지",
      "배송메세지",
      "배송요청",
      "요청사항",
      "배송요청사항",
    ],
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

export interface UploadedFile {
  id: string;
  fileName: string;
  rowCount: number;
  tableData: any[][];
  headerIndex: {nameIdx?: number} | null;
  productCodeMap: {[name: string]: string};
}

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

  uploadedFiles: UploadedFile[];
  setUploadedFiles: (files: UploadedFile[]) => void;
  addUploadedFile: (file: UploadedFile) => void;
  removeUploadedFile: (id: string) => void;
  confirmedFiles: Set<string>;
  confirmFile: (fileId: string) => void;
  unconfirmFile: (fileId: string) => void;

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

  handleInputCode: (name: string, code: string) => void;
  getSuggestions: (
    inputValue: string
  ) => Promise<Array<{name: string; code: string; [key: string]: any}>>;
  handleRecommendClick: (rowIdx: number, value: string) => void;
  handleSelectSuggest: (name: string, code: string) => void;
  handleFile: (file: File) => void;
  handleFiles: (files: File[]) => void;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  openFileInNewWindow: (fileId: string) => void;
  processFile: (file: File) => Promise<UploadedFile>;
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
  uploadedFiles: [],
  setUploadedFiles: (files) => set({uploadedFiles: files}),
  addUploadedFile: (file) =>
    set((state) => ({
      uploadedFiles: [...state.uploadedFiles, file],
    })),
  removeUploadedFile: (id) =>
    set((state) => ({
      uploadedFiles: state.uploadedFiles.filter((f) => f.id !== id),
    })),
  confirmedFiles: new Set<string>(),
  confirmFile: (fileId) =>
    set((state) => {
      const newSet = new Set(state.confirmedFiles);
      newSet.add(fileId);
      return {confirmedFiles: newSet};
    }),
  unconfirmFile: (fileId) =>
    set((state) => {
      const newSet = new Set(state.confirmedFiles);
      newSet.delete(fileId);
      return {confirmedFiles: newSet};
    }),
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

  handleInputCode: (name, code) => {
    const {productCodeMap, setProductCodeMap} = get();
    setProductCodeMap({...productCodeMap, [name]: code});
  },
  getSuggestions: async (inputValue: string) => {
    try {
      const response = await fetch("/api/products/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({productName: inputValue}),
      });

      const result = await response.json();
      if (result.success) {
        return result.data || [];
      }
      return [];
    } catch (error) {
      console.error("상품 검색 실패:", error);
      return [];
    }
  },
  handleRecommendClick: async (rowIdx, value) => {
    const suggestions = await get().getSuggestions(value);
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
  processFile: (file: File): Promise<UploadedFile> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);

          // 파일 형식 확인 및 읽기 옵션 설정
          let workbook;
          try {
            // Google Sheets에서 다운로드한 파일을 위한 옵션 추가
            workbook = XLSX.read(data, {
              type: "array",
              cellStyles: false,
              cellDates: false,
              cellNF: false,
              cellText: false,
              raw: false,
              dense: false,
            });
          } catch (readError: any) {
            // 첫 번째 시도 실패 시 다른 옵션으로 재시도
            try {
              workbook = XLSX.read(data, {
                type: "array",
                raw: true,
              });
            } catch (retryError: any) {
              reject(
                new Error(
                  `파일을 읽을 수 없습니다. 파일 형식을 확인해주세요. (${
                    readError.message || "알 수 없는 오류"
                  })`
                )
              );
              return;
            }
          }

          if (
            !workbook ||
            !workbook.SheetNames ||
            workbook.SheetNames.length === 0
          ) {
            reject(new Error("파일에 워크시트가 없습니다."));
            return;
          }

          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];

          if (!worksheet) {
            reject(new Error("워크시트를 찾을 수 없습니다."));
            return;
          }

          // Google Sheets 파일을 위한 옵션 추가
          const raw = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: "", // 빈 셀을 빈 문자열로 처리
            raw: false, // 포맷된 값 사용
            dateNF: "yyyy-mm-dd", // 날짜 형식
          }) as any[][];

          if (!raw.length) {
            reject(new Error("파일이 비어있습니다."));
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

          // 업체명 기반 배송메시지 자동 입력
          if (jsonData.length > 1) {
            const headerRow = jsonData[0] as any[];
            const vendorIdx = headerRow.findIndex(
              (h: any) => h && typeof h === "string" && h === "업체명"
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

            if (vendorIdx !== -1 && messageIdx !== -1) {
              for (let i = 1; i < jsonData.length; i += 1) {
                const row = jsonData[i];
                const vendorName = row[vendorIdx];
                const currentMessage = row[messageIdx];

                // 업체명이 있으면 배송메시지에 자동 입력
                if (vendorName && typeof vendorName === "string") {
                  const vendorStr = String(vendorName).trim();
                  if (vendorStr) {
                    // 5글자 이상이면 앞 2글자만, 4글자 이하면 전체
                    const vendorPrefix =
                      vendorStr.length > 4
                        ? vendorStr.substring(0, 2)
                        : vendorStr;

                    // 배송메시지가 비어있으면 업체명만 입력
                    if (
                      !currentMessage ||
                      currentMessage === null ||
                      String(currentMessage).trim() === ""
                    ) {
                      row[messageIdx] = vendorPrefix;
                    } else {
                      // 배송메시지가 이미 있으면 앞에 업체명 + 띄어쓰기 추가
                      const existingMessage = String(currentMessage).trim();
                      row[messageIdx] = `${vendorPrefix} ${existingMessage}`;
                    }
                  }
                }
              }
            }
          }

          // 주문자명/주문자 전화번호가 공란인 경우 수취인명/수취인 전화번호로 자동 입력
          if (jsonData.length > 1) {
            const headerRow = jsonData[0] as any[];
            const receiverNameIdx = headerRow.findIndex(
              (h: any) =>
                h &&
                typeof h === "string" &&
                (h === "수취인명" || h.includes("수취인명"))
            );
            const receiverPhoneIdx = headerRow.findIndex(
              (h: any) =>
                h &&
                typeof h === "string" &&
                (h === "수취인 전화번호" ||
                  h.includes("수취인 전화번호") ||
                  h.includes("수취인 연락처"))
            );
            const ordererNameIdx = headerRow.findIndex(
              (h: any) =>
                h &&
                typeof h === "string" &&
                (h === "주문자명" || h.includes("주문자명"))
            );
            const ordererPhoneIdx = headerRow.findIndex(
              (h: any) =>
                h &&
                typeof h === "string" &&
                (h === "주문자 전화번호" ||
                  h.includes("주문자 전화번호") ||
                  h.includes("주문자 연락처"))
            );

            if (
              receiverNameIdx !== -1 &&
              receiverPhoneIdx !== -1 &&
              ordererNameIdx !== -1 &&
              ordererPhoneIdx !== -1
            ) {
              for (let i = 1; i < jsonData.length; i += 1) {
                const row = jsonData[i];
                const receiverName = row[receiverNameIdx];
                const receiverPhone = row[receiverPhoneIdx];
                const ordererName = row[ordererNameIdx];
                const ordererPhone = row[ordererPhoneIdx];

                // 주문자명이 공란이고 수취인명이 있으면 수취인명으로 자동 입력
                if (
                  (!ordererName ||
                    ordererName === null ||
                    String(ordererName).trim() === "") &&
                  receiverName &&
                  String(receiverName).trim() !== ""
                ) {
                  row[ordererNameIdx] = receiverName;
                }

                // 주문자 전화번호가 공란이고 수취인 전화번호가 있으면 수취인 전화번호로 자동 입력
                if (
                  (!ordererPhone ||
                    ordererPhone === null ||
                    String(ordererPhone).trim() === "") &&
                  receiverPhone &&
                  String(receiverPhone).trim() !== ""
                ) {
                  row[ordererPhoneIdx] = receiverPhone;
                }
              }
            }
          }

          // 상품명 인덱스 찾기
          const headerRow = jsonData[0] as any[];
          const nameIdx = headerRow.findIndex(
            (h: any) => h && typeof h === "string" && h.includes("상품명")
          );

          const uploadedFile: UploadedFile = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            fileName: file.name,
            rowCount: jsonData.length - 1,
            tableData: jsonData as any[][],
            headerIndex: nameIdx !== -1 ? {nameIdx} : null,
            productCodeMap: {},
          };

          resolve(uploadedFile);
        } catch (error: any) {
          console.error("파일 처리 중 오류:", error);
          reject(
            new Error(
              `파일 처리 중 오류가 발생했습니다: ${
                error.message || "알 수 없는 오류"
              }`
            )
          );
        }
      };
      reader.onerror = (error) => {
        console.error("파일 읽기 실패:", error);
        reject(
          new Error(
            `파일을 읽을 수 없습니다. 파일이 손상되었거나 지원하지 않는 형식일 수 있습니다.`
          )
        );
      };
      reader.readAsArrayBuffer(file);
    });
  },
  handleFile: (file) => {
    get()
      .processFile(file)
      .then((uploadedFile) => {
        get().addUploadedFile(uploadedFile);
        get().setFileName(file.name);
        get().setTableData(uploadedFile.tableData);
      })
      .catch((error: any) => {
        console.error("파일 처리 실패:", error);
        alert(`파일 처리 실패: ${error.message}`);
      });
  },
  handleFiles: async (files: File[]) => {
    const {addUploadedFile} = get();
    const promises = Array.from(files).map((file) => get().processFile(file));
    try {
      const uploadedFiles = await Promise.all(promises);
      uploadedFiles.forEach((file) => addUploadedFile(file));
    } catch (error: any) {
      console.error("파일 처리 실패:", error);
      alert(`일부 파일 처리 실패: ${error}`);
    }
  },
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    if (files.length === 1) {
      get().handleFile(files[0]);
    } else {
      get().handleFiles(Array.from(files));
    }
  },
  openFileInNewWindow: (fileId: string) => {
    const {uploadedFiles} = get();
    const file = uploadedFiles.find((f) => f.id === fileId);
    if (!file) return;

    // sessionStorage에 파일 데이터 저장
    try {
      sessionStorage.setItem(`uploadedFile_${fileId}`, JSON.stringify(file));
    } catch (error) {
      console.error("sessionStorage 저장 실패:", error);
    }

    // 새 창 열기
    const url = `/upload/view?id=${fileId}`;
    const newWindow = window.open(url, "_blank", "width=1200,height=800");
    if (!newWindow) {
      alert("팝업이 차단되었습니다. 팝업 차단을 해제해주세요.");
      return;
    }
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
    // 필드 순서 정의: 내외주/택배사/상품명/사방넷명/매핑코드/가격/판매가/택배비/카테고리/매입처/상품구분/세금구분/기타
    const fieldOrder = [
      "type",
      "postType",
      "name",
      "sabangName",
      "code",
      "price",
      "salePrice",
      "postFee",
      "category",
      "purchase",
      "productType",
      "billType",
      "etc",
    ];

    const codes = get().codes;
    // codes에서 사용 가능한 필드 확인
    const availableFields = codes.length
      ? Object.keys(codes[0]).filter(
          (k) => k !== "id" && k !== "createdAt" && k !== "updatedAt"
        )
      : fieldOrder;

    // 필드 순서에 맞게 정렬하고, 사용 가능한 필드만 포함
    const fields = fieldOrder.filter((field) =>
      availableFields.includes(field)
    );

    get().setDirectInputModal({
      open: true,
      fields,
      values: {name: targetName},
      rowIdx,
      targetName,
    });
  },
  saveDirectInputModal: async () => {
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
      try {
        // 서버에 상품 저장
        const response = await fetch("/api/products/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: values.type,
            postType: values.postType,
            name: values.name,
            code: values.code,
            pkg: values.pkg,
            price: values.price ? parseInt(values.price) : null,
            salePrice: values.salePrice ? parseInt(values.salePrice) : null,
            postFee: values.postFee ? parseInt(values.postFee) : null,
            purchase: values.purchase,
            billType: values.billType,
            category: values.category,
            productType: values.productType,
            sabangName: values.sabangName,
            etc: values.etc,
          }),
        });

        const result = await response.json();
        if (result.success) {
          setProductCodeMap({
            ...productCodeMap,
            [values.name]: values.code,
          });
          // 로컬 codes에도 추가 (즉시 반영)
          setCodes([...codes, {...values}]);
        } else {
          alert(`상품 저장 실패: ${result.error}`);
          return;
        }
      } catch (error: any) {
        console.error("상품 저장 실패:", error);
        alert(`상품 저장 중 오류가 발생했습니다: ${error.message}`);
        return;
      }
    }
    set({directInputModal: {...directInputModal, open: false}});
  },
}));
