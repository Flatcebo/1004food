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
  // 운송장 입력 모드
  isDeliveryInputMode?: boolean;
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
  isDeliveryInputMode = false,
}: SavedDataTableProps) {
  // 숨길 헤더 목록 (기본 숨김 헤더 + 주문자 관련 단독 컬럼)
  const hiddenHeaders = useMemo(() => {
    const baseHiddenHeaders = [
      "id",
      "file_name",
      "가격",
      "기타",
      "택배비",
      "합포수량",
      "upload_time",
      "주문자명", // 수취인명에 합쳐져서 표시되므로 단독 컬럼은 숨김
      "주문자 전화번호", // 수취인 전화번호에 합쳐져서 표시되므로 단독 컬럼은 숨김
      "주문번호", // 내부코드에 합쳐져서 표시되므로 단독 컬럼은 숨김
      "쇼핑몰명", // 업체명에 합쳐져서 표시되므로 단독 컬럼은 숨김
    ];

    // 운송장 입력 모드일 때는 매핑코드와 운송장번호만 숨김 (배송메시지는 운송장입력으로 변경됨)
    if (isDeliveryInputMode) {
      baseHiddenHeaders.push("매핑코드", "운송장번호");
    }

    return baseHiddenHeaders;
  }, [isDeliveryInputMode]);

  // 헤더 순서는 useUploadData에서 이미 정렬되어 전달되므로 그대로 사용 (메모이제이션)
  const filteredHeaders = useMemo(() => {
    let filtered = headers.filter((header) => !hiddenHeaders.includes(header));

    // 운송장 입력 모드일 때는 배송메시지를 운송장입력으로 변경하거나, 없으면 추가
    if (isDeliveryInputMode) {
      const hasDeliveryMessage = filtered.includes("배송메시지");
      if (hasDeliveryMessage) {
        filtered = filtered.map((header) =>
          header === "배송메시지" ? "운송장입력" : header
        );
      } else {
        // 배송메시지가 없으면 마지막에 운송장입력 추가
        filtered = [...filtered, "운송장입력"];
      }
    }

    return filtered;
  }, [headers, hiddenHeaders, isDeliveryInputMode]);

  // 헤더 표시명 변경 함수
  const getHeaderDisplayName = (header: string) => {
    switch (header) {
      case "수취인명":
        return "수취인명\n주문자명";
      case "수취인 전화번호":
        return "수취인 전화번호\n주문자 전화번호";
      case "내부코드":
        return "내부코드\n주문번호";
      case "업체명":
        return "업체명\n쇼핑몰명";
      case "우편":
        return "우편번호";
      case "id":
        return "ID";
      default:
        return header;
    }
  };

  // 날짜 포맷 함수 (년월일 / 시분초로 분리)
  const formatDateTime = (dateString: string) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      const dateOnly = date.toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const timeOnly = date.toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      return `${dateOnly}\n${timeOnly}`;
    } catch (error) {
      return dateString;
    }
  };

  // 합쳐진 셀 값 생성 함수
  const getCombinedCellValue = (row: any, header: string) => {
    switch (header) {
      case "수취인명":
        const receiverName = row["수취인명"] || "";
        const ordererName = row["주문자명"] || "";
        if (receiverName && ordererName && receiverName !== ordererName) {
          return `${receiverName}\n${ordererName}`;
        }
        return receiverName || ordererName;

      case "수취인 전화번호":
        const receiverPhone = row["수취인 전화번호"] || "";
        const ordererPhone = row["주문자 전화번호"] || "";
        if (receiverPhone && ordererPhone && receiverPhone !== ordererPhone) {
          return `${receiverPhone}\n${ordererPhone}`;
        }
        return receiverPhone || ordererPhone;

      case "내부코드":
        const internalCode = row["내부코드"] || "";
        const orderCode = row["주문번호"] || "";
        if (internalCode && orderCode) {
          return `${internalCode}\n${orderCode}`;
        }
        return internalCode || orderCode;

      case "업체명":
        const vendorName = row["업체명"] || "";
        const shopName = row["쇼핑몰명"] || "";
        if (vendorName && shopName && vendorName !== shopName) {
          return `${vendorName}\n${shopName}`;
        }
        return vendorName || shopName;

      case "주문자명":
        // 수취인명 컬럼에서 이미 처리되므로 이 컬럼은 숨겨짐
        return row["주문자명"] !== undefined && row["주문자명"] !== null
          ? String(row["주문자명"])
          : "";

      case "주문자 전화번호":
        // 수취인 전화번호 컬럼에서 이미 처리되므로 이 컬럼은 숨겨짐
        return row["주문자 전화번호"] !== undefined &&
          row["주문자 전화번호"] !== null
          ? String(row["주문자 전화번호"])
          : "";

      case "주문번호":
        // 내부코드 컬럼에서 이미 처리되므로 이 컬럼은 숨겨짐
        return row["주문번호"] !== undefined && row["주문번호"] !== null
          ? String(row["주문번호"])
          : "";

      case "쇼핑몰명":
        // 업체명 컬럼에서 이미 처리되므로 이 컬럼은 숨겨짐
        return row["쇼핑몰명"] !== undefined && row["쇼핑몰명"] !== null
          ? String(row["쇼핑몰명"])
          : "";

      case "등록일":
        return formatDateTime(row["등록일"]);

      case "운송장입력":
        // 운송장 입력 칼럼은 특별한 UI로 렌더링되므로 빈 문자열 반환
        return "";

      default:
        return row[header] !== undefined && row[header] !== null
          ? String(row[header])
          : "";
    }
  };

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
  const [deliveryData, setDeliveryData] = useState<{
    [key: number]: {carrier: string; trackingNumber: string};
  }>({});
  const [isConfirmingDelivery, setIsConfirmingDelivery] = useState(false);

  // 테이블 데이터 로드 시 deliveryData 초기화
  useEffect(() => {
    if (tableRows.length > 0) {
      const initialDeliveryData: {
        [key: number]: {carrier: string; trackingNumber: string};
      } = {};
      tableRows.forEach((row: any) => {
        if (row["택배사"] || row["운송장번호"]) {
          initialDeliveryData[row.id] = {
            carrier: row["택배사"] || "",
            trackingNumber: row["운송장번호"] || "",
          };
        }
      });
      setDeliveryData(initialDeliveryData);
    }
  }, [tableRows]);

  // 템플릿 목록 가져오기
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const response = await fetch("/api/upload/template");
        const result = await response.json();
        if (result.success && result.templates.length > 0) {
          const sortedTemplates = result.templates.sort((a: any, b: any) => {
            return a.id - b.id;
          });
          setTemplates(sortedTemplates);
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
      // 사방넷 등록 양식인지 확인
      const isSabangnet = templateName.includes("사방넷");

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

      // 템플릿 종류에 따라 API 선택
      const apiUrl = isOutsource
        ? "/api/upload/download-outsource"
        : isInhouse
        ? "/api/upload/download-inhouse"
        : isSabangnet
        ? "/api/upload/download-sabangnet"
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

  // 운송장 입력 확정
  const handleConfirmDelivery = async () => {
    const selectedIds = Array.from(selectedRows);
    const targetIds =
      selectedIds.length > 0
        ? selectedIds
        : tableRows.map((row: any) => row.id);

    if (targetIds.length === 0) {
      alert("확정할 데이터가 없습니다.");
      return;
    }

    setIsConfirmingDelivery(true);
    try {
      // API 호출로 운송장 정보 저장
      const response = await fetch("/api/upload/update-delivery", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deliveryData: targetIds.map((id) => ({
            id,
            carrier: deliveryData[id]?.carrier || "",
            trackingNumber: deliveryData[id]?.trackingNumber || "",
            orderStatus:
              deliveryData[id]?.carrier &&
              deliveryData[id]?.trackingNumber?.trim()
                ? "운송장 완료"
                : "공급중", // 입력되지 않은 항목은 공급중 상태 유지
          })),
        }),
      });

      const result = await response.json();
      if (result.success) {
        alert(`${targetIds.length}건의 운송장 정보가 저장되었습니다.`);
        // 데이터 새로고침
        onDataUpdate?.();
        // 선택 초기화
        setSelectedRows(new Set());
        setDeliveryData({});
      } else {
        throw new Error(result.error || "저장 실패");
      }
    } catch (error: any) {
      console.error("운송장 정보 저장 실패:", error);
      alert(`저장 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setIsConfirmingDelivery(false);
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
  if (selectedOrderStatus) {
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

          {isDeliveryInputMode ? (
            <button
              onClick={handleConfirmDelivery}
              disabled={isConfirmingDelivery}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm
              font-bold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isConfirmingDelivery
                ? "저장 중..."
                : selectedRows.size > 0
                ? `${selectedRows.size}건 확정`
                : "전체 확정"}
            </button>
          ) : (
            <>
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
            </>
          )}
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
              {filteredHeaders.map((header, idx) => {
                const displayName = getHeaderDisplayName(header);
                const isMultiLineHeader = displayName.includes("\n");

                return (
                  <th
                    key={idx}
                    className="border border-[#cacaca] bg-gray-100 px-2 py-2 text-xs text-center"
                    style={{
                      width:
                        header === "운송장입력" && isDeliveryInputMode
                          ? "200px"
                          : getColumnWidth(header),
                      whiteSpace: isMultiLineHeader ? "pre-line" : "nowrap",
                      lineHeight: "1.2",
                    }}
                  >
                    {isMultiLineHeader ? (
                      <span>
                        {displayName
                          .split("\n")
                          .map((line: string, lineIdx: number) => (
                            <span key={lineIdx}>
                              {lineIdx === 0 ? (
                                line
                              ) : (
                                <span className="text-gray-500 font-medium">
                                  {line}
                                </span>
                              )}
                              {lineIdx < displayName.split("\n").length - 1 && (
                                <br />
                              )}
                            </span>
                          ))}
                      </span>
                    ) : (
                      displayName
                    )}
                  </th>
                );
              })}
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
                    const isRegistrationDate = header === "등록일";
                    const isDeliveryInput = header === "운송장입력";
                    const cellValue = getCombinedCellValue(row, header);
                    const isMultiLine = cellValue.includes("\n");

                    // 합쳐진 셀인지 확인
                    const isCombinedCell = (() => {
                      switch (header) {
                        case "수취인명":
                          const receiverName = row["수취인명"] || "";
                          const ordererName = row["주문자명"] || "";
                          return (
                            receiverName &&
                            ordererName &&
                            receiverName !== ordererName
                          );
                        case "수취인 전화번호":
                          const receiverPhone = row["수취인 전화번호"] || "";
                          const ordererPhone = row["주문자 전화번호"] || "";
                          return (
                            receiverPhone &&
                            ordererPhone &&
                            receiverPhone !== ordererPhone
                          );
                        case "내부코드":
                          const internalCode = row["내부코드"] || "";
                          const orderCode = row["주문번호"] || "";
                          return internalCode && orderCode;
                        case "업체명":
                          const vendorName = row["업체명"] || "";
                          const shopName = row["쇼핑몰명"] || "";
                          return (
                            vendorName && shopName && vendorName !== shopName
                          );
                        default:
                          return false;
                      }
                    })();

                    return (
                      <td
                        key={colIdx}
                        className={`border px-2 border-gray-300 text-xs align-middle ${
                          isRegistrationDate ? "text-center" : "text-left"
                        } ${
                          (isMappingCode && currentCode) ||
                          isId ||
                          isDeliveryInput
                            ? "cursor-pointer hover:bg-blue-50"
                            : ""
                        }`}
                        style={{
                          width:
                            header === "운송장입력" && isDeliveryInputMode
                              ? "200px"
                              : getColumnWidth(header),
                          height: "56px",
                          lineHeight: "1.4",
                          wordBreak: "break-word",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: isMultiLine ? "pre-line" : "nowrap",
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
                        title={
                          !isDeliveryInput
                            ? cellValue.replace(/\n/g, " / ")
                            : ""
                        }
                      >
                        {isDeliveryInput ? (
                          <div className="flex flex-col gap-1">
                            <select
                              className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded"
                              value={
                                deliveryData[row.id]?.carrier ||
                                row["택배사"] ||
                                ""
                              }
                              onChange={(e) => {
                                setDeliveryData((prev) => ({
                                  ...prev,
                                  [row.id]: {
                                    carrier: e.target.value,
                                    trackingNumber:
                                      prev[row.id]?.trackingNumber || "",
                                  },
                                }));
                              }}
                            >
                              <option value="">택배사 선택</option>
                              <option value="CJ택배">CJ택배</option>
                              <option value="우체국택배">우체국택배</option>
                              <option value="로젠택배">로젠택배</option>
                              <option value="롯데택배">롯데택배</option>
                              <option value="한진택배">한진택배</option>
                              <option value="천일택배">천일택배</option>
                            </select>
                            <input
                              type="text"
                              placeholder="운송장번호"
                              className="w-full px-2 py-0.5 text-xs border border-gray-300 rounded"
                              value={deliveryData[row.id]?.trackingNumber || ""}
                              onChange={(e) => {
                                setDeliveryData((prev) => ({
                                  ...prev,
                                  [row.id]: {
                                    carrier:
                                      prev[row.id]?.carrier ||
                                      row["택배사"] ||
                                      "",
                                    trackingNumber: e.target.value,
                                  },
                                }));
                              }}
                            />
                          </div>
                        ) : (isMappingCode && currentCode) || isId ? (
                          <span className="text-blue-600 underline">
                            {cellValue}
                          </span>
                        ) : isCombinedCell && isMultiLine ? (
                          <span>
                            {cellValue
                              .split("\n")
                              .map((line: string, lineIdx: number) => (
                                <span key={lineIdx}>
                                  {lineIdx === 0 ? (
                                    line
                                  ) : (
                                    <span className="text-gray-500 font-medium">
                                      {line}
                                    </span>
                                  )}
                                  {lineIdx <
                                    cellValue.split("\n").length - 1 && <br />}
                                </span>
                              ))}
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
