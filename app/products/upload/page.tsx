"use client";

import * as Excel from "exceljs";
import {saveAs} from "file-saver";
import {useRef, useState} from "react";

// Company ID 정의 (납품업체를 등록할 회사 ID를 입력하세요)
// null로 설정하면 로그인한 사용자의 company_id를 자동으로 사용합니다
const COMPANY_ID: number | null = 1; // 예: 1, 2, 3 등 숫자로 입력하거나 null로 두세요

// Vendors 데이터 정의 (여기에 납품업체 데이터를 추가하세요)

function ProductUploadPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);
  const priceUpdateFileInputRef = useRef<HTMLInputElement>(null);
  const mallUploadFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadStatus, setUploadStatus] = useState<{
    message: string;
    type: "success" | "error" | "";
  }>({message: "", type: ""});
  const [isUploading, setIsUploading] = useState(false);
  const [isSeedingVendors, setIsSeedingVendors] = useState(false);

  const handleExcelUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStatus({message: "", type: ""});

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/products/seed-excel", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setUploadStatus({
          message: result.message || "업로드 성공!",
          type: "success",
        });
      } else {
        setUploadStatus({
          message: result.error || "업로드 실패",
          type: "error",
        });
      }
    } catch (error: any) {
      setUploadStatus({
        message: error.message || "업로드 중 오류가 발생했습니다.",
        type: "error",
      });
    } finally {
      setIsUploading(false);
      // input 초기화
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleBatchUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStatus({message: "", type: ""});

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/products/batch-create-excel", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setUploadStatus({
          message: result.message || "배치 업로드 성공!",
          type: "success",
        });
      } else {
        setUploadStatus({
          message: result.error || "배치 업로드 실패",
          type: "error",
        });
      }
    } catch (error: any) {
      setUploadStatus({
        message: error.message || "배치 업로드 중 오류가 발생했습니다.",
        type: "error",
      });
    } finally {
      setIsUploading(false);
      // input 초기화
      if (batchFileInputRef.current) {
        batchFileInputRef.current.value = "";
      }
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleBatchUploadClick = () => {
    batchFileInputRef.current?.click();
  };

  const handlePriceUpdateUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStatus({message: "", type: ""});

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

      const response = await fetch("/api/products/update-price-excel", {
        method: "POST",
        headers,
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setUploadStatus({
          message: result.message || "가격 업데이트 성공!",
          type: "success",
        });
      } else {
        setUploadStatus({
          message: result.error || "가격 업데이트 실패",
          type: "error",
        });
      }
    } catch (error: any) {
      setUploadStatus({
        message: error.message || "가격 업데이트 중 오류가 발생했습니다.",
        type: "error",
      });
    } finally {
      setIsUploading(false);
      // input 초기화
      if (priceUpdateFileInputRef.current) {
        priceUpdateFileInputRef.current.value = "";
      }
    }
  };

  const handlePriceUpdateUploadClick = () => {
    priceUpdateFileInputRef.current?.click();
  };

  const handleMallUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStatus({message: "", type: ""});

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

      const response = await fetch("/api/mall/upload", {
        method: "POST",
        headers,
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setUploadStatus({
          message: result.message || "쇼핑몰 업로드 성공!",
          type: "success",
        });
      } else {
        setUploadStatus({
          message: result.error || "쇼핑몰 업로드 실패",
          type: "error",
        });
      }
    } catch (error: any) {
      setUploadStatus({
        message: error.message || "쇼핑몰 업로드 중 오류가 발생했습니다.",
        type: "error",
      });
    } finally {
      setIsUploading(false);
      // input 초기화
      if (mallUploadFileInputRef.current) {
        mallUploadFileInputRef.current.value = "";
      }
    }
  };

  const handleMallUploadClick = () => {
    mallUploadFileInputRef.current?.click();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          📤 상품 데이터 업로드
        </h1>
        <p className="text-gray-600">
          엑셀 파일을 업로드하여 상품 데이터를 일괄 등록하세요
        </p>
      </div>

      {/* 기존 상품 업로드 섹션 */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          📁 기존 상품 업로드
        </h2>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-3">
              엑셀 파일의 헤더를 자동으로 DB 칼럼과 매칭하여 저장합니다.
              <br />
              <strong>필수 칼럼:</strong> 상품명, 매핑코드
              <br />
              <strong>💡 대용량 파일:</strong> 500건 이상은 파일을 분할하여 여러
              번 업로드하세요.
            </p>
          </div>

          <div className="flex gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleExcelUpload}
              className="hidden"
            />

            <button
              onClick={handleUploadClick}
              disabled={isUploading}
              className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                isUploading
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            >
              {isUploading ? "업로드 중..." : "📁 기존 방식 업로드"}
            </button>
          </div>
        </div>
      </div>

      {/* 신규 상품 배치 업로드 섹션 */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          🚀 신규 상품 배치 업로드
        </h2>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-3">
              지정된 헤더 형식에 따라 상품 데이터를 배치로 저장합니다.
              <br />
              <strong>필수 헤더:</strong> 카테고리, 세금구분, 상품명, 품번코드,
              매입처, 상품구분, 판매가, 원가, 배송비
              <br />
              <strong>특징:</strong> 상품구분이 "위탁"이면 외주, 그 외는 내주로
              자동 설정
              <br />
              <strong>💡 배치 처리:</strong> 100건씩 배치로 효율적으로
              저장됩니다.
            </p>
          </div>

          <div className="flex gap-4">
            <input
              ref={batchFileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleBatchUpload}
              className="hidden"
            />

            <button
              onClick={handleBatchUploadClick}
              disabled={isUploading}
              className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                isUploading
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-purple-600 hover:bg-purple-700 text-white"
              }`}
            >
              {isUploading ? "업로드 중..." : "📁 배치 업로드"}
            </button>
          </div>
        </div>
      </div>

      {/* 공급단가 업데이트 섹션 */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          💰 공급단가 업데이트
        </h2>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-3">
              엑셀 파일의 상품코드와 공급단가를 읽어 기존 상품의 판매가를 일괄
              업데이트합니다.
              <br />
              <strong>필수 헤더:</strong> 상품코드, 공급단가
              <br />
              <strong>특징:</strong>
              <br />
              • 상품코드에서 맨 뒤의 "-0001"은 자동으로 제거됩니다
              <br />
              • 엑셀 파일 내의 상품코드 중복은 자동으로 필터링됩니다 (첫 번째 값
              사용)
              <br />
              • DB의 products 테이블 code 컬럼과 매칭하여 sale_price를
              업데이트합니다
              <br />
              <strong>💡 배치 처리:</strong> 대량 업데이트를 위해 배치 방식으로
              효율적으로 처리됩니다.
            </p>
          </div>

          <div className="flex gap-4">
            <input
              ref={priceUpdateFileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handlePriceUpdateUpload}
              className="hidden"
            />

            <button
              onClick={handlePriceUpdateUploadClick}
              disabled={isUploading}
              className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                isUploading
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-green-600 hover:bg-green-700 text-white"
              }`}
            >
              {isUploading ? "업데이트 중..." : "💰 공급단가 업데이트"}
            </button>
          </div>
        </div>
      </div>

      {/* 쇼핑몰 리스트 업로드 섹션 */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          🏪 쇼핑몰 리스트 업로드
        </h2>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-3">
              엑셀 파일을 업로드하여 쇼핑몰 정보를 일괄 등록합니다.
              <br />
              <strong>필수 헤더:</strong> 쇼핑몰명
              <br />
              <strong>수집 헤더:</strong> 쇼핑몰명, 법인명, 대표자명,
              사업자번호, 마켓분류, 우편번호, 주소1, 주소2, 업태, 업종, 등록일
              <br />
              <strong>특징:</strong>
              <br />
              • 각 쇼핑몰에 자동으로 코드가 부여됩니다 (shop0001, shop0002, ...)
              <br />
              • 동일한 코드가 있으면 업데이트됩니다
              <br />
              • 쇼핑몰명이 비어있는 행은 자동으로 제외됩니다
              <br />
              <strong>💡 배치 처리:</strong> 50건씩 배치로 효율적으로
              저장됩니다.
            </p>
          </div>

          <div className="flex gap-4">
            <input
              ref={mallUploadFileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleMallUpload}
              className="hidden"
            />

            <button
              onClick={handleMallUploadClick}
              disabled={isUploading}
              className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                isUploading
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-orange-600 hover:bg-orange-700 text-white"
              }`}
            >
              {isUploading ? "업로드 중..." : "🏪 쇼핑몰 리스트 업로드"}
            </button>
          </div>
        </div>
      </div>

      {/* 공통 상태 표시 */}
      {uploadStatus.message && (
        <div
          className={`mt-4 p-4 rounded-lg ${
            uploadStatus.type === "success"
              ? "bg-green-50 border border-green-200 text-green-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          {uploadStatus.message}
        </div>
      )}

      {/* 사용 가이드 */}
      <div className="bg-blue-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-3">
          📖 사용 가이드
        </h3>
        <div className="space-y-2 text-sm text-blue-800">
          <p>
            • <strong>템플릿 다운로드:</strong> 올바른 형식의 엑셀 파일을
            받으세요.
          </p>
          <p>
            • <strong>필수 칼럼:</strong> 상품명과 매핑코드는 반드시 포함되어야
            합니다.
          </p>
          <p>
            • <strong>파일 형식:</strong> .xlsx 또는 .xls 파일만 지원합니다.
          </p>
          <p>
            • <strong>파일 크기:</strong> 최대 10MB까지 업로드 가능합니다.
          </p>
          <p>
            • <strong>대용량 파일:</strong> 500건 이상은 파일을 나누어
            업로드하세요.
          </p>
        </div>
      </div>
    </div>
  );
}

export default ProductUploadPage;
