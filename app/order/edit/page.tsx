"use client";

import {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
  Suspense,
} from "react";
import {useSearchParams} from "next/navigation";
import {useLoadingStore} from "@/stores/loadingStore";
import SavedDataTable from "@/components/SavedDataTable";
import DataFilters from "@/components/DataFilters";
import LoadingOverlay from "@/components/LoadingOverlay";
import CodeEditWindow from "@/components/CodeEditWindow";
import {useUploadData} from "@/hooks/useUploadData";
import {IoReloadCircle, IoCheckmarkCircle} from "react-icons/io5";

export default function Page() {
  return (
    <Suspense fallback={<div>로딩 중...</div>}>
      <OrderEditPageContent />
    </Suspense>
  );
}

function OrderEditPageContent() {
  // 로딩 상태
  const {isLoading, title, message, subMessage, startLoading, stopLoading} =
    useLoadingStore();

  // 저장된 데이터 관련 훅
  const {
    filters,
    selectedType,
    setSelectedType,
    selectedPostType,
    setSelectedPostType,
    selectedCompany,
    setSelectedCompany,
    selectedVendor,
    setSelectedVendor,
    selectedOrderStatus,
    setSelectedOrderStatus,
    searchField,
    setSearchField,
    searchValue,
    setSearchValue,
    uploadTimeFrom,
    setUploadTimeFrom,
    uploadTimeTo,
    setUploadTimeTo,
    itemsPerPage,
    setItemsPerPage,
    appliedType,
    appliedPostType,
    appliedCompany,
    appliedVendor,
    appliedOrderStatus,
    appliedSearchField,
    appliedSearchValue,
    appliedUploadTimeFrom,
    appliedUploadTimeTo,
    appliedItemsPerPage,
    setAppliedType,
    setAppliedPostType,
    setAppliedCompany,
    setAppliedVendor,
    setAppliedOrderStatus,
    setAppliedSearchField,
    setAppliedSearchValue,
    setAppliedUploadTimeFrom,
    setAppliedUploadTimeTo,
    applySearchFilter,
    resetFilters,
    loading,
    currentPage,
    setCurrentPage,
    totalPages,
    totalCount,
    headers,
    paginatedRows,
    tableRows,
    fetchSavedData,
  } = useUploadData();

  // URL 쿼리 파라미터 읽기
  const searchParams = useSearchParams();

  // URL 파라미터가 이미 처리되었는지 추적하는 ref
  const urlParamsProcessedRef = useRef(false);

  // URL 쿼리 파라미터에서 검색 필터 및 기간 필터 설정 (페이지 로드 시 한 번만 실행)
  useEffect(() => {
    // 이미 처리된 경우 스킵
    if (urlParamsProcessedRef.current) return;

    const searchFieldParam = searchParams.get("searchField");
    const searchValueParam = searchParams.get("searchValue");
    const uploadTimeFromParam = searchParams.get("uploadTimeFrom");
    const uploadTimeToParam = searchParams.get("uploadTimeTo");
    const orderStatusParam = searchParams.get("orderStatus");

    // URL 파라미터가 하나라도 있으면 처리
    const hasUrlParams =
      (searchFieldParam && searchValueParam) ||
      (uploadTimeFromParam && uploadTimeToParam) ||
      orderStatusParam !== null;

    if (!hasUrlParams) {
      // URL 파라미터가 없으면 처리 완료로 표시하고 종료
      urlParamsProcessedRef.current = true;
      return;
    }

    // 검색 필터 설정
    if (searchFieldParam && searchValueParam) {
      // 검색 필드와 값 설정
      setSearchField(searchFieldParam);
      setSearchValue(searchValueParam);

      // 검색 필터 적용
      if (setAppliedSearchField && setAppliedSearchValue) {
        setAppliedSearchField(searchFieldParam);
        setAppliedSearchValue(searchValueParam);
      }
    }

    // 기간 필터 설정
    if (uploadTimeFromParam && uploadTimeToParam) {
      setUploadTimeFrom(uploadTimeFromParam);
      setUploadTimeTo(uploadTimeToParam);

      if (setAppliedUploadTimeFrom && setAppliedUploadTimeTo) {
        setAppliedUploadTimeFrom(uploadTimeFromParam);
        setAppliedUploadTimeTo(uploadTimeToParam);
      }
    }

    // 주문상태 필터 설정 (URL 파라미터가 있으면 설정, 빈 문자열이면 "전체"로 설정)
    if (orderStatusParam !== null) {
      setSelectedOrderStatus(orderStatusParam);
      if (setAppliedOrderStatus) {
        setAppliedOrderStatus(orderStatusParam);
      }
    }

    // 처리 완료 표시
    urlParamsProcessedRef.current = true;

    // 약간의 지연 후 검색 필터 적용 (상태 업데이트 후)
    setTimeout(() => {
      applySearchFilter();
    }, 100);
  }, [
    searchParams,
    setSearchField,
    setSearchValue,
    setUploadTimeFrom,
    setUploadTimeTo,
    setSelectedOrderStatus,
    setAppliedSearchField,
    setAppliedSearchValue,
    setAppliedUploadTimeFrom,
    setAppliedUploadTimeTo,
    setAppliedOrderStatus,
    applySearchFilter,
  ]);

  // 필터 제거 함수
  const handleRemoveFilter = (filterType: string) => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(
      today.getMonth() + 1
    ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    switch (filterType) {
      case "type":
        setSelectedType("");
        if (setAppliedType) setAppliedType("");
        break;
      case "postType":
        setSelectedPostType("");
        if (setAppliedPostType) setAppliedPostType("");
        break;
      case "company":
        setSelectedCompany([]);
        if (setAppliedCompany) setAppliedCompany([]);
        break;
      case "vendor":
        setSelectedVendor([]);
        if (setAppliedVendor) setAppliedVendor([]);
        break;
      case "orderStatus":
        setSelectedOrderStatus("공급중");
        if (setAppliedOrderStatus) setAppliedOrderStatus("공급중");
        break;
      case "search":
        setSearchField("");
        setSearchValue("");
        setAppliedSearchField("");
        setAppliedSearchValue("");
        break;
      case "dateRange":
        setUploadTimeFrom(todayStr);
        setUploadTimeTo(todayStr);
        setAppliedUploadTimeFrom(todayStr);
        setAppliedUploadTimeTo(todayStr);
        break;
    }
  };

  // 선택된 행들 (체크박스)
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  // CodeEditWindow 상태
  const [codeEditWindow, setCodeEditWindow] = useState<{
    open: boolean;
    rowId: number;
    rowData: any;
    rowIdsToUpdate: number[]; // 업데이트할 행 ID 목록
  } | null>(null);

  // 주문 상태 변경 모달 상태
  const [orderStatusModal, setOrderStatusModal] = useState<{
    open: boolean;
    selectedRowIds: number[];
  } | null>(null);

  // 전체 선택/해제 핸들러
  const handleSelectAll = useCallback(() => {
    // 현재 페이지의 모든 행 ID 수집
    const allIds = new Set(paginatedRows.map((row: any) => row.id));

    // 현재 선택된 행이 모두 선택되어 있으면 해제, 아니면 전체 선택
    const isAllSelected =
      allIds.size > 0 && Array.from(allIds).every((id) => selectedRows.has(id));

    if (isAllSelected) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(allIds);
    }
  }, [selectedRows, paginatedRows, setSelectedRows]);

  // 매핑 수정 버튼 핸들러
  const handleMappingEdit = useCallback(async () => {
    if (selectedRows.size === 0) {
      // 선택된 행이 없으면 필터링된 전체 데이터의 ID를 API에서 가져오기
      try {
        startLoading(
          "데이터 조회 중...",
          "필터링된 데이터를 가져오고 있습니다."
        );

        const params = new URLSearchParams();
        if (appliedType) params.append("type", appliedType);
        if (appliedPostType) params.append("postType", appliedPostType);
        if (appliedCompany && appliedCompany.length > 0) {
          appliedCompany.forEach((c) => params.append("company", c));
        }
        if (appliedVendor && appliedVendor.length > 0) {
          appliedVendor.forEach((v) => params.append("vendor", v));
        }
        if (appliedOrderStatus)
          params.append("orderStatus", appliedOrderStatus);
        if (appliedSearchField && appliedSearchValue) {
          params.append("searchField", appliedSearchField);
          params.append("searchValue", appliedSearchValue);
        }
        if (appliedUploadTimeFrom)
          params.append("uploadTimeFrom", appliedUploadTimeFrom);
        if (appliedUploadTimeTo)
          params.append("uploadTimeTo", appliedUploadTimeTo);

        // 필터링된 전체 데이터를 한 번에 가져오기
        const limit = totalCount > 0 ? Math.min(totalCount, 10000) : 1000;
        params.append("page", "1");
        params.append("limit", limit.toString());

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

        const listResponse = await fetch(
          `/api/upload/list?${params.toString()}`,
          {
            headers,
          }
        );
        const listResult = await listResponse.json();

        if (
          listResult.success &&
          listResult.data &&
          listResult.data.length > 0
        ) {
          // 첫 번째 행의 데이터로 CodeEditWindow 열기
          const firstRow = listResult.data[0];
          const allRowIds = listResult.data
            .map((row: any) => row.id)
            .filter((id: any) => id != null);
          setCodeEditWindow({
            open: true,
            rowId: firstRow.id,
            rowData: {
              id: firstRow.id,
              ...(firstRow.row_data || {}),
            },
            rowIdsToUpdate: allRowIds,
          });
        } else {
          alert("수정할 데이터가 없습니다.");
        }
      } catch (error) {
        console.error("데이터 조회 실패:", error);
        alert("데이터 조회 중 오류가 발생했습니다.");
      } finally {
        stopLoading();
      }
    } else {
      // 선택된 첫 번째 행의 데이터로 CodeEditWindow 열기
      const firstSelectedId = Array.from(selectedRows)[0];
      const selectedRow = tableRows.find(
        (row: any) => row.id === firstSelectedId
      );
      if (selectedRow) {
        setCodeEditWindow({
          open: true,
          rowId: selectedRow.id,
          rowData: selectedRow,
          rowIdsToUpdate: Array.from(selectedRows),
        });
      }
    }
  }, [
    selectedRows,
    tableRows,
    appliedType,
    appliedPostType,
    appliedCompany,
    appliedVendor,
    appliedOrderStatus,
    appliedSearchField,
    appliedSearchValue,
    appliedUploadTimeFrom,
    appliedUploadTimeTo,
    totalCount,
    startLoading,
    stopLoading,
  ]);

  // CodeEditWindow에서 코드 업데이트 핸들러
  const handleCodeUpdate = useCallback(
    async (rowId: number, code: string, codeItem?: any) => {
      try {
        startLoading("매핑코드 수정 중...", "데이터를 업데이트하고 있습니다.");

        // company-id 헤더 포함
        const headers: HeadersInit = {
          "Content-Type": "application/json",
        };

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

        // CodeEditWindow에서 저장된 rowIdsToUpdate 사용
        if (!codeEditWindow || !codeEditWindow.rowIdsToUpdate) {
          alert("업데이트할 데이터가 없습니다.");
          return;
        }
        const rowIdsToUpdate = codeEditWindow.rowIdsToUpdate;

        // 일괄 업데이트 API 호출
        const response = await fetch("/api/upload/batch-update-code", {
          method: "PUT",
          headers,
          body: JSON.stringify({
            rowIds: rowIdsToUpdate,
            codeData: {
              code: codeItem.code,
              type: codeItem.type,
              postType: codeItem.postType,
              pkg: codeItem.pkg,
              price: codeItem.price,
              postFee: codeItem.postFee,
              etc: codeItem.etc,
              productId: codeItem.id,
            },
          }),
        });

        const result = await response.json();

        if (result.success) {
          alert(
            `매핑코드가 ${result.updatedCount}개 항목에 대해 업데이트되었습니다.`
          );
          setCodeEditWindow(null);
          setSelectedRows(new Set());
          fetchSavedData();
        } else {
          alert(`업데이트 실패: ${result.error}`);
        }
      } catch (error) {
        console.error("매핑코드 업데이트 중 오류:", error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : "업데이트 중 오류가 발생했습니다.";
        alert(`업데이트 중 오류가 발생했습니다: ${errorMessage}`);
      } finally {
        stopLoading();
      }
    },
    [codeEditWindow, fetchSavedData, startLoading, stopLoading]
  );

  // 주문 상태 변경 버튼 핸들러
  const handleOrderStatusChange = useCallback(() => {
    if (selectedRows.size === 0) {
      // 선택된 행이 없으면 필터링된 전체 데이터 사용
      const allRowIds = tableRows.map((row: any) => row.id);
      if (allRowIds.length === 0) {
        alert("변경할 데이터가 없습니다.");
        return;
      }
      setOrderStatusModal({
        open: true,
        selectedRowIds: allRowIds,
      });
    } else {
      setOrderStatusModal({
        open: true,
        selectedRowIds: Array.from(selectedRows),
      });
    }
  }, [selectedRows, tableRows]);

  // 주문 상태 변경 모달에서 상태 업데이트 핸들러
  const handleOrderStatusUpdate = useCallback(
    async (newStatus: string) => {
      if (!orderStatusModal) return;

      try {
        startLoading("주문 상태 변경 중...", "데이터를 업데이트하고 있습니다.");

        // company-id 헤더 포함
        const headers: HeadersInit = {
          "Content-Type": "application/json",
        };

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

        const response = await fetch("/api/upload/update-order-status", {
          method: "PUT",
          headers,
          body: JSON.stringify({
            rowIds: orderStatusModal.selectedRowIds,
            orderStatus: newStatus,
          }),
        });

        const result = await response.json();

        if (result.success) {
          alert(
            `주문 상태가 ${result.updatedCount}개 항목에 대해 업데이트되었습니다.`
          );
          setOrderStatusModal(null);
          setSelectedRows(new Set());
          fetchSavedData();
        } else {
          alert(`업데이트 실패: ${result.error}`);
        }
      } catch (error) {
        console.error("주문 상태 업데이트 중 오류:", error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : "업데이트 중 오류가 발생했습니다.";
        alert(`업데이트 중 오류가 발생했습니다: ${errorMessage}`);
      } finally {
        stopLoading();
      }
    },
    [orderStatusModal, fetchSavedData, startLoading, stopLoading]
  );

  return (
    <div className="w-full h-full flex flex-col items-start justify-start px-4">
      {/* 업로드 로딩 오버레이 */}
      <LoadingOverlay
        isOpen={isLoading}
        title={title}
        message={message}
        subMessage={subMessage}
      />

      <div className="w-full pb-80">
        {/* 저장된 데이터 테이블 */}
        <div className="w-full mt-6 bg-[#ffffff] rounded-lg px-8 py-6 shadow-md">
          <div className="mb-4 flex gap-4 items-center justify-between">
            <h2 className="text-xl font-bold">주문 수정</h2>

            <div className="flex gap-2 items-center mb-0">
              {/* 매핑 수정 버튼 */}
              <button
                className="px-5 py-2 bg-blue-600 text-white text-sm font-bold rounded hover:bg-blue-800 flex items-center gap-2"
                onClick={handleMappingEdit}
              >
                <IoCheckmarkCircle className="w-4 h-4" />
                매핑 수정
              </button>

              {/* 주문 상태 변경 버튼 */}
              <button
                className="px-5 py-2 bg-green-600 text-white text-sm font-bold rounded hover:bg-green-800 flex items-center gap-2"
                onClick={handleOrderStatusChange}
              >
                <IoCheckmarkCircle className="w-4 h-4" />
                주문 상태 변경
              </button>

              <button
                className="w-[60px] h-[36px] px-0 py-0 text-white text-sm rounded 
                bg-[#333333] hover:bg-[#7e7e7e] flex items-center justify-center"
                onClick={fetchSavedData}
                disabled={loading}
              >
                <IoReloadCircle
                  className={`w-[30px] h-[30px] rounded-full ${
                    loading ? "animate-spin" : ""
                  }`}
                />
              </button>
            </div>
          </div>

          <DataFilters
            filters={filters}
            selectedType={selectedType}
            selectedPostType={selectedPostType}
            selectedCompany={selectedCompany}
            selectedVendor={selectedVendor}
            searchField={searchField}
            searchValue={searchValue}
            uploadTimeFrom={uploadTimeFrom}
            uploadTimeTo={uploadTimeTo}
            itemsPerPage={itemsPerPage}
            onTypeChange={setSelectedType}
            onPostTypeChange={setSelectedPostType}
            onCompanyChange={setSelectedCompany}
            onVendorChange={setSelectedVendor}
            selectedOrderStatus={selectedOrderStatus}
            onOrderStatusChange={setSelectedOrderStatus}
            onSearchFieldChange={setSearchField}
            onSearchValueChange={setSearchValue}
            onUploadTimeFromChange={setUploadTimeFrom}
            onUploadTimeToChange={setUploadTimeTo}
            onItemsPerPageChange={setItemsPerPage}
            onApplySearchFilter={applySearchFilter}
            onResetFilters={resetFilters}
          />

          <SavedDataTable
            loading={loading}
            tableRows={tableRows}
            headers={headers}
            paginatedRows={paginatedRows}
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={totalCount}
            onPageChange={setCurrentPage}
            onDataUpdate={fetchSavedData}
            selectedType={appliedType}
            selectedPostType={appliedPostType}
            selectedCompany={appliedCompany}
            selectedVendor={appliedVendor}
            selectedOrderStatus={appliedOrderStatus}
            appliedType={appliedType}
            appliedPostType={appliedPostType}
            appliedCompany={appliedCompany}
            appliedVendor={appliedVendor}
            appliedOrderStatus={appliedOrderStatus}
            appliedSearchField={appliedSearchField}
            appliedSearchValue={appliedSearchValue}
            appliedUploadTimeFrom={appliedUploadTimeFrom}
            appliedUploadTimeTo={appliedUploadTimeTo}
            uploadTimeFrom={appliedUploadTimeFrom}
            uploadTimeTo={appliedUploadTimeTo}
            onRemoveFilter={handleRemoveFilter}
            isDeliveryInputMode={false}
            // 체크박스 선택 상태 전달
            selectedRows={selectedRows}
            onSelectedRowsChange={setSelectedRows}
            onSelectAll={handleSelectAll}
          />
        </div>
      </div>

      {/* CodeEditWindow */}
      {codeEditWindow && (
        <CodeEditWindow
          rowId={codeEditWindow.rowId}
          currentRowData={codeEditWindow.rowData}
          onCodeUpdate={handleCodeUpdate}
          onClose={() => setCodeEditWindow(null)}
          skipApiCall={false}
        />
      )}

      {/* 주문 상태 변경 모달 */}
      {orderStatusModal && (
        <OrderStatusModal
          open={orderStatusModal.open}
          selectedCount={orderStatusModal.selectedRowIds.length}
          onClose={() => setOrderStatusModal(null)}
          onUpdate={handleOrderStatusUpdate}
        />
      )}
    </div>
  );
}

// 주문 상태 변경 모달 컴포넌트
function OrderStatusModal({
  open,
  selectedCount,
  onClose,
  onUpdate,
}: {
  open: boolean;
  selectedCount: number;
  onClose: () => void;
  onUpdate: (status: string) => void;
}) {
  const [selectedStatus, setSelectedStatus] = useState<string>("공급중");

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-[#00000084] bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[500px] p-6">
        {/* <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">주문 상태 변경</h2>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            닫기
          </button>
        </div> */}

        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-4">
            선택된 항목: {selectedCount}개
          </p>

          <label className="block text-sm font-medium text-gray-700 mb-2">
            주문 상태:
          </label>
          <select
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="공급중">공급중</option>
            <option value="발주서 다운">발주서 다운</option>
            <option value="사방넷 다운">사방넷 다운</option>
            <option value="배송중">배송중</option>
            <option value="취소">취소</option>
          </select>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            취소
          </button>
          <button
            onClick={() => onUpdate(selectedStatus)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
}
