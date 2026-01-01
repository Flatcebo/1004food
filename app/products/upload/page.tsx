"use client";

import * as Excel from "exceljs";
import {saveAs} from "file-saver";
import {useRef, useState} from "react";

function ProductUploadPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadStatus, setUploadStatus] = useState<{
    message: string;
    type: "success" | "error" | "";
  }>({message: "", type: ""});
  const [isUploading, setIsUploading] = useState(false);

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

  const downloadProductTemplate = async () => {
    try {
      const wb = new Excel.Workbook();
      const sheet = wb.addWorksheet("상품 목록");

      // 헤더 정의
      const headers = [
        "상품명",
        "매핑코드",
        "내외주",
        "택배사",
        "포장",
        "가격",
        "판매가",
        "택배비",
        "구매처",
        "계산서",
        "카테고리",
        "상품타입",
        "사방넷명",
        "비고",
      ];

      const headerRow = sheet.addRow(headers);
      headerRow.height = 30;

      // 헤더 스타일
      headerRow.eachCell((cell, colNum) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: {argb: "ff4472c4"},
        };
        cell.font = {
          name: "Arial",
          size: 11,
          bold: true,
          color: {argb: "ffffffff"},
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: "center",
          wrapText: true,
        };
        cell.border = {
          top: {style: "thin", color: {argb: "ff000000"}},
          left: {style: "thin", color: {argb: "ff000000"}},
          bottom: {style: "thin", color: {argb: "ff000000"}},
          right: {style: "thin", color: {argb: "ff000000"}},
        };

        // 열 너비 설정
        const widths = [20, 15, 10, 10, 10, 12, 12, 10, 15, 12, 15, 12, 15, 20];
        sheet.getColumn(colNum).width = widths[colNum - 1];
      });

      // 샘플 데이터 추가
      const sampleData = [
        [
          "샘플 상품 1",
          "PROD001",
          "내주",
          "CJ택배",
          "박스",
          10000,
          12000,
          3000,
          "샘플 업체",
          "세금계산서",
          "식품",
          "일반",
          "샘플상품1",
          "샘플 데이터입니다",
        ],
        [
          "샘플 상품 2",
          "PROD002",
          "외주",
          "로젠",
          "비닐",
          5000,
          7000,
          2500,
          "테스트 업체",
          "현금영수증",
          "생활용품",
          "특가",
          "샘플상품2",
          "",
        ],
      ];

      sampleData.forEach((rowData) => {
        const row = sheet.addRow(rowData);
        row.eachCell((cell) => {
          cell.alignment = {
            vertical: "middle",
            horizontal: "center",
          };
          cell.border = {
            top: {style: "thin", color: {argb: "ffd0d0d0"}},
            left: {style: "thin", color: {argb: "ffd0d0d0"}},
            bottom: {style: "thin", color: {argb: "ffd0d0d0"}},
            right: {style: "thin", color: {argb: "ffd0d0d0"}},
          };
        });
      });

      // 파일 다운로드
      const fileData = await wb.xlsx.writeBuffer();
      const blob = new Blob([fileData], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      saveAs(blob, "상품_업로드_템플릿.xlsx");
    } catch (error) {
      console.error("템플릿 다운로드 실패:", error);
      alert("템플릿 다운로드 중 오류가 발생했습니다.");
    }
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
              <strong>💡 대용량 파일:</strong> 500건 이상은 파일을 분할하여 여러 번 업로드하세요.
            </p>
          </div>

          <div className="flex gap-4">
            <button
              onClick={downloadProductTemplate}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              📋 템플릿 다운로드
            </button>

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
              <strong>필수 헤더:</strong> 카테고리, 세금구분, 상품명, 품번코드, 매입처, 상품구분, 판매가, 원가, 배송비
              <br />
              <strong>특징:</strong> 상품구분이 "위탁"이면 외주, 그 외는 내주로 자동 설정
              <br />
              <strong>💡 배치 처리:</strong> 100건씩 배치로 효율적으로 저장됩니다.
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
          <p>• <strong>템플릿 다운로드:</strong> 올바른 형식의 엑셀 파일을 받으세요.</p>
          <p>• <strong>필수 칼럼:</strong> 상품명과 매핑코드는 반드시 포함되어야 합니다.</p>
          <p>• <strong>파일 형식:</strong> .xlsx 또는 .xls 파일만 지원합니다.</p>
          <p>• <strong>파일 크기:</strong> 최대 10MB까지 업로드 가능합니다.</p>
          <p>• <strong>대용량 파일:</strong> 500건 이상은 파일을 나누어 업로드하세요.</p>
        </div>
      </div>
    </div>
  );
}

export default ProductUploadPage;
