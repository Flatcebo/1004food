"use client";

import {useState, useEffect} from "react";

interface CodeItem {
  id: string;
  type: string;
  postType: string;
  name: string;
  code: string;
  pkg: string;
  price: number | null;
  postFee: number | null;
  etc: string;
}

interface CodeEditWindowProps {
  rowId: number;
  currentRowData: any;
  onCodeUpdate: (rowId: number, code: string) => void;
  onClose: () => void;
}

export default function CodeEditWindow({
  rowId,
  currentRowData,
  onCodeUpdate,
  onClose,
}: CodeEditWindowProps) {
  // 현재 row 데이터에서 주요 필드 추출
  const currentCode = currentRowData?.매핑코드 || "";
  const currentProductName = currentRowData?.상품명 || "";
  const [codes, setCodes] = useState<CodeItem[]>([]);
  const [currentCodeData, setCurrentCodeData] = useState<CodeItem | null>(null);
  const [codeSearch, setCodeSearch] = useState<string>("");
  const [nameSearch, setNameSearch] = useState<string>("");
  const [filteredCodes, setFilteredCodes] = useState<CodeItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 상품 목록 로드 (DB에서)
    fetch("/api/products/list")
      .then((res) => res.json())
      .then((result) => {
        if (result.success) {
          const data = result.data || [];
          setCodes(data);
          setFilteredCodes(data);

          // 현재 매핑코드에 해당하는 데이터 찾기
          if (currentCode) {
            const found = data.find(
              (item: CodeItem) => item.code === currentCode
            );
            setCurrentCodeData(found || null);
          }
        }
      })
      .catch((error) => {
        console.error("코드 데이터 로드 실패:", error);
      });
  }, [currentCode]);

  useEffect(() => {
    // 검색 필터링
    let filtered = codes;

    if (codeSearch.trim()) {
      filtered = filtered.filter((item) =>
        item.code.toLowerCase().includes(codeSearch.toLowerCase())
      );
    }

    if (nameSearch.trim()) {
      filtered = filtered.filter((item) =>
        item.name.toLowerCase().includes(nameSearch.toLowerCase())
      );
    }

    setFilteredCodes(filtered);
  }, [codeSearch, nameSearch, codes]);

  const handleCodeSelect = async (codeItem: CodeItem) => {
    setLoading(true);
    try {
      const response = await fetch("/api/upload/update-code", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rowId,
          codeData: {
            code: codeItem.code,
            type: codeItem.type,
            postType: codeItem.postType,
            pkg: codeItem.pkg,
            price: codeItem.price,
            postFee: codeItem.postFee,
            etc: codeItem.etc,
          },
        }),
      });

      const result = await response.json();

      if (result.success) {
        onCodeUpdate(rowId, codeItem.code);
        alert("매핑코드 및 관련 데이터가 업데이트되었습니다.");
        onClose();
      } else {
        alert(`업데이트 실패: ${result.error}`);
      }
    } catch (error: any) {
      console.error("매핑코드 업데이트 중 오류:", error);
      alert(`업데이트 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#00000084] bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[90vw] max-w-6xl h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold">매핑코드 수정</h2>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            닫기
          </button>
        </div>

        {/* 현재 매핑코드 정보 */}
        <div className="p-4 bg-gray-50 border-b">
          <h3 className="text-lg font-semibold mb-4">현재 매핑코드 데이터</h3>
          {currentCodeData ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  내외주
                </label>
                <div className="text-sm text-gray-900">
                  {currentCodeData.type || "-"}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  택배사
                </label>
                <div className="text-sm text-gray-900">
                  {currentCodeData.postType || "-"}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  상품명
                </label>
                <div className="text-sm text-gray-900 wrap-break-word">
                  {currentCodeData.name || "-"}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  매핑코드
                </label>
                <div className="text-sm text-gray-900 font-mono">
                  {currentCodeData.code || "-"}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  합포수량
                </label>
                <div className="text-sm text-gray-900">
                  {currentCodeData.pkg || "-"}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  가격
                </label>
                <div className="text-sm text-gray-900">
                  {currentCodeData.price !== undefined &&
                  currentCodeData.price !== null
                    ? currentCodeData.price.toLocaleString()
                    : "-"}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  택배비
                </label>
                <div className="text-sm text-gray-900">
                  {currentCodeData.postFee !== undefined &&
                  currentCodeData.postFee !== null
                    ? currentCodeData.postFee.toLocaleString()
                    : "-"}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  기타
                </label>
                <div className="text-sm text-gray-900 wrap-break-word">
                  {currentCodeData.etc || "-"}
                </div>
              </div>
            </div>
          ) : currentCode ? (
            <div className="text-sm text-gray-600">
              매핑코드 "{currentCode}"에 해당하는 데이터를 찾을 수 없습니다.
            </div>
          ) : (
            <div className="text-sm text-gray-600">
              현재 매핑코드가 설정되어 있지 않습니다.
            </div>
          )}
        </div>

        {/* 검색 영역 */}
        <div className="p-4 border-b">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                매핑코드 검색
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="매핑코드 입력"
                value={codeSearch}
                onChange={(e) => setCodeSearch(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                상품명 검색
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="상품명 입력"
                value={nameSearch}
                onChange={(e) => setNameSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-2 text-sm text-gray-600">
            검색 결과: {filteredCodes.length}건
          </div>
        </div>

        {/* 결과 테이블 */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-500">업데이트 중...</div>
            </div>
          ) : (
            <table className="w-full border-collapse border border-gray-300">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium">
                    내외주
                  </th>
                  <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium">
                    택배사
                  </th>
                  <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium">
                    상품명
                  </th>
                  <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium">
                    매핑코드
                  </th>
                  <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium">
                    합포수량
                  </th>
                  <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium">
                    가격
                  </th>
                  <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium">
                    택배비
                  </th>
                  <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium">
                    기타
                  </th>
                  <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium">
                    선택
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredCodes.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="border border-gray-300 px-4 py-8 text-center text-gray-500"
                    >
                      검색 결과가 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredCodes.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-blue-50 cursor-pointer transition-colors"
                    >
                      <td className="border border-gray-300 px-4 py-2 text-sm">
                        {item.type}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-sm">
                        {item.postType}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-sm">
                        {item.name}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-sm font-mono">
                        {item.code}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-sm">
                        {item.pkg}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-sm">
                        {item.price !== undefined && item.price !== null
                          ? item.price.toLocaleString()
                          : "-"}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-sm">
                        {item.postFee !== undefined && item.postFee !== null
                          ? item.postFee.toLocaleString()
                          : "-"}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-sm">
                        {item.etc || "-"}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-sm">
                        <button
                          onClick={() => handleCodeSelect(item)}
                          className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
                        >
                          선택
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
