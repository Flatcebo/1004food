"use client";

interface RowDetailWindowProps {
  rowData: any;
  onClose: () => void;
}

export default function RowDetailWindow({
  rowData,
  onClose,
}: RowDetailWindowProps) {
  if (!rowData) return null;

  return (
    <div className="fixed inset-0 bg-[#00000080] bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[90vw] max-w-4xl h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold">상세 데이터</h2>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            닫기
          </button>
        </div>

        {/* 상세 데이터 */}
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(rowData)
              .filter(([key]) => key !== "file_name")
              .map(([key, value]: [key: string, value: any]) => (
                <div key={key} className="pb-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {key === "id"
                      ? "ID"
                      : key === "upload_time"
                      ? "업로드 시간"
                      : key === "내부코드"
                      ? "내부코드"
                      : key === "매핑코드"
                      ? "매핑코드"
                      : key === "상품명"
                      ? "상품명"
                      : key === "내외주"
                      ? "내외주"
                      : key === "택배사"
                      ? "택배사"
                      : key === "합포수량"
                      ? "합포수량"
                      : key === "가격"
                      ? "가격"
                      : key === "택배비"
                      ? "택배비"
                      : key === "기타"
                      ? "기타"
                      : key === "우편"
                      ? "우편번호"
                      : key}
                  </label>
                  <div className="text-sm text-gray-900 wrap-break-words">
                    {key === "upload_time" && value
                      ? new Date(value).toLocaleString("ko-KR")
                      : value !== undefined && value !== null
                      ? String(value)
                      : "-"}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
