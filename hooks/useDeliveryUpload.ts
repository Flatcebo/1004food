import {useState, useCallback, useRef} from "react";

export interface DeliveryResult {
  type: "init" | "processing" | "result";
  message?: string;
  orderNumber?: string;
  currentIndex?: number;
  totalCount?: number;
  success?: boolean;
  error?: string;
  carrier?: string;
  trackingNumber?: string;
  rowNumber?: number;
  successCount?: number;
  failCount?: number;
}

export interface DeliveryFinalResult {
  totalCount: number;
  successCount: number;
  failCount: number;
  duplicateCount: number;
  message: string;
}

export interface FileDeliveryResult {
  fileName: string;
  isUploading: boolean;
  uploadProgress: number;
  currentOrderNumber: string;
  results: DeliveryResult[];
  finalResult: DeliveryFinalResult | null;
  error: string;
}

export const useDeliveryUpload = () => {
  // 파일별 결과 관리 (파일명을 키로 사용)
  const [fileResults, setFileResults] = useState<
    Map<string, FileDeliveryResult>
  >(new Map());
  const [currentUploadingFile, setCurrentUploadingFile] = useState<string | null>(null);

  // 운송장 업로드 파일 입력 ref
  const deliveryFileInputRef = useRef<HTMLInputElement>(null);

  // 파일별 결과 초기화
  const initializeFileResult = useCallback((fileName: string) => {
    setFileResults((prev) => {
      const newMap = new Map(prev);
      newMap.set(fileName, {
        fileName,
        isUploading: true,
        uploadProgress: 0,
        currentOrderNumber: "",
        results: [],
        finalResult: null,
        error: "",
      });
      return newMap;
    });
    setCurrentUploadingFile(fileName);
  }, []);

  // 파일별 결과 업데이트
  const updateFileResult = useCallback(
    (fileName: string, updates: Partial<FileDeliveryResult>) => {
      setFileResults((prev) => {
        const newMap = new Map(prev);
        const current = newMap.get(fileName);
        if (current) {
          newMap.set(fileName, {...current, ...updates});
        }
        return newMap;
      });
    },
    []
  );

  // 운송장 업로드 파일 처리 핸들러
  const handleDeliveryFileUpload = useCallback(async (file: File) => {
    if (!file) return;

    // 엑셀 파일 검증
    const allowedExtensions = [".xlsx", ".xls"];
    const fileExtension = file.name
      .toLowerCase()
      .substring(file.name.lastIndexOf("."));

    if (!allowedExtensions.includes(fileExtension)) {
      // 파일별 에러 설정
      setFileResults((prev) => {
        const newMap = new Map(prev);
        const existing = newMap.get(file.name);
        if (existing) {
          newMap.set(file.name, {
            ...existing,
            error: "엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.",
            isUploading: false,
          });
        } else {
          newMap.set(file.name, {
            fileName: file.name,
            isUploading: false,
            uploadProgress: 0,
            currentOrderNumber: "",
            results: [],
            finalResult: null,
            error: "엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.",
          });
        }
        return newMap;
      });
      return;
    }

    // 파일별 결과 초기화
    initializeFileResult(file.name);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // company-id 헤더 포함
      const headers: HeadersInit = {};

      if (typeof window !== "undefined") {
        try {
          const stored = localStorage.getItem("auth-storage");
          if (stored) {
            const parsed = JSON.parse(stored);
            const user = parsed.state?.user;
            if (user?.companyId) {
              headers["company-id"] = user.companyId.toString();
            }
          }
        } catch (e) {
          console.error("인증 정보 로드 실패:", e);
        }
      }

      // 파일 업로드 요청
      const response = await fetch("/api/upload/delivery-upload", {
        method: "POST",
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "업로드 실패");
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "업로드 실패");
      }

      // 결과를 빠르게 표시
      let currentSuccessCount = 0;
      let currentFailCount = 0;

      // 모든 결과를 한 번에 표시
      const allResults: DeliveryResult[] = [
        {
          type: "init",
          message: `총 ${data.totalCount}건의 운송장 정보를 처리합니다.`,
        },
      ];

      for (let i = 0; i < data.results.length; i++) {
        const result = data.results[i];

        if (result.success) {
          currentSuccessCount++;
        } else {
          currentFailCount++;
        }

        allResults.push({
          type: "result",
          orderNumber: result.orderNumber,
          success: result.success,
          error: result.error,
          carrier: result.carrier,
          trackingNumber: result.trackingNumber,
          rowNumber: result.rowNumber,
          currentIndex: i + 1,
          totalCount: data.totalCount,
          successCount: currentSuccessCount,
          failCount: currentFailCount,
        });
      }

      // 파일별 결과 업데이트
      updateFileResult(file.name, {
        isUploading: false,
        uploadProgress: 100,
        currentOrderNumber: "",
        results: allResults,
        finalResult: {
          totalCount: data.totalCount,
          successCount: data.successCount,
          failCount: data.failCount,
          duplicateCount: data.duplicateCount || 0,
          message: data.message,
        },
        error: "",
      });

      setCurrentUploadingFile(null);
    } catch (error: any) {
      updateFileResult(file.name, {
        isUploading: false,
        error: error.message || "업로드 중 오류가 발생했습니다.",
      });
      setCurrentUploadingFile(null);
    }
  }, [initializeFileResult, updateFileResult]);

  // 여러 파일 업로드 처리
  const handleMultipleFilesUpload = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      for (const file of fileArray) {
        await handleDeliveryFileUpload(file);
      }
    },
    [handleDeliveryFileUpload]
  );

  // 운송장 파일 변경 핸들러 (여러 파일 지원)
  const handleDeliveryFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        handleMultipleFilesUpload(files);
        // input 초기화하여 같은 파일도 다시 선택 가능하도록
        if (event.target) {
          event.target.value = "";
        }
      }
    },
    [handleMultipleFilesUpload]
  );

  // 운송장 드래그 앤 드롭 핸들러 (여러 파일 지원)
  const handleDeliveryDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const files = event.dataTransfer.files;
      if (files && files.length > 0) {
        handleMultipleFilesUpload(files);
      }
    },
    [handleMultipleFilesUpload]
  );

  const handleDeliveryDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
    },
    []
  );

  // 특정 파일 결과 제거
  const removeFileResult = useCallback((fileName: string) => {
    setFileResults((prev) => {
      const newMap = new Map(prev);
      newMap.delete(fileName);
      return newMap;
    });
  }, []);

  // 상태 초기화 함수
  const resetDeliveryUploadState = () => {
    setFileResults(new Map());
    setCurrentUploadingFile(null);
  };

  // 전체 업로드 중 여부 (하나라도 업로드 중이면 true)
  const isUploading = Array.from(fileResults.values()).some(
    (result) => result.isUploading
  );

  // 전체 진행률 계산 (평균)
  const uploadProgress = Array.from(fileResults.values()).reduce(
    (acc, result) => acc + result.uploadProgress,
    0
  ) / Math.max(fileResults.size, 1);

  return {
    // 상태
    isUploading,
    uploadProgress,
    currentUploadingFile,
    fileResults: Array.from(fileResults.values()),
    deliveryFileInputRef,

    // 핸들러
    handleDeliveryFileUpload,
    handleMultipleFilesUpload,
    handleDeliveryFileChange,
    handleDeliveryDrop,
    handleDeliveryDragOver,
    removeFileResult,

    // 초기화
    resetDeliveryUploadState,
  };
};
