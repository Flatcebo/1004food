"use client";

import {useState, useEffect} from "react";
import CodeEditWindow from "./CodeEditWindow";
import RowDetailWindow from "./RowDetailWindow";
import Pagination from "./Pagination";
import ActiveFilters from "./ActiveFilters";

interface SavedDataTableProps {
  loading: boolean;
  tableRows: any[];
  headers: string[];
  paginatedRows: any[];
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onDataUpdate?: () => void;
  // 필터 정보
  selectedType?: string;
  selectedPostType?: string;
  selectedVendor?: string;
  selectedOrderStatus?: string;
  appliedSearchField?: string;
  appliedSearchValue?: string;
  uploadTimeFrom?: string;
  uploadTimeTo?: string;
  // 필터 제거 함수
  onRemoveFilter?: (filterType: string) => void;
}

export default function SavedDataTable({
  loading,
  tableRows,
  headers,
  paginatedRows,
  currentPage,
  totalPages,
  onPageChange,
  onDataUpdate,
  selectedType = "",
  selectedPostType = "",
  selectedVendor = "",
  selectedOrderStatus = "",
  appliedSearchField = "",
  appliedSearchValue = "",
  uploadTimeFrom = "",
  uploadTimeTo = "",
  onRemoveFilter,
}: SavedDataTableProps) {
  // 숨길 헤더 목록
  const hiddenHeaders = [
    "file_name",
    "가격",
    "기타",
    "택배비",
    "합포수량",
    "upload_time",
  ];

  // 헤더 순서는 useUploadData에서 이미 정렬되어 전달되므로 그대로 사용
  const filteredHeaders = headers.filter(
    (header) => !hiddenHeaders.includes(header)
  );

  // 각 컬럼의 width 설정 (px 단위)
  const getColumnWidth = (header: string): string => {
    const widthMap: Record<string, string> = {
      id: "60px",
      매핑코드: "100px",
      주문상태: "80px",
      우편: "60px",
      내외주: "50px",
      주소: "250px",
      상품명: "200px",
      수량: "45px",
      가격: "100px",
      합포수량: "80px",
      택배비: "80px",
      기타: "100px",
      업체명: "90px",
      수취인명: "70px",
      주문자명: "70px",
      수취인: "70px",
      주문자: "70px",
      전화번호: "120px",
      이름: "80px",
    };
    return widthMap[header] || "100px"; // 기본값 100px
  };
  const [editingRow, setEditingRow] = useState<{
    id: number;
    rowData: any;
  } | null>(null);
  const [detailRow, setDetailRow] = useState<any>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [isCanceling, setIsCanceling] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // 템플릿 목록 가져오기
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const response = await fetch("/api/upload/template");
        const result = await response.json();
        if (result.success && result.templates.length > 0) {
          setTemplates(result.templates);
          setSelectedTemplate(result.templates[0].id);
        }
      } catch (error) {
        console.error("템플릿 조회 실패:", error);
      }
    };
    fetchTemplates();
  }, []);

  // 엑셀 다운로드
  const handleDownload = async () => {
    if (!selectedTemplate) {
      alert("템플릿을 선택해주세요.");
      return;
    }

    const rowIdsToDownload =
      selectedRows.size > 0 ? Array.from(selectedRows) : null;

    setIsDownloading(true);
    try {
      const response = await fetch("/api/upload/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          templateId: selectedTemplate,
          rowIds: rowIdsToDownload,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "다운로드 실패");
      }

      // 파일 다운로드
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const contentDisposition = response.headers.get("Content-Disposition");
      const fileName =
        contentDisposition?.split("filename=")[1]?.replace(/"/g, "") ||
        "download.xlsx";
      a.download = decodeURIComponent(fileName);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error("다운로드 실패:", error);
      alert(`다운로드 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setIsDownloading(false);
    }
  };

  // 전체 선택/해제
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(paginatedRows.map((row: any) => row.id));
      setSelectedRows(allIds);
    } else {
      setSelectedRows(new Set());
    }
  };

  // 개별 선택/해제
  const handleSelectRow = (rowId: number, checked: boolean) => {
    const newSelected = new Set(selectedRows);
    if (checked) {
      newSelected.add(rowId);
    } else {
      newSelected.delete(rowId);
    }
    setSelectedRows(newSelected);
  };

  // 선택된 항목 취소 처리
  const handleCancelSelected = async () => {
    if (selectedRows.size === 0) {
      alert("취소할 항목을 선택해주세요.");
      return;
    }

    if (!confirm(`선택한 ${selectedRows.size}개의 주문을 취소하시겠습니까?`)) {
      return;
    }

    setIsCanceling(true);
    try {
      const response = await fetch("/api/upload/cancel", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rowIds: Array.from(selectedRows),
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert(`${result.updatedCount}개의 주문이 취소되었습니다.`);
        setSelectedRows(new Set());
        if (onDataUpdate) {
          onDataUpdate();
        }
      } else {
        alert(`취소 실패: ${result.error}`);
      }
    } catch (error: any) {
      console.error("주문 취소 중 오류:", error);
      alert(`취소 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setIsCanceling(false);
    }
  };

  if (loading) {
    return (
      <>
        <div className="h-full mb-2 text-sm text-gray-600">
          <div className="h-4 w-32 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="mt-2 w-full h-[600px] overflow-x-auto text-black overflow-y-auto">
          <table
            className="border border-collapse border-gray-400 w-full min-w-[800px]"
            style={{tableLayout: "fixed"}}
          >
            <thead>
              <tr>
                <th
                  className="border border-[#cacaca] bg-gray-100 px-2 py-2 text-xs text-center"
                  style={{width: "40px"}}
                >
                  <div className="h-4 w-4 bg-gray-300 rounded animate-pulse mx-auto"></div>
                </th>
                {filteredHeaders.map((header, idx) => (
                  <th
                    key={idx}
                    className="border border-[#cacaca] bg-gray-100 px-2 py-2 text-xs text-center"
                    style={{width: getColumnWidth(header)}}
                  >
                    {header === "id"
                      ? "ID"
                      : header === "우편"
                      ? "우편번호"
                      : header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({length: 8}).map((_, rowIdx) => (
                <tr key={rowIdx} style={{height: "56px"}}>
                  <td
                    className="border px-2 border-gray-300 text-xs text-center align-middle"
                    style={{width: "40px", height: "56px"}}
                  >
                    <div className="h-4 w-4 bg-gray-200 rounded animate-pulse mx-auto"></div>
                  </td>
                  {filteredHeaders.map((header, colIdx) => (
                    <td
                      key={colIdx}
                      className="border px-2 border-gray-300 text-xs align-middle text-left"
                      style={{width: getColumnWidth(header), height: "56px"}}
                    >
                      <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  const isAllSelected =
    paginatedRows.length > 0 &&
    paginatedRows.every((row: any) => selectedRows.has(row.id));
  const orderStatusIdx = headers.findIndex((h) => h === "주문상태");

  // 적용된 필터 목록 생성 (업로드 일자는 맨 앞에)
  const activeFilters: Array<{type: string; label: string; value: string}> = [];

  // 업로드 일자는 항상 맨 앞에 추가
  if (uploadTimeFrom && uploadTimeTo) {
    activeFilters.push({
      type: "dateRange",
      label: "업로드 일자",
      value: `${uploadTimeFrom} ~ ${uploadTimeTo}`,
    });
  }

  // 나머지 필터들 추가
  if (selectedType) {
    activeFilters.push({type: "type", label: "내외주", value: selectedType});
  }
  if (selectedPostType) {
    activeFilters.push({
      type: "postType",
      label: "택배사",
      value: selectedPostType,
    });
  }
  if (selectedVendor) {
    activeFilters.push({
      type: "vendor",
      label: "업체명",
      value: selectedVendor,
    });
  }
  if (selectedOrderStatus && selectedOrderStatus !== "공급중") {
    activeFilters.push({
      type: "orderStatus",
      label: "주문상태",
      value: selectedOrderStatus,
    });
  }
  if (appliedSearchField && appliedSearchValue) {
    activeFilters.push({
      type: "search",
      label: appliedSearchField,
      value: appliedSearchValue,
    });
  }

  // 데이터가 없을 때 필터 표시와 함께 메시지 표시
  if (tableRows.length === 0) {
    return (
      <>
        <div className="h-full mb-2 text-sm text-gray-600 flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="py-1.5">
              총 {tableRows.length}건 (페이지 {currentPage} / {totalPages})
            </span>
            {activeFilters.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-gray-400">|</span>
                {activeFilters.map((filter, idx) => (
                  <span key={idx} className="flex items-center gap-1">
                    <button
                      onClick={() => onRemoveFilter?.(filter.type)}
                      className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 transition-colors flex items-center gap-1"
                      title="클릭하여 필터 제거"
                    >
                      <span>
                        {filter.label}: {filter.value}
                      </span>
                      <span className="text-blue-500">×</span>
                    </button>
                    {idx < activeFilters.length - 1 && (
                      <span className="text-gray-300">·</span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="text-center py-8 text-gray-500">
          저장된 데이터가 없습니다.
        </div>
      </>
    );
  }

  return (
    <>
      <div className="h-full mb-2 text-sm text-gray-600 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="py-1.5">
            총 {tableRows.length}건 (페이지 {currentPage} / {totalPages})
          </span>
          <ActiveFilters
            filters={activeFilters}
            onRemoveFilter={onRemoveFilter || (() => {})}
          />
        </div>
        <div className="flex items-center gap-2">
          {selectedRows.size > 0 && (
            <button
              onClick={handleCancelSelected}
              disabled={isCanceling}
              className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm 
              font-bold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCanceling ? "처리 중..." : `${selectedRows.size}건 취소`}
            </button>
          )}

          {templates.length > 0 && (
            <select
              value={selectedTemplate || ""}
              onChange={(e) => setSelectedTemplate(Number(e.target.value))}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm "
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name.replace(/\.(xlsx|xls)$/i, "")}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={handleDownload}
            disabled={isDownloading || !selectedTemplate}
            className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm
            font-bold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDownloading
              ? "다운로드 중..."
              : selectedRows.size > 0
              ? `${selectedRows.size}건 다운로드`
              : "전체 다운로드"}
          </button>
        </div>
      </div>
      <div className="mt-2 w-full h-[600px] overflow-x-auto text-black overflow-y-auto">
        <table
          className="border border-collapse border-gray-400 w-full min-w-[800px]"
          style={{tableLayout: "fixed"}}
        >
          <thead className="sticky -top-px">
            <tr>
              <th
                className="border border-[#cacaca] bg-gray-100 px-2 py-2 text-xs text-center"
                style={{width: "40px"}}
              >
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="cursor-pointer"
                />
              </th>
              {filteredHeaders.map((header, idx) => (
                <th
                  key={idx}
                  className="border border-[#cacaca] bg-gray-100 px-2 py-2 text-xs text-center"
                  style={{width: getColumnWidth(header)}}
                >
                  {header === "id"
                    ? "ID"
                    : header === "우편"
                    ? "우편번호"
                    : header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row: any, rowIdx: number) => {
              const mappingCodeIdx = headers.findIndex((h) => h === "매핑코드");
              const currentCode =
                mappingCodeIdx !== -1 ? row[headers[mappingCodeIdx]] : "";
              const orderStatus =
                orderStatusIdx !== -1 ? row[headers[orderStatusIdx]] : "";
              const isCancelled = orderStatus === "취소";
              const isSelected = selectedRows.has(row.id);

              return (
                <tr
                  key={`${row.id}-${rowIdx}`}
                  className={`${
                    isCancelled ? "bg-red-50" : isSelected ? "bg-gray-100" : ""
                  }`}
                  style={{height: "56px"}}
                >
                  <td
                    className="border px-2 border-gray-300 text-xs text-center align-middle cursor-pointer hover:bg-gray-50"
                    style={{width: "40px", height: "56px"}}
                    onClick={() => handleSelectRow(row.id, !isSelected)}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) =>
                        handleSelectRow(row.id, e.target.checked)
                      }
                      onClick={(e) => e.stopPropagation()}
                      className="cursor-pointer"
                    />
                  </td>
                  {filteredHeaders.map((header, colIdx) => {
                    const isMappingCode = header === "매핑코드";
                    const isId = header === "id";
                    const cellValue =
                      row[header] !== undefined && row[header] !== null
                        ? String(row[header])
                        : "";

                    return (
                      <td
                        key={colIdx}
                        className={`border px-2 border-gray-300 text-xs align-middle text-left ${
                          (isMappingCode && currentCode) || isId
                            ? "cursor-pointer hover:bg-blue-50"
                            : ""
                        }`}
                        style={{
                          width: getColumnWidth(header),
                          height: "56px",
                          lineHeight: "1.4",
                          wordBreak: "break-word",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        onClick={() => {
                          if (isMappingCode && currentCode) {
                            setEditingRow({
                              id: row.id,
                              rowData: row,
                            });
                          } else if (isId) {
                            setDetailRow(row);
                          }
                        }}
                        title={cellValue}
                      >
                        {(isMappingCode && currentCode) || isId ? (
                          <span className="text-blue-600 underline">
                            {cellValue}
                          </span>
                        ) : (
                          cellValue
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* 페이지네이션 */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={onPageChange}
      />

      {/* 매핑코드 수정 창 */}
      {editingRow && (
        <CodeEditWindow
          rowId={editingRow.id}
          currentRowData={editingRow.rowData}
          onCodeUpdate={(rowId, code) => {
            setEditingRow(null);
            if (onDataUpdate) {
              onDataUpdate();
            }
          }}
          onClose={() => setEditingRow(null)}
        />
      )}

      {/* 상세 데이터 창 */}
      {detailRow && (
        <RowDetailWindow
          rowData={detailRow}
          onClose={() => setDetailRow(null)}
        />
      )}
    </>
  );
}
