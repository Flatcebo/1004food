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
  message: string;
}

export const useDeliveryUpload = () => {
  // 운송장 업로드 관련 상태
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentOrderNumber, setCurrentOrderNumber] = useState<string>("");
  const [deliveryResults, setDeliveryResults] = useState<DeliveryResult[]>([]);
  const [finalResult, setFinalResult] = useState<DeliveryFinalResult | null>(
    null
  );
  const [deliveryError, setDeliveryError] = useState<string>("");

  // 운송장 업로드 파일 입력 ref
  const deliveryFileInputRef = useRef<HTMLInputElement>(null);

  // 운송장 업로드 파일 처리 핸들러
  const handleDeliveryFileUpload = useCallback(async (file: File) => {
    if (!file) return;

    // 엑셀 파일 검증
    const allowedExtensions = [".xlsx", ".xls"];
    const fileExtension = file.name
      .toLowerCase()
      .substring(file.name.lastIndexOf("."));

    if (!allowedExtensions.includes(fileExtension)) {
      setDeliveryError("엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.");
      return;
    }

    setIsUploading(true);
    setDeliveryError("");

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

      // 결과를 실시간으로 표시하기 위해 하나씩 추가
      setDeliveryResults([
        {
          type: "init",
          message: `총 ${data.totalCount}건의 운송장 정보를 처리합니다.`,
        },
      ]);

      // 결과를 순차적으로 표시
      for (let i = 0; i < data.results.length; i++) {
        const result = data.results[i];

        // 처리 중 표시
        setCurrentOrderNumber(result.orderNumber);
        setUploadProgress(((i + 1) / data.totalCount) * 100);

        setDeliveryResults((prev) => [
          ...prev,
          {
            type: "processing",
            orderNumber: result.orderNumber,
            currentIndex: i + 1,
            totalCount: data.totalCount,
          },
        ]);

        // 약간의 지연 후 결과 표시
        await new Promise((resolve) => setTimeout(resolve, 300));

        setDeliveryResults((prev) => [
          ...prev,
          {
            type: "result",
            orderNumber: result.orderNumber,
            success: result.success,
            error: result.error,
            carrier: result.carrier,
            trackingNumber: result.trackingNumber,
            rowNumber: result.rowNumber,
            currentIndex: i + 1,
            totalCount: data.totalCount,
            successCount: result.success
              ? prev.filter((r) => r.type === "result" && r.success).length + 1
              : prev.filter((r) => r.type === "result" && r.success).length,
            failCount: !result.success
              ? prev.filter((r) => r.type === "result" && !r.success).length + 1
              : prev.filter((r) => r.type === "result" && !r.success).length,
          },
        ]);
      }

      // 최종 결과 설정
      setFinalResult({
        totalCount: data.totalCount,
        successCount: data.successCount,
        failCount: data.failCount,
        message: data.message,
      });

      setIsUploading(false);
    } catch (error: any) {
      setDeliveryError(error.message || "업로드 중 오류가 발생했습니다.");
      setIsUploading(false);
    }
  }, []);

  // 운송장 파일 변경 핸들러
  const handleDeliveryFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        handleDeliveryFileUpload(file);
      }
    },
    [handleDeliveryFileUpload]
  );

  // 운송장 드래그 앤 드롭 핸들러
  const handleDeliveryDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const file = event.dataTransfer.files?.[0];
      if (file) {
        handleDeliveryFileUpload(file);
      }
    },
    [handleDeliveryFileUpload]
  );

  const handleDeliveryDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
    },
    []
  );

  // 상태 초기화 함수
  const resetDeliveryUploadState = () => {
    setIsUploading(false);
    setUploadProgress(0);
    setCurrentOrderNumber("");
    setDeliveryResults([]);
    setFinalResult(null);
    setDeliveryError("");
  };

  return {
    // 상태
    isUploading,
    uploadProgress,
    currentOrderNumber,
    deliveryResults,
    finalResult,
    deliveryError,
    deliveryFileInputRef,

    // 핸들러
    handleDeliveryFileUpload,
    handleDeliveryFileChange,
    handleDeliveryDrop,
    handleDeliveryDragOver,

    // 초기화
    resetDeliveryUploadState,
  };
};
