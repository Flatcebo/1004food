"use client";

import {useState, useEffect} from "react";
import ModalPortal from "@/components/ModalPortal";
import {getAuthHeaders} from "@/utils/api";
import {IoClose} from "react-icons/io5";

interface UploadComparisonModalProps {
  uploadId: string;
  source: "temp_files" | "uploads";
  fileName: string;
  onClose: () => void;
}

interface UploadDetail {
  fileName: string;
  vendorName: string | null;
  uploadTime: string;
  originalData: any[];
  savedData: any[];
}

export default function UploadComparisonModal({
  uploadId,
  source,
  fileName,
  onClose,
}: UploadComparisonModalProps) {
  const [data, setData] = useState<UploadDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    fetchUploadDetail();
  }, [uploadId, source]);

  const fetchUploadDetail = async () => {
    try {
      setIsLoading(true);
      const headers = getAuthHeaders();
      const response = await fetch(
        `/api/logs/uploads/${uploadId}?source=${source}`,
        {
          headers,
        },
      );
      const result = await response.json();

      if (!result.success) {
        setError(result.error || "데이터를 불러오는데 실패했습니다.");
        return;
      }

      setData(result.data);
    } catch (err: any) {
      console.error("업로드 상세 조회 오류:", err);
      setError("데이터를 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const getChangedFields = (original: any, saved: any) => {
    if (!original || !saved) return [];
    const changed: string[] = [];
    Object.keys(saved).forEach((key) => {
      if (original[key] !== saved[key]) {
        changed.push(key);
      }
    });
    return changed;
  };

  const renderRow = (
    row: any,
    index: number,
    isOriginal: boolean,
    headers: string[],
  ) => {
    if (!row) return null;
    const savedRow =
      isOriginal && data?.savedData[index] ? data.savedData[index] : null;
    const changedFields =
      isOriginal && savedRow ? getChangedFields(row, savedRow) : [];

    return (
      <tr
        key={index}
        className={isOriginal && changedFields.length > 0 ? "bg-yellow-50" : ""}
        style={{height: "40px"}}
      >
        {headers.map((key) => {
          // 숨길 헤더는 렌더링하지 않음
          if (hiddenHeaders.includes(key)) return null;

          const isChanged = changedFields.includes(key);
          return (
            <td
              key={key}
              className={`px-4 py-2 text-xs border ${
                isChanged ? "bg-red-100 font-semibold" : "bg-white"
              }`}
              style={{height: "40px"}}
            >
              {row[key] || "-"}
            </td>
          );
        })}
      </tr>
    );
  };

  // upload/view 페이지와 동일한 헤더 순서
  const headerOrder = [
    "내부코드",
    "등록일",
    "업체명",
    "내외주",
    "택배사",
    "수취인명",
    "수취인 전화번호",
    "우편",
    "주소",
    "수량",
    "상품명",
    "주문자명",
    "주문자 전화번호",
    "배송메시지",
    "매핑코드",
  ];

  // 숨길 헤더 목록
  const hiddenHeaders = ["rowOrder", "productId", "순서번호", "주문상태"];

  const getHeaders = (data: any[]) => {
    if (!data || data.length === 0) return [];
    const allKeys = Object.keys(data[0]);

    // 숨길 헤더 제거
    const visibleKeys = allKeys.filter((key) => !hiddenHeaders.includes(key));

    // 헤더 순서 정렬
    return visibleKeys.sort((a, b) => {
      const aIndex = headerOrder.indexOf(a);
      const bIndex = headerOrder.indexOf(b);

      // 둘 다 순서에 있으면 순서대로
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      // a만 순서에 있으면 앞으로
      if (aIndex !== -1) return -1;
      // b만 순서에 있으면 앞으로
      if (bIndex !== -1) return 1;
      // 둘 다 순서에 없으면 알파벳 순서
      return a.localeCompare(b);
    });
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4">
          <div className="text-center text-gray-500">로딩 중...</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-800">오류</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <IoClose size={24} />
            </button>
          </div>
          <div className="text-red-600">
            {error || "데이터를 불러올 수 없습니다."}
          </div>
        </div>
      </div>
    );
  }

  const originalHeaders = getHeaders(data.originalData);
  const savedHeaders = getHeaders(data.savedData);
  const allHeaders = Array.from(new Set([...originalHeaders, ...savedHeaders]));

  // 숨길 헤더 제거
  const visibleHeaders = allHeaders.filter(
    (header) => !hiddenHeaders.includes(header),
  );

  return (
    <ModalPortal>
      <div className="fixed inset-0 bg-black/30 bg-opacity-50 flex items-center justify-center z-50 p-2">
        <div className="bg-white rounded-lg w-[98vw] h-[98vh] flex flex-col shadow-2xl">
          {/* 헤더 */}
          <div className="flex justify-between items-center p-4 border-b border-gray-200 shrink-0">
            <div>
              <h2 className="text-xl font-bold text-gray-800">{fileName}</h2>
              <p className="text-sm text-gray-500 mt-1">
                업체명: {data.vendorName || "-"} | 업로드 시간:{" "}
                {new Date(data.uploadTime).toLocaleString("ko-KR")}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              <IoClose size={24} />
            </button>
          </div>

          {/* 내용 */}
          <div className="flex-1 overflow-hidden p-4 flex flex-col gap-4">
            {/* 상단: 원본 데이터 */}
            <div className="flex flex-col flex-1 min-h-0">
              <h3 className="text-lg font-semibold text-gray-800 mb-2 bg-blue-50 p-2 rounded shrink-0">
                업로드 당시 주문 Row (원본)
              </h3>
              <div className="flex-1 overflow-auto border border-gray-200 rounded min-h-0">
                {data.originalData.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    원본 데이터가 없습니다.
                  </div>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        {visibleHeaders.map((header) => (
                          <th
                            key={header}
                            className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border"
                            style={{height: "40px"}}
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {data.originalData.map((row, index) =>
                        renderRow(row, index, true, visibleHeaders),
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* 하단: 저장된 데이터 */}
            <div className="flex flex-col flex-1 min-h-0">
              <h3 className="text-lg font-semibold text-gray-800 mb-2 bg-green-50 p-2 rounded shrink-0">
                DB에 저장한 주문 Row
              </h3>
              <div className="flex-1 overflow-auto border border-gray-200 rounded min-h-0">
                {data.savedData.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    저장된 데이터가 없습니다.
                  </div>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        {visibleHeaders.map((header) => (
                          <th
                            key={header}
                            className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border"
                            style={{height: "40px"}}
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {data.savedData.map((row, index) =>
                        renderRow(row, index, false, visibleHeaders),
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* 변경 사항 안내 */}
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded shrink-0">
              <p className="text-sm text-yellow-800">
                <strong>참고:</strong> 상단 원본 데이터에서{" "}
                <span className="bg-red-100 px-1 rounded">
                  빨간색으로 표시된 셀
                </span>
                은 하단 저장된 데이터와 다른 부분입니다.
              </p>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
