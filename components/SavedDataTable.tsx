"use client";

import {useState, useEffect, useMemo, useCallback, memo} from "react";
import {saveAs} from "file-saver";
import CodeEditWindow from "./CodeEditWindow";
import RowDetailWindow from "./RowDetailWindow";
import Pagination from "./Pagination";
import ActiveFilters from "./ActiveFilters";
import {getColumnWidth} from "@/utils/table";

interface SavedDataTableProps {
  loading: boolean;
  tableRows: any[];
  headers: string[];
  paginatedRows: any[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
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

const SavedDataTable = memo(function SavedDataTable({
  loading,
  tableRows,
  headers,
  paginatedRows,
  currentPage,
  totalPages,
  totalCount,
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
    "id",
    "file_name",
    "가격",
    "기타",
    "택배비",
    "합포수량",
    "upload_time",
  ];

  // 헤더 순서는 useUploadData에서 이미 정렬되어 전달되므로 그대로 사용 (메모이제이션)
  const filteredHeaders = useMemo(() => {
    return headers.filter((header) => !hiddenHeaders.includes(header));
  }, [headers]);

  const [editingRow, setEditingRow] = useState<{
    id: number;
    rowData: any;
  } | null>(null);
  const [detailRow, setDetailRow] = useState<any>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [isCanceling, setIsCanceling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
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

  // 엑셀 다운로드 (외주 발주서 포함)
  const handleDownload = async () => {
    if (!selectedTemplate) {
      alert("템플릿을 선택해주세요.");
      return;
    }

    let rowIdsToDownload =
      selectedRows.size > 0 ? Array.from(selectedRows) : null;

    setIsDownloading(true);
    try {
      // 현재 적용된 필터 정보를 다운로드 요청에 포함
      let filters = {
        type: selectedType || undefined,
        postType: selectedPostType || undefined,
        vendor: selectedVendor || undefined,
        orderStatus: selectedOrderStatus || undefined,
        searchField: appliedSearchField || undefined,
        searchValue: appliedSearchValue || undefined,
        uploadTimeFrom: uploadTimeFrom || undefined,
        uploadTimeTo: uploadTimeTo || undefined,
      };

      // 템플릿 확인
      const selectedTemplateObj = templates.find(
        (t) => t.id === selectedTemplate
      );
      // 한글 자모 분리 문제 해결을 위해 정규화 (macOS NFD -> NFC)
      const templateName = (selectedTemplateObj?.name || "")
        .normalize("NFC")
        .trim();

      // CJ외주 발주서인지 확인
      const isCJOutsource = templateName.includes("CJ외주");
      // 일반 외주 발주서인지 확인 (CJ외주가 아닌 "외주"가 포함된 경우)
      const isOutsource = templateName.includes("외주") && !isCJOutsource;
      // 내주 발주서인지 확인
      const isInhouse = templateName.includes("내주");

      // 내주 발주서인 경우: 내외주가 "내주"인 것만 필터링
      if (isInhouse) {
        if (rowIdsToDownload) {
          // 선택된 행 중 내외주가 "내주"인 것만 필터링
          const filteredRows = tableRows.filter(
            (row: any) =>
              rowIdsToDownload!.includes(row.id) &&
              row.내외주?.trim() === "내주" &&
              row.매핑코드 !== "106464"
          );
          rowIdsToDownload = filteredRows.map((row: any) => row.id);

          if (rowIdsToDownload.length === 0) {
            alert("선택된 행 중 내주 데이터가 없습니다.");
            setIsDownloading(false);
            return;
          }
        } else {
          // 필터에 내외주 "내주" 조건 추가
          filters = {
            ...filters,
            type: "내주",
          };
        }
      }

      // CJ외주 발주서인 경우: 매핑코드 106464만 필터링
      if (isCJOutsource) {
        // 선택된 행이 있으면 그 중에서 106464만, 없으면 필터에 매핑코드 조건 추가
        if (rowIdsToDownload) {
          // 선택된 행 중 매핑코드가 106464인 것만 필터링
          const filteredRows = tableRows.filter(
            (row: any) =>
              rowIdsToDownload!.includes(row.id) && row.매핑코드 === "106464"
          );
          rowIdsToDownload = filteredRows.map((row: any) => row.id);

          if (rowIdsToDownload.length === 0) {
            alert("선택된 행 중 매핑코드가 106464인 데이터가 없습니다.");
            setIsDownloading(false);
            return;
          }
        } else {
          // 필터에 매핑코드 106464 조건 추가
          filters = {
            ...filters,
            searchField: "매핑코드",
            searchValue: "106464",
          };
        }
      }

      // 외주/내주/일반 발주서에 따라 API 선택
      const apiUrl = isOutsource
        ? "/api/upload/download-outsource"
        : isInhouse
        ? "/api/upload/download-inhouse"
        : "/api/upload/download";

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          templateId: selectedTemplate,
          rowIds: rowIdsToDownload,
          filters: rowIdsToDownload ? undefined : filters, // 선택된 행이 있으면 필터 무시, 없으면 필터 적용
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "다운로드 실패");
      }

      // 파일 다운로드 (file-saver 사용)
      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition");
      let fileName = isOutsource ? "outsource.zip" : "download.xlsx";
      if (contentDisposition) {
        // filename* 우선
        const filenameStarMatch = contentDisposition.match(
          /filename\*\s*=\s*UTF-8''([^;]+)/i
        );
        if (filenameStarMatch?.[1]) {
          try {
            fileName = decodeURIComponent(filenameStarMatch[1]);
          } catch (_) {
            fileName = filenameStarMatch[1];
          }
        } else {
          const filenameMatch = contentDisposition.match(
            /filename\s*=\s*\"?([^\";]+)\"?/i
          );
          if (filenameMatch?.[1]) {
            fileName = filenameMatch[1];
          }
        }
      }
      saveAs(blob, fileName);
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

  // 선택된 항목 삭제 처리
  const handleDeleteSelected = async () => {
    if (selectedRows.size === 0) {
      alert("삭제할 항목을 선택해주세요.");
      return;
    }

    if (
      !confirm(
        `선택한 ${selectedRows.size}개의 데이터를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`
      )
    ) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch("/api/upload/delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rowIds: Array.from(selectedRows),
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert(`${result.deletedCount}개의 데이터가 삭제되었습니다.`);
        setSelectedRows(new Set());
        if (onDataUpdate) {
          onDataUpdate();
        }
      } else {
        alert(`삭제 실패: ${result.error}`);
      }
    } catch (error: any) {
      console.error("데이터 삭제 중 오류:", error);
      alert(`삭제 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setIsDeleting(false);
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

  // 로딩 중일 때
  if (loading) {
    return (
      <div className="text-center py-8 text-gray-500">
        <div className="flex items-center justify-center gap-2">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
          <span>데이터를 불러오는 중...</span>
        </div>
      </div>
    );
  }

  // 데이터가 없을 때 필터 표시와 함께 메시지 표시
  if (totalCount === 0) {
    return (
      <>
        <div className="h-full mb-2 text-sm text-gray-600 flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="py-1.5">
              총 {totalCount}건 (페이지 {currentPage} / {totalPages})
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
            총 {totalCount}건 (페이지 {currentPage} / {totalPages})
          </span>
          <ActiveFilters
            filters={activeFilters}
            onRemoveFilter={onRemoveFilter || (() => {})}
          />
        </div>
        <div className="flex items-center gap-2">
          {selectedRows.size > 0 && (
            <>
              <button
                onClick={handleCancelSelected}
                disabled={isCanceling || isDeleting}
                className="px-4 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm 
                font-bold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCanceling ? "처리 중..." : `${selectedRows.size}건 취소`}
              </button>
              <button
                onClick={handleDeleteSelected}
                disabled={isCanceling || isDeleting}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm 
                font-bold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? "삭제 중..." : `${selectedRows.size}건 삭제`}
              </button>
            </>
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
                    isCancelled ? "bg-red-50" : isSelected ? "bg-gray-50" : ""
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
});

export default SavedDataTable;
