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
import {fetchHeaderAliases} from "@/utils/headerAliases";
import {useLoadingStore} from "@/stores/loadingStore";

type ColumnDef = {
  key: string;
  label: string;
  aliases: string[];
};

// 내부 절대 컬럼 순서 정의 (DB에서 가져옴)
const getInternalColumns = async (): Promise<ColumnDef[]> => {
  try {
    const columnAliases = await fetchHeaderAliases();

    // DB에서 가져온 데이터와 기존의 주석 처리된 필드들을 합침
    const dbColumns = columnAliases.map((alias) => ({
      key: alias.key,
      label: alias.label,
      aliases: alias.aliases,
    }));

    // 주석 처리된 필드들 추가 (필요시 활성화 가능)
    const additionalColumns: ColumnDef[] = [
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

    return [...dbColumns, ...additionalColumns];
  } catch (error) {
    console.error("헤더 alias 조회 실패, 기본값 사용:", error);
    // DB 조회 실패시 기본 값들 반환
    return [
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
          "수취인전화번호1",
          "수취인 전화번호2",
          "수취인전화번호2",
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
          "주문자 전화번호1",
          "주문자전화번호2",
          "주문자 전화번호2",
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
    ];
  }
};

export interface UploadedFile {
  id: string;
  fileName: string;
  rowCount: number;
  tableData: any[][];
  headerIndex: {nameIdx?: number} | null;
  productCodeMap: {[name: string]: string};
  productIdMap?: {[name: string]: number | string};
  userId?: string;
  uploadTime?: string;
  createdAt?: string; // 업로드 일시 (임시 저장 시 생성)
  vendorName?: string; // 업체명 (파일에서 수집)
  originalHeader?: string[]; // 원본 파일의 헤더 순서 (정규화 전)
  originalData?: any[][]; // 원본 파일의 데이터 (정규화 전, 헤더 포함)
}

export interface UploadStoreState {
  // 파일 ID 카운터
  fileCounter: number;
  setFileCounter: (counter: number) => void;

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
    codes: Array<{name: string; code: string; [key: string]: any}>,
  ) => void;

  productCodeMap: {[name: string]: string};
  setProductCodeMap: (map: {[name: string]: string}) => void;
  productIdMap: {[name: string]: number | string};
  setProductIdMap: (map: {[name: string]: number | string}) => void;

  headerIndex: {nameIdx?: number} | null;
  setHeaderIndex: (v: {nameIdx?: number} | null) => void;

  recommendIdx: number | null;
  setRecommendIdx: (idx: number | null) => void;
  recommendList: Array<{name: string; code: string; [key: string]: any}>;
  setRecommendList: (
    list: Array<{name: string; code: string; [key: string]: any}>,
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
    inputValue: string,
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
  // 파일 ID 카운터 초기 상태
  fileCounter: 0,
  setFileCounter: (counter) => set({fileCounter: counter}),

  // 세션 관리 초기 상태
  currentSession: null,
  availableSessions: [],
  selectedSessionId: null,

  setCurrentSession: (session) => set({currentSession: session}),
  setAvailableSessions: (sessions) => set({availableSessions: sessions}),
  setSelectedSessionId: (sessionId) => set({selectedSessionId: sessionId}),

  loadSessions: async () => {
    // 세션 기능 제거로 인해 빈 함수
    set({
      availableSessions: [],
      currentSession: null,
      selectedSessionId: null, // "all"을 의미
    });
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
    // 세션 기능 제거로 인해 빈 함수
    set({
      currentSession: null,
      selectedSessionId: null, // "all"을 의미
    });
    get().loadFilesFromServer();
  },

  selectSession: (sessionId: string | null) => {
    // 세션 기능 제거로 인해 항상 "all"로 설정
    set({
      selectedSessionId: null, // "all"을 의미
      currentSession: null,
    });
    get().loadFilesFromServer();
  },

  deleteCurrentSession: async () => {
    // 세션 기능 제거로 인해 항상 false 반환
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
  addUploadedFile: (file) => {
    set((state) => {
      // 파일 ID 중복 체크
      const existingFileIndex = state.uploadedFiles.findIndex(
        (f) => f.id === file.id,
      );

      if (existingFileIndex !== -1) {
        // 이미 존재하는 파일이면 업데이트 (서버에서 불러온 최신 데이터로 교체)
        const updatedFiles = [...state.uploadedFiles];
        updatedFiles[existingFileIndex] = file;
        return {uploadedFiles: updatedFiles};
      }

      // 새 파일이면 추가
      // sessionStorage에 자동 저장 (upload/view 페이지를 열지 않아도 저장 가능하도록)
      try {
        sessionStorage.setItem(`uploadedFile_${file.id}`, JSON.stringify(file));
      } catch (error) {
        console.error("sessionStorage 저장 실패:", error);
      }

      return {
        uploadedFiles: [...state.uploadedFiles, file],
      };
    });
  },
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
      // company-id, user-id 헤더 포함
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      let userId: string | null = null;

      if (typeof window !== "undefined") {
        try {
          const stored = localStorage.getItem("auth-storage");
          if (stored) {
            const parsed = JSON.parse(stored);
            const user = parsed.state?.user;
            if (user?.companyId) {
              headers["company-id"] = user.companyId.toString();
            }
            if (user?.id) {
              userId = String(user.id);
              headers["user-id"] = String(user.id);
            }
          }
        } catch (e) {
          console.error("인증 정보 로드 실패:", e);
        }
      }

      // user_id가 없으면 로그인 필요
      if (!userId) {
        alert("로그인이 필요합니다. 다시 로그인해주세요.");
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
        return false;
      }

      const response = await fetch("/api/upload/temp/save", {
        method: "POST",
        headers,
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
    const {setUploadedFiles, confirmFile, selectedSessionId, uploadedFiles} =
      get();

    // 세션 기능 제거로 인해 항상 "all" 사용
    const sessionId =
      selectedSessionId === null ? "all" : selectedSessionId || "all";

    try {
      // company-id, user-id 헤더 포함
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      let userId: string | null = null;

      if (typeof window !== "undefined") {
        try {
          const stored = localStorage.getItem("auth-storage");
          if (stored) {
            const parsed = JSON.parse(stored);
            const user = parsed.state?.user;
            if (user?.companyId) {
              headers["company-id"] = user.companyId.toString();
            }
            if (user?.id) {
              userId = String(user.id);
              headers["user-id"] = String(user.id);
            }
          }
        } catch (e) {
          console.error("인증 정보 로드 실패:", e);
        }
      }

      // user_id가 없으면 로그인 필요
      if (!userId) {
        console.warn("⚠️ user_id가 없어서 파일 목록을 불러올 수 없습니다.");
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
        return;
      }

      const response = await fetch(
        `/api/upload/temp/list?sessionId=${sessionId}`,
        {headers},
      );

      // 응답 상태 확인
      if (!response.ok) {
        // 404 또는 다른 에러 상태
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errorResult = await response.json();
          console.error("서버에서 파일 불러오기 실패:", errorResult);
        } else {
          // HTML 에러 페이지인 경우
          const text = await response.text();
          console.error(
            `서버에서 파일 불러오기 실패: ${response.status} ${response.statusText}`,
            text.substring(0, 200),
          );
        }
        return;
      }

      // JSON 응답 파싱
      const result = await response.json();

      if (result.success && result.data) {
        // 기존 uploadedFiles에서 vendorName을 보존하기 위한 맵 생성
        const existingFilesMap = new Map(uploadedFiles.map((f) => [f.id, f]));

        // uploadTime이 없는 파일들에 대해 현재 시간 설정
        const updatedFiles = result.data.map((file: any) => {
          const existingFile = existingFilesMap.get(file.id);
          // 서버에서 불러온 vendorName을 우선 사용 (서버가 최신 데이터)
          const serverVendorName = file.vendorName || file.vendor_name;
          const trimmedVendorName =
            serverVendorName !== null && serverVendorName !== undefined
              ? String(serverVendorName).trim()
              : null;

          console.log(
            `📥 서버에서 파일 로드: fileId=${file.id}, fileName="${file.fileName}"`,
            {
              serverVendorName,
              trimmedVendorName,
              existingVendorName: existingFile?.vendorName,
              finalVendorName:
                trimmedVendorName || existingFile?.vendorName || undefined,
            },
          );

          return {
            ...file,
            uploadTime:
              file.uploadTime || file.createdAt || new Date().toISOString(),
            createdAt:
              file.createdAt || file.uploadTime || new Date().toISOString(),
            // 서버에서 불러온 vendorName이 있으면 무조건 사용 (서버가 최신 데이터)
            // 서버에 없으면 기존 vendorName 유지 (하위 호환성)
            vendorName:
              trimmedVendorName || existingFile?.vendorName || undefined,
            // 서버에서 불러온 originalHeader가 있으면 우선 사용, 없으면 기존 originalHeader 유지
            originalHeader:
              file.originalHeader ||
              file.original_header ||
              existingFile?.originalHeader ||
              undefined,
          };
        });

        // 서버에 없는 파일은 sessionStorage에서 삭제 (이미 저장된 파일 정리)
        const serverFileIds = new Set(updatedFiles.map((f: any) => f.id));
        const existingFileIds = Array.from(existingFilesMap.keys());
        existingFileIds.forEach((existingId) => {
          if (!serverFileIds.has(existingId)) {
            console.log(
              `🗑️ 서버에 없는 파일 sessionStorage에서 삭제: ${existingId}`,
            );
            sessionStorage.removeItem(`uploadedFile_${existingId}`);
          }
        });

        // sessionStorage의 모든 uploadedFile 키를 확인하고 서버에 없는 것들 삭제
        try {
          const keysToRemove: string[] = [];
          for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith("uploadedFile_")) {
              const fileId = key.replace("uploadedFile_", "");
              if (!serverFileIds.has(fileId)) {
                keysToRemove.push(key);
              }
            }
          }
          keysToRemove.forEach((key) => {
            console.log(`🗑️ 오래된 sessionStorage 항목 삭제: ${key}`);
            sessionStorage.removeItem(key);
          });
        } catch (error) {
          console.error("sessionStorage 정리 실패:", error);
        }

        setUploadedFiles(updatedFiles);

        // 확인된 파일들 상태 복원
        updatedFiles.forEach((file: any) => {
          if (file.isConfirmed) {
            confirmFile(file.id);
          }

          // sessionStorage에도 저장 (vendorName 포함 확인)
          try {
            console.log(
              `💾 sessionStorage 저장: fileId=${file.id}, vendorName="${file.vendorName}"`,
            );
            sessionStorage.setItem(
              `uploadedFile_${file.id}`,
              JSON.stringify(file),
            );
          } catch (error) {
            console.error("sessionStorage 저장 실패:", error);
          }
        });

        return updatedFiles; // Promise 반환을 위해 파일 목록 반환
      }
    } catch (error) {
      console.error("서버에서 파일 불러오기 실패:", error);
      throw error; // 에러 발생 시 throw하여 Promise rejection
    }
  },
  codes: [],
  setCodes: (codes) => set({codes}),
  productCodeMap: {},
  setProductCodeMap: (map) => set({productCodeMap: map}),
  productIdMap: {},
  setProductIdMap: (map) => set({productIdMap: map}),
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

    // 택배사가 있는 상품을 우선 정렬
    const sortedSuggestions = [...suggestions].sort((a: any, b: any) => {
      const aHasPostType = a.postType && String(a.postType).trim() !== "";
      const bHasPostType = b.postType && String(b.postType).trim() !== "";

      // 택배사가 있는 것을 우선
      if (aHasPostType && !bHasPostType) return -1;
      if (!aHasPostType && bHasPostType) return 1;
      return 0;
    });

    get().setRecommendIdx(rowIdx);
    get().setRecommendList(sortedSuggestions as {name: string; code: string}[]);
  },
  handleSelectSuggest: (name, code, id) => {
    const {
      productCodeMap,
      setProductCodeMap,
      productIdMap,
      setProductIdMap,
      setRecommendIdx,
    } = get();
    setProductCodeMap({...productCodeMap, [name]: code});
    // productId가 있으면 productIdMap에도 저장
    if (id !== undefined && id !== null) {
      setProductIdMap({...productIdMap, [name]: id});
    }
    setRecommendIdx(null);
  },
  processFile: async (file: File): Promise<UploadedFile> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          // 파일 크기 검증 (50MB 제한)
          const maxFileSize = 50 * 1024 * 1024; // 50MB
          if (file.size > maxFileSize) {
            throw new Error(
              `파일 크기가 너무 큽니다. 50MB 이하의 파일만 업로드 가능합니다. (현재: ${(
                file.size /
                1024 /
                1024
              ).toFixed(1)}MB)`,
            );
          }

          // 파일 확장자 확인
          const fileName = file.name.toLowerCase();
          const fileExtension = fileName.substring(fileName.lastIndexOf("."));
          const allowedExtensions = [".xlsx", ".xls", ".csv"];

          if (!allowedExtensions.includes(fileExtension)) {
            throw new Error(
              "지원되지 않는 파일 형식입니다. .xlsx, .xls 또는 .csv 파일만 업로드 가능합니다.",
            );
          }

          const isCsv = fileExtension === ".csv";
          const isXls = fileExtension === ".xls";
          const isXlsx = fileExtension === ".xlsx";
          const data = new Uint8Array(e.target?.result as ArrayBuffer);

          // 파일 형식 기본 검증
          if (data.length < 4 && !isCsv) {
            throw new Error(
              "파일이 너무 작습니다. 유효한 파일인지 확인해주세요.",
            );
          }

          // CSV 파일이 아닌 경우에만 시그니처 검증
          if (!isCsv) {
            // Excel 파일 시그니처 검증 (ZIP 기반 Excel 파일)
            const signature = Array.from(data.slice(0, 4));
            const xlsxSignature = [0x50, 0x4b, 0x03, 0x04]; // ZIP 파일 시그니처
            const xlsSignature = [
              0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
            ]; // OLE2 시그니처

            const hasXlsxSignature = signature.every(
              (byte, i) => byte === xlsxSignature[i],
            );
            const hasXlsSignature = signature
              .slice(0, 8)
              .every((byte, i) => byte === xlsSignature[i]);

            if (!hasXlsxSignature && !hasXlsSignature) {
              throw new Error(
                "지원되지 않는 파일 형식입니다. .xlsx, .xls 또는 .csv 파일만 업로드 가능합니다.",
              );
            }
          }

          // 파일 형식 확인 및 읽기 옵션 설정
          let workbook: XLSX.WorkBook | null = null;

          // CSV 파일인 경우 XLSX 라이브러리로 직접 읽기
          if (isCsv) {
            try {
              // CSV 파일을 텍스트로 변환 후 읽기
              const text = new TextDecoder("utf-8").decode(data);
              workbook = XLSX.read(text, {
                type: "string",
                raw: false,
                codepage: 65001, // UTF-8
              });
            } catch (csvError: any) {
              throw new Error(
                `CSV 파일을 읽을 수 없습니다. 파일 인코딩이 UTF-8인지 확인해주세요. (${
                  csvError.message || "알 수 없는 오류"
                })`,
              );
            }
          } else if (isXls) {
            // .xls 파일인 경우 XLSX 라이브러리로 직접 읽기 (ExcelJS는 .xls를 지원하지 않음)
            try {
              workbook = XLSX.read(data, {
                type: "array",
                cellStyles: false,
                cellDates: false,
                cellNF: false,
                cellText: false,
                raw: false,
                dense: false,
              });
            } catch (xlsError: any) {
              throw new Error(
                `.xls 파일을 읽을 수 없습니다. 파일이 손상되었거나 비표준 형식일 수 있습니다. (${
                  xlsError.message || "알 수 없는 오류"
                })`,
              );
            }
          } else {
            // .xlsx 파일인 경우 ExcelJS로 먼저 시도 (XLSX의 압축 문제 회피)
            try {
              const ExcelJS = (await import("exceljs")).default;
              const buffer = data.buffer.slice(
                data.byteOffset,
                data.byteOffset + data.byteLength,
              );
              const excelWorkbook = new ExcelJS.Workbook();
              await excelWorkbook.xlsx.load(buffer);

              // ExcelJS 결과를 XLSX 형식으로 변환
              const sheetNames: string[] = excelWorkbook.worksheets.map(
                (ws) => ws.name,
              );
              const sheets: {[key: string]: XLSX.WorkSheet} = {};

              excelWorkbook.worksheets.forEach((worksheet, index) => {
                const sheetName = sheetNames[index];
                // 서식을 무시하고 실제 값만 추출
                const sheetData: any[][] = [];
                const maxRow = worksheet.rowCount || 0;
                const maxCol = worksheet.columnCount || 0;

                // 각 행을 순회하면서 실제 값만 추출
                worksheet.eachRow((row, rowNumber) => {
                  const rowData: any[] = [];
                  // 열을 순회하면서 셀 값 추출 (빈 셀도 포함하여 행 구조 유지)
                  row.eachCell({includeEmpty: true}, (cell, colNumber) => {
                    // 셀의 실제 값만 추출 (서식 무시)
                    let cellValue: string = "";

                    if (cell.value !== null && cell.value !== undefined) {
                      // ExcelJS의 셀 값 타입에 따라 처리
                      if (cell.value instanceof Date) {
                        cellValue = cell.value.toISOString().split("T")[0]; // 날짜를 YYYY-MM-DD 형식으로
                      } else if (typeof cell.value === "object") {
                        // RichText 객체인 경우
                        if (
                          "richText" in cell.value &&
                          Array.isArray((cell.value as any).richText)
                        ) {
                          cellValue = (cell.value as any).richText
                            .map((rt: any) => rt.text || "")
                            .join("");
                        }
                        // text 속성이 있는 경우
                        else if ("text" in cell.value) {
                          cellValue = String((cell.value as any).text);
                        }
                        // result 속성이 있는 경우 (수식 결과)
                        else if ("result" in cell.value) {
                          const result = (cell.value as any).result;
                          if (result instanceof Date) {
                            cellValue = result.toISOString().split("T")[0];
                          } else {
                            cellValue = String(result);
                          }
                        }
                        // 그 외 객체는 빈 문자열로 처리
                        else {
                          cellValue = "";
                        }
                      } else {
                        // 일반 값 (문자열, 숫자 등)
                        cellValue = String(cell.value);
                      }

                      // 값이 있으면 trim
                      if (cellValue) {
                        cellValue = cellValue.trim();
                      }
                    }

                    // 행 구조를 유지하기 위해 빈 문자열로 채움
                    while (rowData.length < colNumber - 1) {
                      rowData.push("");
                    }
                    rowData.push(cellValue);
                  });

                  // 행이 비어있지 않으면 추가
                  if (rowData.length > 0) {
                    sheetData.push(rowData);
                  }
                });

                sheets[sheetName] = XLSX.utils.aoa_to_sheet(sheetData);
              });

              workbook = {
                SheetNames: sheetNames,
                Sheets: sheets,
              };
            } catch (excelJSError: any) {
              console.warn(
                "ExcelJS 읽기 실패, XLSX로 재시도:",
                excelJSError.message,
              );

              // ExcelJS 실패 시 XLSX로 시도
              try {
                workbook = XLSX.read(data, {
                  type: "array",
                  cellStyles: false, // 셀 스타일 무시
                  cellDates: false, // 날짜 셀 무시
                  cellNF: false, // 숫자 포맷 무시
                  cellText: false, // 텍스트 무시
                  raw: true, // 원시 값 사용 (서식 무시)
                  dense: false,
                });
              } catch (readError: any) {
                // 압축 관련 에러 특별 처리
                if (
                  readError.message &&
                  (readError.message.includes("Bad uncompressed size") ||
                    readError.message.includes("uncompressed size") ||
                    readError.message.includes("ZIP") ||
                    readError.message.includes("corrupt"))
                ) {
                  throw new Error(
                    "Excel 파일이 손상되었거나 비표준 형식입니다. Excel에서 파일을 열어 '다른 이름으로 저장'(Excel 통합 문서 .xlsx) 후 다시 시도해주세요.",
                  );
                }

                throw new Error(
                  `파일을 읽을 수 없습니다. 다른 Excel 파일로 시도해주세요. (${
                    readError.message || "알 수 없는 오류"
                  })`,
                );
              }
            }
          }

          if (
            !workbook ||
            !workbook.SheetNames ||
            workbook.SheetNames.length === 0
          ) {
            throw new Error("파일에 워크시트가 없습니다.");
          }

          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];

          if (!worksheet) {
            throw new Error("워크시트를 찾을 수 없습니다.");
          }

          // Google Sheets 파일을 위한 옵션 추가
          // 서식을 무시하고 실제 값만 추출
          const rawData = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: "", // 빈 셀을 빈 문자열로 처리
            raw: true, // 원시 값 사용 (서식 무시)
            dateNF: "yyyy-mm-dd", // 날짜 형식
            blankrows: false, // 빈 행 제거
          }) as any[][];

          // 서식만 있고 값이 없는 셀을 빈 문자열로 처리
          const raw = rawData.map((row: any[]) =>
            row.map((cell: any) => {
              // null 또는 undefined 처리
              if (cell === null || cell === undefined) {
                return "";
              }

              // 객체인 경우
              if (typeof cell === "object") {
                // 빈 객체면 빈 문자열로 처리
                if (Object.keys(cell).length === 0) {
                  return "";
                }

                // XLSX 셀 객체 구조: { t: 타입, v: 값, w: 포맷된 텍스트, ... }
                // w 속성(포맷된 텍스트)이 있으면 우선 사용
                if (cell.w !== undefined && cell.w !== null) {
                  return String(cell.w).trim();
                }

                // v 속성(값)이 있으면 사용
                if (cell.v !== undefined && cell.v !== null) {
                  // 날짜 객체인 경우
                  if (cell.v instanceof Date) {
                    return cell.v.toISOString().split("T")[0];
                  }
                  // 숫자인 경우
                  if (typeof cell.v === "number") {
                    return String(cell.v);
                  }
                  // 문자열인 경우
                  if (typeof cell.v === "string") {
                    return cell.v.trim();
                  }
                  // 객체인 경우 (중첩된 객체) - 빈 문자열로 처리
                  if (typeof cell.v === "object") {
                    return "";
                  }
                  return String(cell.v).trim();
                }

                // t, v, w 속성이 모두 없으면 빈 문자열로 처리 (서식만 있는 셀)
                if (!cell.t && !cell.v && !cell.w) {
                  return "";
                }

                // 그 외 객체는 빈 문자열로 처리
                return "";
              }

              // 일반 값 (문자열, 숫자 등)은 그대로 반환
              return String(cell).trim();
            }),
          );

          if (!raw.length) {
            throw new Error("파일이 비어있습니다.");
          }

          // DB에서 헤더 alias들을 가져옴
          const internalColumns = await getInternalColumns();

          // 헤더 행 자동 감지 (1~6행 사이에서 찾기, 공통 유틸리티 사용)
          const headerRowIndex = detectHeaderRowByColumnAliases(
            raw,
            internalColumns.map((col) => ({
              key: col.key,
              aliases: col.aliases,
            })),
            3, // 최소 매칭 개수
            6, // 최대 검사 행 수 (1~6행)
          );
          const rawHeader = raw[headerRowIndex] as any[];

          // 각 내부 컬럼에 대응하는 원본 인덱스 계산
          const indexMap: {[key: string]: number} = {};
          const user = useAuthStore.getState().user;
          const isOnlineUser = user?.grade === "온라인";

          internalColumns.forEach((col) => {
            // grade === "온라인"인 경우 "주문번호" 컬럼은 "주문번호(사방넷)"만 찾기
            if (col.key === "orderCode" && isOnlineUser) {
              const sabangnetIdx = rawHeader.findIndex((h) => {
                const normalizedH = normalizeHeader(String(h));
                return normalizedH === normalizeHeader("주문번호(사방넷)");
              });
              indexMap[col.key] = sabangnetIdx; // 없으면 -1
            } else if (
              (col.key === "receiverPhone" || col.key === "ordererPhone") &&
              isOnlineUser
            ) {
              // 온라인 유저: 전화번호1을 먼저 찾고, 없으면 전화번호2 찾기
              const phone1Key =
                col.key === "receiverPhone"
                  ? "수취인전화번호1"
                  : "주문자전화번호1";
              const phone2Key =
                col.key === "receiverPhone"
                  ? "수취인전화번호2"
                  : "주문자전화번호2";

              // 1순위: 전화번호1 헤더 찾기
              let idx = rawHeader.findIndex((h) => {
                const normalizedH = normalizeHeader(String(h));
                return (
                  normalizedH === normalizeHeader(phone1Key) ||
                  normalizedH ===
                    normalizeHeader(phone1Key.replace("전화번호", " 전화번호"))
                );
              });

              // 2순위: 전화번호1이 없으면 전화번호2 헤더 찾기
              if (idx === -1) {
                idx = rawHeader.findIndex((h) => {
                  const normalizedH = normalizeHeader(String(h));
                  return (
                    normalizedH === normalizeHeader(phone2Key) ||
                    normalizedH ===
                      normalizeHeader(
                        phone2Key.replace("전화번호", " 전화번호"),
                      )
                  );
                });
              }

              // 3순위: 전화번호1/2가 없으면 기존 aliases로 찾기
              if (idx === -1) {
                idx = rawHeader.findIndex((h) =>
                  col.aliases.some(
                    (al) => normalizeHeader(String(h)) === normalizeHeader(al),
                  ),
                );
              }

              indexMap[col.key] = idx; // 없으면 -1
            } else {
              // 그 외의 경우 기존 로직 사용
              const idx = rawHeader.findIndex((h) =>
                col.aliases.some(
                  (al) => normalizeHeader(String(h)) === normalizeHeader(al),
                ),
              );
              indexMap[col.key] = idx; // 없으면 -1
            }
          });

          // 디버깅: 온라인 사용자의 경우 주문번호 인덱스 확인
          if (isOnlineUser && indexMap["orderCode"] !== -1) {
            console.log(
              `✅ [온라인 사용자] "주문번호(사방넷)" 헤더 발견: 인덱스 ${indexMap["orderCode"]}, 헤더명: "${rawHeader[indexMap["orderCode"]]}"`,
            );
          } else if (isOnlineUser) {
            console.warn(
              `⚠️ [온라인 사용자] "주문번호(사방넷)" 헤더를 찾을 수 없음`,
            );
          }

          // 내부 절대 순서로 헤더/데이터 재구성
          // 헤더 행 다음부터 데이터로 사용
          const canonicalHeader = internalColumns.map((c) => c.label);
          const canonicalRows: string[][] = raw
            .slice(headerRowIndex + 1)
            .map((row) =>
              internalColumns.map((c) => {
                const idx = indexMap[c.key];
                let value: string =
                  idx >= 0 ? String(row[idx] ?? "").trim() : "";

                // 온라인 유저: 전화번호1이 비어있으면 전화번호2 사용
                if (
                  isOnlineUser &&
                  (c.key === "receiverPhone" || c.key === "ordererPhone") &&
                  !value
                ) {
                  const phone2Key =
                    c.key === "receiverPhone"
                      ? "수취인전화번호2"
                      : "주문자전화번호2";
                  const phone2Idx = rawHeader.findIndex((h) => {
                    const normalizedH = normalizeHeader(String(h));
                    return (
                      normalizedH === normalizeHeader(phone2Key) ||
                      normalizedH ===
                        normalizeHeader(
                          phone2Key.replace("전화번호", " 전화번호"),
                        )
                    );
                  });
                  if (phone2Idx >= 0) {
                    value = String(row[phone2Idx] ?? "").trim();
                  }
                }

                // 업체명 컬럼은 엑셀 파일에서 읽지 않도록 빈 값으로 처리
                // (드롭다운에서 선택한 값만 사용)
                if (c.key === "vendor") {
                  value = "";
                }

                // 수량 필드 처리
                if (c.key === "qty") {
                  // 공란이면 1로 자동 입력
                  if (
                    value === undefined ||
                    value === null ||
                    String(value).trim() === ""
                  ) {
                    value = "1";
                  } else {
                    // 값이 있으면 앞의 0 제거 (예: "01" -> "1")
                    const strValue = String(value).trim();
                    // 숫자로 변환 가능하고 앞에 0이 있는 경우 제거
                    if (strValue && !isNaN(Number(strValue))) {
                      value = String(Number(strValue));
                    }
                  }
                }

                // 박스, 부피 기본값 자동 세팅
                if (
                  value === undefined ||
                  value === null ||
                  String(value).trim() === ""
                ) {
                  if (c.key === "box") {
                    value = "2";
                  } else if (c.key === "volume") {
                    value = "60";
                  }
                }

                return value;
              }),
            );

          // 원본 헤더에서 "상품코드(사방넷)" 헤더 인덱스 찾기 (수량 변환 로직 전에 확인)
          let sabangnetCodeIdxForQtyCheck = -1;
          if (rawHeader && Array.isArray(rawHeader)) {
            try {
              sabangnetCodeIdxForQtyCheck = rawHeader.findIndex(
                (h: any) =>
                  h &&
                  typeof h === "string" &&
                  normalizeHeader(String(h)) ===
                    normalizeHeader("상품코드(사방넷)"),
              );
            } catch (error) {
              console.warn("상품코드(사방넷) 헤더 찾기 실패:", error);
            }
          }

          // 수량이 2 이상인 경우 상품명에 "|n세트" 추가
          // 단, 상품코드(사방넷) 헤더가 있는 파일은 상품명 변환하지 않음 (자동 매핑을 위해)
          const productNameIdx = internalColumns.findIndex(
            (c) => c.key === "productName",
          );
          const qtyIdx = internalColumns.findIndex((c) => c.key === "qty");

          if (
            productNameIdx !== -1 &&
            qtyIdx !== -1 &&
            sabangnetCodeIdxForQtyCheck === -1
          ) {
            // 상품코드(사방넷) 헤더가 없는 경우에만 수량 변환 실행
            canonicalRows.forEach((row) => {
              const qtyValue = row[qtyIdx];
              const productNameValue = row[productNameIdx];

              // 수량이 2 이상이고 상품명이 있는 경우
              if (
                qtyValue !== undefined &&
                qtyValue !== null &&
                productNameValue !== undefined &&
                productNameValue !== null
              ) {
                const qtyNum = Number(String(qtyValue).trim());
                const productName = String(productNameValue).trim();

                // 수량이 2 이상이고 숫자로 변환 가능한 경우
                if (!isNaN(qtyNum) && qtyNum >= 2 && productName) {
                  // 이미 "|n세트"가 붙어있지 않은 경우에만 추가
                  if (
                    !productName.includes("|") ||
                    !productName.includes("세트")
                  ) {
                    row[productNameIdx] = `${productName}|${qtyNum}세트`;
                  }
                  // 상품명에 세트 정보를 추가한 후 수량을 1로 변경
                  row[qtyIdx] = "1";
                }
              }
            });
          } else if (sabangnetCodeIdxForQtyCheck !== -1) {
            console.log(
              "✅ 상품코드(사방넷) 헤더가 있어 수량 변환 기능을 건너뜁니다.",
            );
          }

          // 원본 헤더 보존 (정규화 전 원본 엑셀 파일의 헤더)
          // rawHeader는 엑셀 파일에서 직접 추출한 원본 헤더
          // 빈 문자열도 포함하여 원본 순서 그대로 보존
          const originalHeader = rawHeader.map((h: any) => {
            if (h === null || h === undefined) return "";
            return String(h).trim();
          });

          // 디버깅: 원본 헤더 추출 확인
          console.log(`📋 원본 헤더 추출:`, {
            fileName: file.name,
            rawHeaderLength: rawHeader.length,
            originalHeaderLength: originalHeader.length,
            originalHeader: originalHeader,
          });

          // 원본 헤더에서 "상품코드(사방넷)" 헤더 인덱스 찾기
          let sabangnetCodeIdx = -1;
          if (rawHeader && Array.isArray(rawHeader)) {
            try {
              sabangnetCodeIdx = rawHeader.findIndex(
                (h: any) =>
                  h &&
                  typeof h === "string" &&
                  normalizeHeader(String(h)) ===
                    normalizeHeader("상품코드(사방넷)"),
              );
            } catch (error) {
              console.warn("상품코드(사방넷) 헤더 찾기 실패:", error);
            }
          }

          // 원본 헤더에서 "쇼핑몰명" 헤더 인덱스 찾기
          let shopNameIdx = -1;
          if (rawHeader && Array.isArray(rawHeader)) {
            try {
              shopNameIdx = rawHeader.findIndex(
                (h: any) =>
                  h &&
                  typeof h === "string" &&
                  (normalizeHeader(String(h)) === normalizeHeader("쇼핑몰명") ||
                    normalizeHeader(String(h)) ===
                      normalizeHeader("쇼핑몰명(1)")),
              );
            } catch (error) {
              console.warn("쇼핑몰명 헤더 찾기 실패:", error);
            }
          }

          // 원본 헤더에서 "공급단가" 헤더 인덱스 찾기
          let supplyPriceIdx = -1;
          if (rawHeader && Array.isArray(rawHeader)) {
            try {
              supplyPriceIdx = rawHeader.findIndex((h: any) => {
                if (!h || typeof h !== "string") return false;
                const headerStr = String(h).trim();
                return (
                  headerStr === "공급단가" ||
                  headerStr.includes("공급단가") ||
                  normalizeHeader(headerStr) === normalizeHeader("공급단가")
                );
              });
              if (supplyPriceIdx !== -1) {
                console.log(
                  `✅ [공급단가] 원본 헤더에서 발견: 인덱스 ${supplyPriceIdx}, 헤더명: "${rawHeader[supplyPriceIdx]}"`,
                );
              }
            } catch (error) {
              console.warn("공급단가 헤더 찾기 실패:", error);
            }
          }

          // 데이터는 정규화된 헤더로 저장 (기존 방식 유지)
          let jsonData = [canonicalHeader, ...canonicalRows];

          // "공급단가" 헤더가 있으면 정규화된 헤더와 데이터에 추가
          if (supplyPriceIdx !== -1) {
            // 정규화된 헤더에 "공급단가" 추가
            const headerRow = jsonData[0] as any[];
            if (!headerRow.includes("공급단가")) {
              headerRow.push("공급단가");
              console.log(`✅ [공급단가] 정규화된 헤더에 추가됨`);
            }

            // 각 데이터 행에 "공급단가" 값 추가
            for (let i = 1; i < jsonData.length; i++) {
              const originalRowIdx = headerRowIndex + i; // 원본 데이터의 행 인덱스
              if (originalRowIdx < raw.length) {
                const originalRow = raw[originalRowIdx];
                if (
                  originalRow &&
                  originalRow[supplyPriceIdx] !== undefined &&
                  originalRow[supplyPriceIdx] !== null
                ) {
                  const supplyPriceValue = String(
                    originalRow[supplyPriceIdx],
                  ).trim();
                  jsonData[i].push(supplyPriceValue);
                  if (i <= 3) {
                    console.log(
                      `✅ [공급단가] 행 ${i}에 값 추가: "${supplyPriceValue}"`,
                    );
                  }
                } else {
                  jsonData[i].push(""); // 값이 없으면 빈 문자열
                }
              } else {
                jsonData[i].push(""); // 원본 행이 없으면 빈 문자열
              }
            }
            console.log(`✅ [공급단가] 모든 데이터 행에 추가 완료`);
          }

          // 쇼핑몰명이 있으면 업체명 컬럼에 자동 입력
          if (shopNameIdx !== -1 && jsonData.length > 1) {
            const headerRow = jsonData[0] as any[];
            const vendorIdx = headerRow.findIndex(
              (h: any) => h && typeof h === "string" && h === "업체명",
            );

            if (vendorIdx !== -1) {
              // 원본 데이터에서 쇼핑몰명 값 가져오기
              for (let i = 1; i < jsonData.length; i++) {
                const originalRowIdx = headerRowIndex + i; // 원본 데이터의 행 인덱스
                if (originalRowIdx < raw.length) {
                  const originalRow = raw[originalRowIdx];
                  if (originalRow && originalRow[shopNameIdx]) {
                    const shopName = String(originalRow[shopNameIdx]).trim();
                    if (shopName) {
                      jsonData[i][vendorIdx] = shopName;
                    }
                  }
                }
              }
              console.log(`✅ 쇼핑몰명을 업체명 컬럼에 자동 입력 완료`);
            }
          }

          // 온라인 유저: "매핑코드" 컬럼 추가만 수행 (값 설정은 빈 행 필터링 후에 수행)
          // 빈 행 필터링 전에 설정하면 인덱스가 어긋날 수 있으므로, 필터링 후 _originalRowIndex로 정확히 매칭
          if (isOnlineUser && sabangnetCodeIdx !== -1) {
            const headerRowArr = jsonData[0] as any[];
            let mappingCodeColIdx = headerRowArr.findIndex(
              (h: any) => h && typeof h === "string" && h === "매핑코드",
            );

            // "매핑코드" 컬럼이 canonical header에 없으면 직접 추가
            // (DB header_aliases에 "매핑코드"가 등록되지 않은 경우)
            if (mappingCodeColIdx === -1) {
              headerRowArr.push("매핑코드");
              mappingCodeColIdx = headerRowArr.length - 1;
              // 기존 데이터 행에도 빈 값 추가 (나중에 빈 행 필터링 후 재설정)
              for (let i = 1; i < jsonData.length; i++) {
                jsonData[i].push("");
              }
              console.log(
                `✅ [온라인 유저] "매핑코드" 컬럼 추가 (값 설정은 빈 행 필터링 후 수행)`,
              );
            }
          }

          // 수취인명/이름(내부 컬럼 기준) 동명이인 번호 붙이기
          if (jsonData.length > 1) {
            const headerRow = jsonData[0] as any[];
            const receiverIdx = headerRow.findIndex(
              (h: any) =>
                h &&
                typeof h === "string" &&
                (h.includes("수취인명") || h === "이름"),
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
                (h === "수취인명" || h.includes("수취인명")),
            );
            const receiverPhoneIdx = headerRow.findIndex(
              (h: any) =>
                h &&
                typeof h === "string" &&
                (h === "수취인 전화번호" ||
                  h.includes("수취인 전화번호") ||
                  h.includes("수취인 연락처")),
            );
            const ordererNameIdx = headerRow.findIndex(
              (h: any) =>
                h &&
                typeof h === "string" &&
                (h === "주문자명" || h.includes("주문자명")),
            );
            const ordererPhoneIdx = headerRow.findIndex(
              (h: any) =>
                h &&
                typeof h === "string" &&
                (h === "주문자 전화번호" ||
                  h.includes("주문자 전화번호") ||
                  h.includes("주문자 연락처")),
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

          // 원본 순서 인덱스 추가 (빈 행 필터링 전에 부여하여 원본 순서 보존)
          // 헤더에 _originalRowIndex 컬럼 추가
          if (jsonData.length > 0) {
            const headerRow = jsonData[0] as any[];
            headerRow.push("_originalRowIndex");

            // 각 데이터 행에 원본 인덱스 추가 (1부터 시작, 문자열로 저장)
            for (let i = 1; i < jsonData.length; i++) {
              (jsonData[i] as any[]).push(String(i)); // 원본 순서 인덱스 (1-based, string)
            }
          }

          // 빈 행 필터링: 헤더가 13개일 때 11칸 이상 공란인 row 삭제
          if (jsonData.length > 1) {
            const headerRow = jsonData[0] as any[];
            // _originalRowIndex 컬럼을 제외한 컬럼 수로 빈 셀 개수 계산
            const totalColumns = headerRow.length - 1; // _originalRowIndex 제외

            // 헤더를 제외한 데이터 행만 필터링
            const filteredRows = jsonData.slice(1).filter((row) => {
              // 빈 셀 개수 카운트 (_originalRowIndex 컬럼 제외)
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

          // 온라인 유저: 빈 행 필터링 후 _originalRowIndex를 사용하여 매핑코드 정확히 설정
          // 빈 행 필터링 후에는 jsonData의 인덱스와 raw의 인덱스가 맞지 않으므로
          // _originalRowIndex를 사용해서 원본 raw 데이터의 행과 정확히 매칭
          // 오로지 원본 파일의 상품코드(사방넷) 값만 사용, 상품명 등 다른 것은 무시
          if (isOnlineUser && sabangnetCodeIdx !== -1) {
            const headerRowArr = jsonData[0] as any[];
            let mappingCodeColIdx = headerRowArr.findIndex(
              (h: any) => h && typeof h === "string" && h === "매핑코드",
            );
            const origRowIdxColIdx = headerRowArr.findIndex(
              (h: any) =>
                h && typeof h === "string" && h === "_originalRowIndex",
            );

            // 매핑코드 컬럼이 없으면 추가
            if (mappingCodeColIdx === -1) {
              headerRowArr.push("매핑코드");
              mappingCodeColIdx = headerRowArr.length - 1;
              // 각 데이터 행에도 빈 값 추가
              for (let i = 1; i < jsonData.length; i++) {
                jsonData[i].push("");
              }
              console.log(
                `✅ [온라인 유저] "매핑코드" 컬럼 추가 (빈 행 필터링 후)`,
              );
            }

            if (mappingCodeColIdx !== -1 && origRowIdxColIdx !== -1) {
              let setCount = 0;
              let errorCount = 0;
              for (let i = 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                // _originalRowIndex에서 원본 행 인덱스 가져오기 (1-based)
                const origRowIdx = parseInt(
                  String(row[origRowIdxColIdx] || "0"),
                );

                if (origRowIdx > 0) {
                  // raw 데이터에서 원본 행 찾기 (headerRowIndex + origRowIdx)
                  const rawRowIdx = headerRowIndex + origRowIdx;
                  if (rawRowIdx < raw.length) {
                    const originalRow = raw[rawRowIdx];
                    if (
                      originalRow &&
                      originalRow[sabangnetCodeIdx] !== undefined &&
                      originalRow[sabangnetCodeIdx] !== null
                    ) {
                      const sabangnetCode = String(
                        originalRow[sabangnetCodeIdx],
                      ).trim();
                      if (sabangnetCode) {
                        // "-0001" 또는 "-001" 제거
                        const cleanedCode = sabangnetCode
                          .replace(/-0001$/, "")
                          .replace(/-001$/, "");
                        if (cleanedCode) {
                          row[mappingCodeColIdx] = cleanedCode;
                          setCount++;
                          // 디버깅: 처음 3개 행만 로그
                          if (setCount <= 3) {
                            console.log(
                              `  ✅ 행 ${i} (원본행 ${origRowIdx}): "${sabangnetCode}" → "${cleanedCode}"`,
                            );
                          }
                        }
                      }
                    } else {
                      errorCount++;
                      if (errorCount <= 3) {
                        console.warn(
                          `  ⚠️ 행 ${i} (원본행 ${origRowIdx}): 상품코드(사방넷) 값 없음`,
                        );
                      }
                    }
                  } else {
                    errorCount++;
                    if (errorCount <= 3) {
                      console.warn(
                        `  ⚠️ 행 ${i} (원본행 ${origRowIdx}): rawRowIdx ${rawRowIdx} >= raw.length ${raw.length}`,
                      );
                    }
                  }
                } else {
                  errorCount++;
                  if (errorCount <= 3) {
                    console.warn(
                      `  ⚠️ 행 ${i}: _originalRowIndex가 유효하지 않음 (${row[origRowIdxColIdx]})`,
                    );
                  }
                }
              }
              console.log(
                `✅ [온라인 유저] 매핑코드 설정 완료: ${setCount}건 성공${errorCount > 0 ? `, ${errorCount}건 실패` : ""}`,
              );
            } else {
              console.error(
                `❌ [온라인 유저] 매핑코드 설정 실패: mappingCodeColIdx=${mappingCodeColIdx}, origRowIdxColIdx=${origRowIdxColIdx}`,
              );
            }
          }

          // 상품명 인덱스 찾기
          const headerRow = jsonData[0] as any[];
          const nameIdx = headerRow.findIndex(
            (h: any) => h && typeof h === "string" && h.includes("상품명"),
          );

          // 쇼핑몰명이 있으면 업체명에 자동 입력
          let vendorNameStr: string | undefined = undefined;
          if (shopNameIdx !== -1 && jsonData.length > 1) {
            // 첫 번째 데이터 행에서 쇼핑몰명 가져오기
            const firstDataRow = raw[headerRowIndex + 1];
            if (firstDataRow && firstDataRow[shopNameIdx]) {
              const shopName = String(firstDataRow[shopNameIdx]).trim();
              if (shopName) {
                vendorNameStr = shopName;
                console.log(`✅ 쇼핑몰명에서 업체명 자동 입력: "${shopName}"`);
              }
            }
          }

          // 파일 ID 카운터 증가 및 ID 생성
          const {fileCounter, setFileCounter, uploadedFiles} = get();

          // 기존 업로드된 파일들의 ID를 확인하여 중복 방지
          const existingIds = new Set(uploadedFiles.map((f) => f.id));

          // 고유 ID 생성: 타임스탬프 + 랜덤 문자열을 조합하여 중복 방지
          let newFileId: string;
          let attempts = 0;
          do {
            const timestamp = Date.now().toString(36); // 타임스탬프를 36진수로 변환
            const random = Math.random().toString(36).substring(2, 8); // 랜덤 문자열
            const counter = (fileCounter + 1 + attempts)
              .toString()
              .padStart(6, "0");
            newFileId = `${counter}-${timestamp}-${random}`; // 예: "000003-k2j3h4-abc123"
            attempts++;
          } while (existingIds.has(newFileId) && attempts < 100); // 최대 100번 시도

          setFileCounter(fileCounter + 1);

          // 원본 데이터 저장 (헤더 포함, 정규화 전)
          // 메모리 절약을 위해 필요한 경우에만 저장 (상품코드(사방넷) 또는 쇼핑몰명이 있을 때만)
          let originalData: any[][] | undefined = undefined;
          if (sabangnetCodeIdx !== -1 || shopNameIdx !== -1) {
            try {
              originalData = raw.slice(headerRowIndex);
            } catch (error) {
              console.warn("원본 데이터 저장 실패:", error);
            }
          }

          // ============================================================
          // 온라인 유저의 경우: productCodeMap을 만들지 않음
          // - 온라인 유저는 오로지 원본 파일의 상품코드(사방넷) 값을 각 행에 직접 저장
          // - productCodeMap은 상품명 기준으로 덮어써지는 문제가 있어서 사용하지 않음
          // - 각 행의 매핑코드는 이미 tableData에 직접 설정되어 있음 (빈 행 필터링 후 재설정 포함)
          // ============================================================
          let initialProductCodeMap: {[name: string]: string} = {};

          // 온라인 유저는 productCodeMap을 만들지 않음 (각 행에 직접 저장된 값만 사용)
          if (!isOnlineUser) {
            // 일반 유저는 기존 로직 유지 (필요시 추가)
          }

          const uploadedFile: UploadedFile = {
            id: newFileId,
            fileName: file.name,
            rowCount: jsonData.length - 1,
            tableData: jsonData as any[][],
            headerIndex: nameIdx !== -1 ? {nameIdx} : null,
            productCodeMap: initialProductCodeMap, // 온라인 유저의 경우 상품코드(사방넷) 값으로 미리 채움
            userId: user?.id,
            uploadTime: new Date().toISOString(),
            vendorName: vendorNameStr, // 쇼핑몰명에서 자동 입력된 업체명
            originalHeader: originalHeader, // 원본 파일의 헤더 순서 (정규화 전)
            originalData: originalData, // 원본 파일의 데이터 (정규화 전, 헤더 포함)
          };

          resolve(uploadedFile);
        } catch (error: any) {
          console.error("파일 처리 중 오류:", error);
          reject(
            new Error(
              `파일 처리 중 오류가 발생했습니다: ${
                error.message || "알 수 없는 오류"
              }`,
            ),
          );
        }
      };
      reader.onerror = (error) => {
        console.error("파일 읽기 실패:", error);
        reject(
          new Error(
            `파일을 읽을 수 없습니다. 파일이 손상되었거나 지원하지 않는 형식일 수 있습니다.`,
          ),
        );
      };
      reader.readAsArrayBuffer(file);
    });
  },
  checkForDuplicateFileName: async (fileName: string): Promise<boolean> => {
    try {
      // company-id 헤더 포함
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      if (typeof window !== "undefined") {
        try {
          const stored = localStorage.getItem("auth-storage");
          if (stored) {
            const parsed = JSON.parse(stored);
            const user = parsed.state?.user;
            if (user?.companyId) {
              headers["company-id"] = user.companyId.toString();
            }
            if (user?.id) {
              headers["user-id"] = String(user.id);
            }
          }
        } catch (e) {
          console.error("인증 정보 로드 실패:", e);
        }
      }

      // temp_files 테이블 체크
      const tempResponse = await fetch("/api/upload/temp/list", {headers});
      const tempResult = await tempResponse.json();
      const isDuplicateInTemp =
        tempResult.success && tempResult.data
          ? tempResult.data.some((file: any) => file.fileName === fileName)
          : false;

      if (isDuplicateInTemp) {
        return true;
      }

      // uploads 테이블 체크 (최종 저장된 파일명)
      const uploadsResponse = await fetch("/api/upload/check-duplicate", {
        method: "POST",
        headers,
        body: JSON.stringify({fileName}),
      });
      const uploadsResult = await uploadsResponse.json();

      if (uploadsResult.success && uploadsResult.isDuplicate) {
        return true;
      }

      return false;
    } catch (error) {
      console.error("중복 파일명 체크 실패:", error);
      return false;
    }
  },

  handleFile: async (file) => {
    try {
      // user_id 체크 - 없으면 로그인 필요
      let userId: string | null = null;
      if (typeof window !== "undefined") {
        try {
          const stored = localStorage.getItem("auth-storage");
          if (stored) {
            const parsed = JSON.parse(stored);
            userId = parsed.state?.user?.id || null;
          }
        } catch (e) {
          console.error("인증 정보 로드 실패:", e);
        }
      }

      if (!userId) {
        alert("로그인이 필요합니다. 다시 로그인해주세요.");
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
        return;
      }

      // 로딩 시작
      useLoadingStore
        .getState()
        .startLoading("파일 업로드", "엑셀 파일을 분석하고 있습니다...");

      // 중복 파일명 체크
      const isDuplicate = await get().checkForDuplicateFileName(file.name);

      if (isDuplicate) {
        alert(
          `❌ 동일한 파일명 "${file.name}"이 이미 존재합니다.\n업로드가 취소되었습니다.`,
        );
        // 중복 파일명인 경우에도 input value 초기화
        if (get().fileInputRef.current) {
          get().fileInputRef.current.value = "";
        }
        return; // 중복 파일명인 경우 업로드 차단
      }

      const uploadedFile = await get().processFile(file);
      get().addUploadedFile(uploadedFile);
      get().setFileName(file.name);
      get().setTableData(uploadedFile.tableData);

      // 로딩 메시지 업데이트
      useLoadingStore
        .getState()
        .updateLoadingMessage("서버에 저장하고 있습니다...");

      // 서버에 저장
      const saveSuccess = await get().saveFilesToServer();

      // 저장 성공 후 파일 목록 다시 불러오기
      if (saveSuccess) {
        useLoadingStore
          .getState()
          .updateLoadingMessage("파일 목록을 불러오고 있습니다...");
        await get().loadFilesFromServer();
      }
    } catch (error: any) {
      console.error("파일 처리 실패:", error);
      // alert(`파일 처리 실패: ${error.message}`);
    } finally {
      // 로딩 종료
      useLoadingStore.getState().stopLoading();
      // 파일 처리 완료 후 input value 초기화 (같은 파일을 다시 선택할 수 있도록)
      if (get().fileInputRef.current) {
        get().fileInputRef.current.value = "";
      }
    }
  },
  handleFiles: async (files: File[]) => {
    const {addUploadedFile, checkForDuplicateFileName} = get();

    try {
      // user_id 체크 - 없으면 로그인 필요
      let userId: string | null = null;
      if (typeof window !== "undefined") {
        try {
          const stored = localStorage.getItem("auth-storage");
          if (stored) {
            const parsed = JSON.parse(stored);
            userId = parsed.state?.user?.id || null;
          }
        } catch (e) {
          console.error("인증 정보 로드 실패:", e);
        }
      }

      if (!userId) {
        alert("로그인이 필요합니다. 다시 로그인해주세요.");
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
        return;
      }

      // 로딩 시작
      useLoadingStore
        .getState()
        .startLoading(
          "파일 업로드",
          `${files.length}개의 파일을 처리하고 있습니다...`,
        );

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
            `❌ 다음 파일명들이 이미 존재합니다:\n\n${duplicateList}\n\n모든 파일의 업로드가 취소되었습니다.`,
          );
          // 모든 파일이 중복인 경우에도 input value 초기화
          if (get().fileInputRef.current) {
            get().fileInputRef.current.value = "";
          }
          return;
        } else {
          // 일부 파일만 중복인 경우
          alert(
            `❌ 다음 파일명들이 이미 존재하여 제외되었습니다:\n\n${duplicateList}\n\n나머지 ${validFiles.length}개 파일만 업로드됩니다.`,
          );
        }
      }

      if (validFiles.length > 0) {
        // 로딩 메시지 업데이트
        useLoadingStore
          .getState()
          .updateLoadingMessage(
            `${validFiles.length}개의 파일을 분석하고 있습니다...`,
          );

        const promises = validFiles.map((file) => get().processFile(file));
        const uploadedFiles = await Promise.all(promises);
        uploadedFiles.forEach((file) => {
          addUploadedFile(file);
          // sessionStorage에 자동 저장 (upload/view 페이지를 열지 않아도 저장 가능하도록)
          try {
            sessionStorage.setItem(
              `uploadedFile_${file.id}`,
              JSON.stringify(file),
            );
          } catch (error) {
            console.error("sessionStorage 저장 실패:", error);
          }
        });

        // 로딩 메시지 업데이트
        useLoadingStore
          .getState()
          .updateLoadingMessage("서버에 저장하고 있습니다...");

        // 서버에 저장
        const saveSuccess = await get().saveFilesToServer();

        // 저장 성공 후 파일 목록 다시 불러오기
        if (saveSuccess) {
          useLoadingStore
            .getState()
            .updateLoadingMessage("파일 목록을 불러오고 있습니다...");
          await get().loadFilesFromServer();
        }
      }
    } catch (error: any) {
      console.error("파일 처리 실패:", error);
      alert(`일부 파일 처리 실패: ${error}`);
    } finally {
      // 로딩 종료
      useLoadingStore.getState().stopLoading();
      // 파일 처리 완료 후 input value 초기화 (같은 파일을 다시 선택할 수 있도록)
      if (get().fileInputRef.current) {
        get().fileInputRef.current.value = "";
      }
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
    // 같은 파일을 다시 선택할 수 있도록 input value 초기화
    if (event.target) {
      event.target.value = "";
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
          (k) => k !== "id" && k !== "createdAt" && k !== "updatedAt",
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
      (k) => k !== "id" && k !== "etc",
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
