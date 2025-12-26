import {create} from "zustand";
import {RefObject, createRef} from "react";
import * as XLSX from "xlsx";
import {
  UploadSession,
  getCurrentSessionId,
  getCurrentSession,
  setCurrentSession,
  createNewSession,
  getAllSessions,
  switchSession,
  deleteSession,
} from "@/utils/sessionUtils";
import {useAuthStore} from "@/stores/authStore";
import {
  detectHeaderRowByColumnAliases,
  normalizeHeader,
} from "@/utils/excelHeaderDetection";

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
    aliases: ["업체명", "업체", "거래처명", "고객주문처명", "매입처명"],
  },
  {
    key: "shopName",
    label: "쇼핑몰명",
    aliases: ["쇼핑몰명(1)", "쇼핑몰명", "쇼핑몰", "몰명"],
  },
  {key: "inout", label: "내외주", aliases: ["내외주"]},
  {
    key: "carrier",
    label: "택배사",
    aliases: ["택배사", "택배사명", "택배", "배송사"],
  },

  {
    key: "receiverName",
    label: "수취인명",
    aliases: [
      "수취인명",
      "수취인",
      "받는분",
      "받는 사람",
      "수령인",
      "받는분",
      "받는분성명",
    ],
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
      "수령인전화번호",
      "수령인 전화번호",
      "수령인 전화번호1",
      "수취인 전화번호1",
      "받는분전화번호",
    ],
  },
  {
    key: "zip",
    label: "우편",
    aliases: [
      "우편",
      "우편번호",
      "우편번호(수취인)",
      "우편번호(배송지)",
      "수취인우편번호(1)",
    ],
  },
  {
    key: "address",
    label: "주소",
    aliases: [
      "주소",
      "배송지주소",
      "수취인주소",
      "수령인주소",
      "수령인 주소",
      "받는분주소",
      "받는분 주소",
      "통합배송지",
      "통합 배송지",
      "수취인주소(4)",
    ],
  },
  {key: "qty", label: "수량", aliases: ["수량", "주문수량", "총수량"]},
  {
    key: "productName",
    label: "상품명",
    aliases: [
      "상품명",
      "아이템명",
      "품목명",
      "상품",
      "품목명",
      "주문상품명",
      "상품명(확정)",
    ],
  },

  {
    key: "ordererName",
    label: "주문자명",
    aliases: ["주문자명", "주문자", "주문자 이름", "보내는분성명"],
  },
  {
    key: "ordererPhone",
    label: "주문자 전화번호",
    aliases: [
      "주문자 연락처",
      "주문자 전화번화",
      "주문자전화번호",
      "주문자전화번호1",
      "보내는분전화번호",
    ],
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
  {
    key: "orderCode",
    label: "주문번호",
    aliases: [
      "주문번호",
      "주문번호(사방넷)",
      "주문번호(쇼핑몰)",
      "주문 번호",
      "order_code",
      "orderCode",
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
  // 세션 관리
  currentSession: UploadSession | null;
  availableSessions: UploadSession[];
  selectedSessionId: string | null; // 'all' 또는 특정 세션 ID
  setCurrentSession: (session: UploadSession | null) => void;
  setAvailableSessions: (sessions: UploadSession[]) => void;
  setSelectedSessionId: (sessionId: string | null) => void;
  loadSessions: () => Promise<void>;
  createSession: (sessionName: string) => Promise<boolean>;
  switchToSession: (session: UploadSession) => void;
  deleteCurrentSession: () => Promise<boolean>;
  selectSession: (sessionId: string | null) => void;

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
  saveFilesToServer: () => Promise<boolean>;
  loadFilesFromServer: () => Promise<void>;

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
  productModal: {
    open: boolean;
    productName: string;
    rowIdx: number | null;
  };
  setProductModal: (modalState: {
    open: boolean;
    productName: string;
    rowIdx: number | null;
  }) => void;
  closeProductModal: () => void;
  openProductModal: (targetName: string, rowIdx: number | null) => void;

  handleInputCode: (name: string, code: string) => void;
  getSuggestions: (
    inputValue: string
  ) => Promise<Array<{name: string; code: string; [key: string]: any}>>;
  handleRecommendClick: (rowIdx: number, value: string) => void;
  handleSelectSuggest: (name: string, code: string, id?: number) => void;
  handleFile: (file: File) => void;
  handleFiles: (files: File[]) => void;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  openFileInNewWindow: (fileId: string) => void;
  processFile: (file: File) => Promise<UploadedFile>;
  checkForDuplicateFileName: (fileName: string) => Promise<boolean>;
}

export const useUploadStore = create<UploadStoreState>((set, get) => ({
  // 세션 관리 초기 상태
  currentSession: null,
  availableSessions: [],
  selectedSessionId: null,

  setCurrentSession: (session) => set({currentSession: session}),
  setAvailableSessions: (sessions) => set({availableSessions: sessions}),
  setSelectedSessionId: (sessionId) => set({selectedSessionId: sessionId}),

  loadSessions: async () => {
    try {
      const {user} = useAuthStore.getState();
      const sessions = await getAllSessions(user?.id);
      const currentSession = getCurrentSession();
      const currentSessionId = await getCurrentSessionId();

      // 현재 세션이 목록에 없으면 추가
      let updatedSessions = [...sessions];
      if (
        currentSession &&
        !sessions.find((s) => s.sessionId === currentSession.sessionId)
      ) {
        updatedSessions.push(currentSession);
      }

      // localStorage에서 이전에 선택한 세션 불러오기
      let finalSelectedId: string | null = currentSessionId; // 기본값은 현재 세션
      if (typeof window !== "undefined") {
        const savedSelectedId = localStorage.getItem("selected_session_id");
        if (savedSelectedId === "all") {
          finalSelectedId = null; // 모든 세션
        } else if (savedSelectedId && savedSelectedId !== "null") {
          finalSelectedId = savedSelectedId; // 특정 세션
        }
      }

      set({
        availableSessions: updatedSessions,
        currentSession: currentSession,
        selectedSessionId: finalSelectedId,
      });
    } catch (error) {
      console.error("세션 로드 실패:", error);
    }
  },

  createSession: async (sessionName: string) => {
    try {
      const {user} = useAuthStore.getState();
      const newSession = await createNewSession(sessionName, user?.id);
      if (newSession) {
        // 세션 목록 다시 로드
        await get().loadSessions();
        return true;
      }
    } catch (error) {
      console.error("세션 생성 실패:", error);
    }
    return false;
  },

  switchToSession: (session: UploadSession) => {
    switchSession(session);
    set({
      currentSession: session,
      selectedSessionId: session.sessionId,
    });
    // 세션 변경 시 파일 목록 다시 로드
    get().loadFilesFromServer();
  },

  selectSession: (sessionId: string | null) => {
    const {availableSessions} = get();

    // 선택된 세션을 localStorage에 저장
    if (typeof window !== "undefined") {
      localStorage.setItem("selected_session_id", sessionId || "all");
    }

    if (sessionId === null) {
      // 모든 세션 선택
      set({
        selectedSessionId: null,
        currentSession: null,
      });
    } else {
      // 특정 세션 선택
      const session = availableSessions.find((s) => s.sessionId === sessionId);
      if (session) {
        get().switchToSession(session);
      }
    }
    // 세션 변경 시 파일 목록 다시 로드
    get().loadFilesFromServer();
  },

  deleteCurrentSession: async () => {
    const currentSession = get().currentSession;
    if (!currentSession) return false;

    try {
      const success = await deleteSession(currentSession.sessionId);
      if (success) {
        // 세션 목록 다시 로드
        await get().loadSessions();
        // 기본 세션으로 전환
        const sessions = get().availableSessions;
        if (sessions.length > 0) {
          get().switchToSession(sessions[0]);
        }
        return true;
      }
    } catch (error) {
      console.error("세션 삭제 실패:", error);
    }
    return false;
  },

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
  saveFilesToServer: async () => {
    const {uploadedFiles, selectedSessionId, loadFilesFromServer} = get();
    if (uploadedFiles.length === 0) {
      return false;
    }

    const sessionId = selectedSessionId || (await getCurrentSessionId());

    try {
      const response = await fetch("/api/upload/temp/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          files: uploadedFiles,
          sessionId: sessionId,
        }),
      });

      const result = await response.json();

      // 중복 파일명으로 인한 저장 실패 처리
      if (!result.success && result.error === "DUPLICATE_FILENAMES") {
        const duplicateList = result.duplicateFiles
          .map((name: string) => `• ${name}`)
          .join("\n");

        // alert(
        //   `❌ 다음 파일들이 중복된 파일명으로 인해 저장되지 않았습니다:\n\n${duplicateList}`
        // );
        return false;
      }

      // 서버 저장 성공 후 검증 상태를 포함한 최신 파일 목록 다시 불러오기
      if (result.success && loadFilesFromServer) {
        // 약간의 지연을 두어 DB 저장 완료 후 불러오기
        setTimeout(async () => {
          await loadFilesFromServer();
        }, 100);
      }

      return result.success;
    } catch (error) {
      console.error("서버 저장 실패:", error);
      return false;
    }
  },
  loadFilesFromServer: async () => {
    const {setUploadedFiles, confirmFile, selectedSessionId} = get();

    const sessionId =
      selectedSessionId === null
        ? "all"
        : selectedSessionId || (await getCurrentSessionId());

    try {
      const response = await fetch(
        `/api/upload/temp/list?sessionId=${sessionId}`
      );
      const result = await response.json();

      if (result.success && result.data) {
        setUploadedFiles(result.data);

        // 확인된 파일들 상태 복원
        result.data.forEach((file: any) => {
          if (file.isConfirmed) {
            confirmFile(file.id);
          }

          // sessionStorage에도 저장
          try {
            sessionStorage.setItem(
              `uploadedFile_${file.id}`,
              JSON.stringify(file)
            );
          } catch (error) {
            console.error("sessionStorage 저장 실패:", error);
          }
        });
      }
    } catch (error) {
      console.error("서버에서 파일 불러오기 실패:", error);
    }
  },
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
      const {searchProducts} = await import("@/utils/api");
      const result = await searchProducts(inputValue);
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

          // 헤더 행 자동 감지 (1~6행 사이에서 찾기, 공통 유틸리티 사용)
          const headerRowIndex = detectHeaderRowByColumnAliases(
            raw,
            INTERNAL_COLUMNS.map((col) => ({
              key: col.key,
              aliases: col.aliases,
            })),
            3, // 최소 매칭 개수
            6 // 최대 검사 행 수 (1~6행)
          );
          const rawHeader = raw[headerRowIndex] as any[];

          // 각 내부 컬럼에 대응하는 원본 인덱스 계산
          const indexMap: {[key: string]: number} = {};
          INTERNAL_COLUMNS.forEach((col) => {
            const idx = rawHeader.findIndex((h) =>
              col.aliases.some(
                (al) => normalizeHeader(String(h)) === normalizeHeader(al)
              )
            );
            indexMap[col.key] = idx; // 없으면 -1
          });

          // 내부 절대 순서로 헤더/데이터 재구성
          // 헤더 행 다음부터 데이터로 사용
          const canonicalHeader = INTERNAL_COLUMNS.map((c) => c.label);
          const canonicalRows = raw.slice(headerRowIndex + 1).map((row) =>
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

          let jsonData = [canonicalHeader, ...canonicalRows];

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

          // 빈 행 필터링: 헤더가 13개일 때 11칸 이상 공란인 row 삭제
          if (jsonData.length > 1) {
            const headerRow = jsonData[0] as any[];
            const totalColumns = headerRow.length;

            // 헤더를 제외한 데이터 행만 필터링
            const filteredRows = jsonData.slice(1).filter((row) => {
              // 빈 셀 개수 카운트
              let emptyCount = 0;
              for (let i = 0; i < totalColumns; i++) {
                const value = row[i];
                if (
                  value === undefined ||
                  value === null ||
                  String(value).trim() === ""
                ) {
                  emptyCount++;
                }
              }
              // 11개 이상 비어있으면 제외 (false 반환)
              return emptyCount < 11;
            });

            // 헤더와 필터링된 행들로 jsonData 재구성
            jsonData = [headerRow, ...filteredRows];
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
  checkForDuplicateFileName: async (fileName: string): Promise<boolean> => {
    try {
      const response = await fetch("/api/upload/temp/list");
      const result = await response.json();

      if (result.success && result.data) {
        return result.data.some((file: any) => file.fileName === fileName);
      }
      return false;
    } catch (error) {
      console.error("중복 파일명 체크 실패:", error);
      return false;
    }
  },

  handleFile: async (file) => {
    try {
      // 중복 파일명 체크
      const isDuplicate = await get().checkForDuplicateFileName(file.name);

      if (isDuplicate) {
        // alert(
        //   `❌ 동일한 파일명 "${file.name}"이 이미 존재합니다.\n업로드가 취소되었습니다.`
        // );
        return; // 중복 파일명인 경우 업로드 차단
      }

      const uploadedFile = await get().processFile(file);
      get().addUploadedFile(uploadedFile);
      get().setFileName(file.name);
      get().setTableData(uploadedFile.tableData);

      // 서버에 저장
      await get().saveFilesToServer();
    } catch (error: any) {
      console.error("파일 처리 실패:", error);
      // alert(`파일 처리 실패: ${error.message}`);
    }
  },
  handleFiles: async (files: File[]) => {
    const {addUploadedFile, checkForDuplicateFileName} = get();

    try {
      // 중복 파일명 체크
      const duplicateFiles: string[] = [];
      const validFiles: File[] = [];

      for (const file of files) {
        const isDuplicate = await checkForDuplicateFileName(file.name);
        if (isDuplicate) {
          duplicateFiles.push(file.name);
        } else {
          validFiles.push(file);
        }
      }

      if (duplicateFiles.length > 0) {
        const duplicateList = duplicateFiles
          .map((name) => `• ${name}`)
          .join("\n");

        if (validFiles.length === 0) {
          // 모든 파일이 중복인 경우
          alert(
            `❌ 다음 파일명들이 이미 존재합니다:\n\n${duplicateList}\n\n모든 파일의 업로드가 취소되었습니다.`
          );
          return;
        } else {
          // 일부 파일만 중복인 경우
          alert(
            `❌ 다음 파일명들이 이미 존재하여 제외되었습니다:\n\n${duplicateList}\n\n나머지 ${validFiles.length}개 파일만 업로드됩니다.`
          );
        }
      }

      if (validFiles.length > 0) {
        const promises = validFiles.map((file) => get().processFile(file));
        const uploadedFiles = await Promise.all(promises);
        uploadedFiles.forEach((file) => addUploadedFile(file));

        // 서버에 저장
        await get().saveFilesToServer();
      }
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
    // 필드 순서 정의
    const {PRODUCT_FIELD_ORDER} = require("@/constants/productFields");
    const fieldOrder = PRODUCT_FIELD_ORDER;

    const codes = get().codes;
    // codes에서 사용 가능한 필드 확인
    const availableFields = codes.length
      ? Object.keys(codes[0]).filter(
          (k) => k !== "id" && k !== "createdAt" && k !== "updatedAt"
        )
      : [];

    // fieldOrder에 정의된 필드들은 항상 포함 (pkg 등이 codes에 없어도 표시)
    // fieldOrder의 모든 필드를 항상 포함시킴
    const fields = fieldOrder;

    // 모든 필드의 초기값을 빈 문자열로 설정 (name만 targetName으로)
    const initialValues: {[key: string]: string} = {};
    fields.forEach((field: string) => {
      initialValues[field] = field === "name" ? targetName : "";
    });

    get().setDirectInputModal({
      open: true,
      fields,
      values: initialValues,
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
        const {transformProductData} = await import("@/utils/product");
        const {createProduct} = await import("@/utils/api");

        const requestBody = transformProductData(values);
        const result = await createProduct(requestBody);

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
      } catch (error) {
        console.error("상품 저장 실패:", error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : "상품 저장 중 오류가 발생했습니다.";
        alert(`상품 저장 중 오류가 발생했습니다: ${errorMessage}`);
        return;
      }
    }
    set({directInputModal: {...directInputModal, open: false}});
  },
  productModal: {
    open: false,
    productName: "",
    rowIdx: null as number | null,
  },
  setProductModal: (modalState) => set({productModal: modalState}),
  closeProductModal: () => {
    set((state: any) => ({
      productModal: {...state.productModal, open: false},
    }));
  },
  openProductModal: (targetName, rowIdx) => {
    get().setProductModal({
      open: true,
      productName: targetName,
      rowIdx,
    });
  },
}));
