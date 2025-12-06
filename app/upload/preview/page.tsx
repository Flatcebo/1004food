"use client";

import {useEffect, useState} from "react";

interface UploadDataItem {
  fileName: string;
  rowCount: number;
  data: any[];
}

export default function UploadPreviewPage() {
  const [uploadData, setUploadData] = useState<UploadDataItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sentTimestamp, setSentTimestamp] = useState<string>("");

  useEffect(() => {
    // sessionStorage에서 전송 완료된 데이터 가져오기
    const storedData = sessionStorage.getItem("uploadSentData");
    const timestamp = sessionStorage.getItem("uploadSentTimestamp");
    
    if (storedData) {
      try {
        const parsedData = JSON.parse(storedData);
        setUploadData(parsedData);
        if (timestamp) {
          setSentTimestamp(new Date(timestamp).toLocaleString("ko-KR"));
        }
      } catch (error) {
        console.error("데이터 파싱 실패:", error);
      }
    }
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <div>로딩 중...</div>
      </div>
    );
  }

  if (uploadData.length === 0) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <div>표시할 데이터가 없습니다.</div>
      </div>
    );
  }

  // 모든 데이터를 하나의 배열로 합치기
  const allRows: any[] = [];
  uploadData.forEach((file) => {
    file.data.forEach((row) => {
      allRows.push(row);
    });
  });

  // 모든 헤더 수집
  const allHeaders = new Set<string>();
  allRows.forEach((row) => {
    Object.keys(row).forEach((key) => allHeaders.add(key));
  });
  const headers = Array.from(allHeaders);

  return (
    <div className="w-full h-screen p-4 overflow-auto bg-white">
      <div className="mb-4">
        <h1 className="text-2xl font-bold mb-2">전송할 데이터</h1>
        <div className="text-sm text-gray-600">
          총 {uploadData.length}개 파일, {allRows.length}건의 데이터
          {sentTimestamp && (
            <span className="ml-2 text-gray-500">
              (생성 시간: {sentTimestamp})
            </span>
          )}
        </div>
      </div>

      {/* 파일별 요약 */}
      <div className="mb-4">
        {uploadData.map((file, idx) => (
          <div key={idx} className="text-sm text-gray-700 mb-1">
            • {file.fileName}: {file.rowCount}건
          </div>
        ))}
      </div>

      {/* 테이블 */}
      <div className="mt-4 w-full overflow-x-auto">
        <table className="table-auto border border-collapse border-gray-400 w-full min-w-[800px]">
          <thead>
            <tr>
              {headers.map((header, idx) => (
                <th
                  key={idx}
                  className="border bg-gray-100 px-2 py-1 text-xs font-semibold"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allRows.map((row, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-gray-50">
                {headers.map((header, colIdx) => (
                  <td
                    key={colIdx}
                    className="border px-2 py-1 border-gray-300 text-xs"
                  >
                    {row[header] !== undefined && row[header] !== null
                      ? String(row[header])
                      : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

