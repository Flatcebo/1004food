"use client";

import {useState, useEffect, useCallback, useMemo} from "react";
import {saveAs} from "file-saver";
import CodeEditWindow from "./CodeEditWindow";
import RowDetailWindow from "./RowDetailWindow";
import Pagination from "./Pagination";
import {getColumnWidth} from "@/utils/table";
import {getAuthHeaders} from "@/utils/api";
import {
  mapRowToTemplateFormat,
  getTemplateHeaderNames,
} from "@/utils/purchaseTemplateMapping";
import {mapDataToTemplate} from "@/utils/excelDataMapping";

interface PurchaseStats {
  id: number;
  name: string;
  submitType: string[];
  email: string | null;
  kakaotalk: string | null;
  totalOrders: number;
  orderedCount: number;
  unorderedCount: number;
}

interface OrderData {
  id: number;
  rowData: any;
  isOrdered: boolean;
  purchaseId: number | null;
  orderBatchId: number | null;
  batchNumber: number | null;
  batchDate: string | null;
  createdAt: string;
  uploadDate: string;
  productId: number;
  productCode: string;
  productName: string;
  salePrice: number;
  sabangName: string;
}

interface BatchInfo {
  batchNumber: number;
  batchDate: string;
  batchCreatedAt: string | null;
  orderIds: number[];
}

interface PurchaseOrdersModalProps {
  purchase: PurchaseStats;
  startDate: string;
  endDate: string;
  onClose: () => void;
  onDataUpdate?: () => void;
}

export default function PurchaseOrdersModal({
  purchase,
  startDate,
  endDate,
  onClose,
  onDataUpdate,
}: PurchaseOrdersModalProps) {
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [batches, setBatches] = useState<BatchInfo[]>([]);
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(
    new Set(),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [orderFilter, setOrderFilter] = useState<
    "all" | "ordered" | "unordered"
  >("unordered");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [editingRow, setEditingRow] = useState<{
    id: number;
    rowData: any;
  } | null>(null);
  const [detailRow, setDetailRow] = useState<any>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showTemplateView, setShowTemplateView] = useState(false);
  const [purchaseDetail, setPurchaseDetail] = useState<any>(null);

  const itemsPerPage = 50;

  // 주문 데이터 조회
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        purchaseId: purchase.id.toString(),
        startDate,
        endDate,
        orderFilter,
      });

      const response = await fetch(
        `/api/purchase-orders/orders?${params.toString()}`,
        {
          headers: getAuthHeaders(),
        },
      );

      const result = await response.json();
      if (result.success) {
        // 중복 제거 (id 기준)
        const uniqueOrders = (result.data || []).reduce(
          (acc: OrderData[], order: OrderData) => {
            if (!acc.find((o) => o.id === order.id)) {
              acc.push(order);
            }
            return acc;
          },
          [],
        );
        setOrders(uniqueOrders);
        setBatches(result.batches || []);
        setPurchaseDetail(result.purchase);
      } else {
        setError(result.error || "조회에 실패했습니다.");
      }
    } catch (err: any) {
      setError(err.message || "조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [purchase.id, startDate, endDate, orderFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // 필터 변경 시 체크박스 선택 해제
  useEffect(() => {
    setSelectedRows(new Set());
  }, [orderFilter]);

  // 페이지네이션
  const totalPages = Math.ceil(orders.length / itemsPerPage);
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return orders.slice(start, start + itemsPerPage);
  }, [orders, currentPage, itemsPerPage]);

  // 헤더 목록
  const headers = useMemo(() => {
    return [
      "내부코드/주문번호",
      "매핑코드",
      "상품명",
      "수량",
      "수취인명",
      "수취인 전화번호",
      "주소",
      "주문상태",
      "발주여부",
    ];
  }, []);

  // 숫자 포맷팅
  const formatNumber = (num: number | string | null | undefined): string => {
    if (num === null || num === undefined) return "-";
    const numValue = typeof num === "string" ? parseFloat(num) : num;
    if (isNaN(numValue)) return "-";
    return new Intl.NumberFormat("ko-KR").format(numValue);
  };

  // 한국 시간으로 날짜 포맷팅 (서버에서 이미 한국 시간으로 변환되어 옴)
  const formatBatchDateTime = (dateString: string | null): string => {
    if (!dateString) return "";

    // 서버에서 이미 "YYYY-MM-DD HH:mm:ss" 형식으로 변환되어 옴
    // 그대로 반환하거나, 필요시 포맷팅만 수행
    return dateString;
  };

  // 셀 값 가져오기
  const getCellValue = useCallback(
    (order: OrderData, header: string): string => {
      const rowData = order.rowData || {};
      switch (header) {
        case "내부코드/주문번호":
          const internalCode = rowData["내부코드"] || "-";
          const orderNumber = rowData["주문번호"] || "-";
          if (internalCode !== "-" && orderNumber !== "-") {
            return `${internalCode} / ${orderNumber}`;
          } else if (internalCode !== "-") {
            return internalCode;
          } else if (orderNumber !== "-") {
            return orderNumber;
          }
          return "-";
        case "상품명":
          return rowData["상품명"] || order.productName || "-";
        case "매핑코드":
          return rowData["매핑코드"] || order.productCode || "-";
        case "수취인명":
          return rowData["수취인명"] || "-";
        case "수취인 전화번호":
          return rowData["수취인 전화번호"] || "-";
        case "주소":
          return rowData["주소"] || "-";
        case "수량":
          return rowData["수량"] || "1";
        case "주문상태":
          return rowData["주문상태"] || "-";
        case "발주여부":
          return order.isOrdered ? "발주됨" : "미발주";
        default:
          return rowData[header] || "-";
      }
    },
    [],
  );

  // 체크박스 전체 선택/해제
  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedRows(new Set(paginatedOrders.map((o) => o.id)));
      } else {
        setSelectedRows(new Set());
      }
    },
    [paginatedOrders],
  );

  // 개별 선택
  const handleSelectRow = useCallback((id: number, checked: boolean) => {
    setSelectedRows((prev) => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(id);
      } else {
        newSet.delete(id);
      }
      return newSet;
    });
  }, []);

  // 다운로드
  const handleDownload = useCallback(async () => {
    const orderIds =
      selectedRows.size > 0
        ? Array.from(selectedRows)
        : orders.map((o) => o.id);

    if (orderIds.length === 0) {
      alert("다운로드할 데이터가 없습니다.");
      return;
    }

    setIsDownloading(true);

    try {
      const response = await fetch("/api/purchase-orders/download", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          purchaseId: purchase.id,
          orderIds,
          startDate,
          endDate,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "다운로드 실패");
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition");
      let fileName = `${purchase.name}_발주서.xlsx`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename\*=UTF-8''(.+)/);
        if (match) {
          fileName = decodeURIComponent(match[1]);
        }
      }

      saveAs(blob, fileName);
      setSelectedRows(new Set());
      // 다운로드 후 주문 목록 새로고침 (발주 상태 업데이트 반영)
      await fetchOrders();
      // 부모 컴포넌트 데이터도 새로고침
      if (onDataUpdate) {
        onDataUpdate();
      }
    } catch (err: any) {
      alert(`다운로드 오류: ${err.message}`);
    } finally {
      setIsDownloading(false);
    }
  }, [
    selectedRows,
    orders,
    purchase.id,
    purchase.name,
    startDate,
    endDate,
    fetchOrders,
    onDataUpdate,
  ]);

  // 카카오톡 전송
  const handleSendKakao = useCallback(async () => {
    if (!purchase.kakaotalk) {
      alert("카카오톡 정보가 등록되지 않았습니다.");
      return;
    }

    const orderIds =
      selectedRows.size > 0
        ? Array.from(selectedRows)
        : orders.filter((o) => !o.isOrdered).map((o) => o.id);

    if (orderIds.length === 0) {
      alert("전송할 미발주 주문이 없습니다.");
      return;
    }

    if (
      !confirm(`${orderIds.length}건의 주문을 카카오톡으로 전송하시겠습니까?`)
    ) {
      return;
    }

    setIsSending(true);

    try {
      const response = await fetch("/api/purchase-orders/send", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          purchaseId: purchase.id,
          orderIds,
          sendType: "kakaotalk",
          startDate,
          endDate,
        }),
      });

      const result = await response.json();
      if (result.success) {
        alert(`카카오톡 전송 완료: ${result.message}`);
        await fetchOrders();
        // 부모 컴포넌트 데이터도 새로고침
        if (onDataUpdate) {
          onDataUpdate();
        }
      } else {
        alert(`전송 실패: ${result.error}`);
      }
    } catch (err: any) {
      alert(`전송 오류: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  }, [
    purchase.id,
    purchase.kakaotalk,
    selectedRows,
    orders,
    startDate,
    endDate,
    fetchOrders,
    onDataUpdate,
  ]);

  // 이메일 전송
  const handleSendEmail = useCallback(async () => {
    if (!purchase.email) {
      alert("이메일 정보가 등록되지 않았습니다.");
      return;
    }

    const orderIds =
      selectedRows.size > 0
        ? Array.from(selectedRows)
        : orders.filter((o) => !o.isOrdered).map((o) => o.id);

    if (orderIds.length === 0) {
      alert("전송할 미발주 주문이 없습니다.");
      return;
    }

    if (!confirm(`${orderIds.length}건의 주문을 이메일로 전송하시겠습니까?`)) {
      return;
    }

    setIsSending(true);

    try {
      const response = await fetch("/api/purchase-orders/send", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          purchaseId: purchase.id,
          orderIds,
          sendType: "email",
          startDate,
          endDate,
        }),
      });

      const result = await response.json();
      if (result.success) {
        alert(`이메일 전송 완료: ${result.message}`);
        await fetchOrders();
        // 부모 컴포넌트 데이터도 새로고침
        if (onDataUpdate) {
          onDataUpdate();
        }
      } else {
        alert(`전송 실패: ${result.error}`);
      }
    } catch (err: any) {
      alert(`전송 오류: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  }, [
    purchase.id,
    purchase.email,
    selectedRows,
    orders,
    startDate,
    endDate,
    fetchOrders,
    onDataUpdate,
  ]);

  // 선택된 항목 취소 처리
  const handleCancelSelected = useCallback(async () => {
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
        headers: getAuthHeaders(),
        body: JSON.stringify({
          rowIds: Array.from(selectedRows),
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert(`${result.updatedCount}개의 주문이 취소되었습니다.`);
        setSelectedRows(new Set());
        await fetchOrders();
        // 부모 컴포넌트 데이터도 새로고침
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
  }, [selectedRows, fetchOrders, onDataUpdate]);

  // 선택된 항목 삭제 처리
  const handleDeleteSelected = useCallback(async () => {
    if (selectedRows.size === 0) {
      alert("삭제할 항목을 선택해주세요.");
      return;
    }

    if (
      !confirm(
        `선택한 ${selectedRows.size}개의 데이터를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`,
      )
    ) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch("/api/upload/delete", {
        method: "DELETE",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          rowIds: Array.from(selectedRows),
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert(`${result.deletedCount}개의 데이터가 삭제되었습니다.`);
        setSelectedRows(new Set());
        await fetchOrders();
        // 부모 컴포넌트 데이터도 새로고침
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
  }, [selectedRows, fetchOrders, onDataUpdate]);

  // 매핑코드 셀 클릭
  const handleMappingCodeClick = useCallback((order: OrderData) => {
    setEditingRow({
      id: order.id,
      rowData: {
        ...order.rowData,
        id: order.id,
        productId: order.productId,
      },
    });
  }, []);

  // 내부코드 셀 클릭
  const handleInternalCodeClick = useCallback((order: OrderData) => {
    setDetailRow({
      ...order.rowData,
      id: order.id,
      productId: order.productId,
    });
  }, []);

  // 코드 업데이트 후 새로고침
  const handleCodeUpdate = useCallback(() => {
    setEditingRow(null);
    fetchOrders();
  }, [fetchOrders]);

  // 발주여부 상태에 따른 스타일
  const getOrderStatusStyle = useCallback((isOrdered: boolean) => {
    return isOrdered
      ? "text-green-600 bg-green-50"
      : "text-red-600 bg-red-50 font-semibold";
  }, []);

  // 아코디언 토글
  const toggleBatch = useCallback((batchKey: string) => {
    setExpandedBatches((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(batchKey)) {
        newSet.delete(batchKey);
      } else {
        newSet.add(batchKey);
      }
      return newSet;
    });
  }, []);

  // 발주된 주문만 필터링 (isOrdered === true)
  const orderedOrders = useMemo(() => {
    return orders.filter((o) => o.isOrdered === true);
  }, [orders]);

  // 차수별로 그룹화된 주문 (발주된 주문만)
  const orderedOrdersByBatch = useMemo(() => {
    const grouped: {[key: string]: {batch: BatchInfo; orders: OrderData[]}} =
      {};

    batches.forEach((batch) => {
      const batchKey = `${batch.batchDate}_${batch.batchNumber}`;
      // batch.orderIds에 포함된 주문들을 찾기
      const batchOrders = orderedOrders.filter((o) =>
        batch.orderIds.includes(o.id),
      );
      if (batchOrders.length > 0) {
        grouped[batchKey] = {batch, orders: batchOrders};
      }
    });

    // 디버깅 로그
    console.log("[PurchaseOrdersModal] batches:", batches);
    console.log("[PurchaseOrdersModal] orderedOrders:", orderedOrders.length);
    console.log(
      "[PurchaseOrdersModal] orderedOrdersByBatch:",
      Object.keys(grouped).length,
    );

    return grouped;
  }, [batches, orderedOrders]);

  // 미발주 주문 (차수 없음)
  const unorderedOrders = useMemo(() => {
    return orders.filter((o) => !o.isOrdered);
  }, [orders]);

  // 발주된 주문이 있는지 확인
  const hasOrderedOrders = useMemo(() => {
    return orderedOrders.length > 0;
  }, [orderedOrders]);

  return (
    <div className="fixed inset-0 bg-[#00000080] flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[90vw] h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-xl font-bold">{purchase.name} - 주문 목록</h2>
            <p className="text-sm text-gray-500 mt-1">
              기간: {startDate} ~ {endDate} ({orders.length}건)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTemplateView(!showTemplateView)}
              className="px-4 py-2 bg-gray-500 text-white text-sm rounded hover:bg-gray-600"
            >
              {showTemplateView ? "목록 보기" : "양식 보기"}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              닫기
            </button>
          </div>
        </div>

        {/* 필터 영역 */}
        <div className="flex items-center justify-between p-4 bg-gray-50 border-b">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">필터:</label>
            <select
              value={orderFilter}
              onChange={(e) => setOrderFilter(e.target.value as any)}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm"
            >
              <option value="all">전체 주문</option>
              <option value="ordered">발주된 주문</option>
              <option value="unordered">미발주 주문</option>
            </select>
          </div>

          {/* 다운로드 버튼 */}
          <button
            onClick={handleDownload}
            disabled={isDownloading || orders.length === 0}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:bg-gray-400"
          >
            {isDownloading
              ? "다운로드 중..."
              : selectedRows.size > 0
                ? `${selectedRows.size}건 다운로드`
                : "전체 다운로드"}
          </button>
        </div>

        {/* 테이블 */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="text-center py-8">조회 중...</div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">{error}</div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              주문 데이터가 없습니다.
            </div>
          ) : showTemplateView ? (
            // 양식 보기 뷰
            <TemplateView orders={orders} purchase={purchaseDetail} />
          ) : orderFilter === "ordered" && !hasOrderedOrders ? (
            // ordered 필터인데 발주된 주문이 없는 경우
            <div className="text-center py-8 text-gray-500">
              발주된 주문이 없습니다.
            </div>
          ) : (orderFilter === "ordered" || orderFilter === "all") &&
            hasOrderedOrders ? (
            // 발주된 주문 - 차수별 아코디언 뷰 (ordered 또는 all 필터)
            <div className="space-y-6">
              {/* 발주된 주문 - 차수별 아코디언 */}
              {orderFilter === "all" && hasOrderedOrders && (
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-green-600 mb-2">
                    발주된 주문
                  </h3>
                </div>
              )}
              {Object.keys(orderedOrdersByBatch).length > 0 ? (
                // 차수별 아코디언 표시
                Object.entries(orderedOrdersByBatch)
                  .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
                  .map(([batchKey, {batch, orders: batchOrders}]) => (
                    <div
                      key={batchKey}
                      className="border border-gray-200 rounded-lg overflow-hidden"
                    >
                      {/* 아코디언 헤더 */}
                      <div
                        className="flex items-center justify-between p-4 bg-gray-100 cursor-pointer hover:bg-gray-200"
                        onClick={() => toggleBatch(batchKey)}
                      >
                        <div className="flex items-center gap-4">
                          <span className="text-lg font-semibold">
                            {expandedBatches.has(batchKey) ? "▼" : "▶"}
                          </span>
                          <span className="font-bold text-blue-600">
                            {batch.batchNumber}차 발주
                          </span>
                          <span className="text-gray-600">
                            (
                            {batch.batchCreatedAt
                              ? formatBatchDateTime(batch.batchCreatedAt)
                              : batch.batchDate}
                            )
                          </span>
                          <span className="px-2 py-1 bg-green-100 text-green-700 text-sm rounded">
                            {batchOrders.length}건
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={batchOrders.every((o) =>
                              selectedRows.has(o.id),
                            )}
                            onChange={(e) => {
                              e.stopPropagation();
                              if (e.target.checked) {
                                setSelectedRows((prev) => {
                                  const newSet = new Set(prev);
                                  batchOrders.forEach((o) => newSet.add(o.id));
                                  return newSet;
                                });
                              } else {
                                setSelectedRows((prev) => {
                                  const newSet = new Set(prev);
                                  batchOrders.forEach((o) =>
                                    newSet.delete(o.id),
                                  );
                                  return newSet;
                                });
                              }
                            }}
                            className="cursor-pointer w-4 h-4"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className="text-sm text-gray-500">
                            전체 선택
                          </span>
                        </div>
                      </div>

                      {/* 아코디언 내용 - 테이블 */}
                      {expandedBatches.has(batchKey) && (
                        <div className="p-4 overflow-x-auto">
                          <table className="w-full border-collapse border border-gray-300 text-xs">
                            <thead>
                              <tr className="bg-gray-50">
                                <th className="border border-gray-300 px-3 py-2 text-center w-10">
                                  <input
                                    type="checkbox"
                                    checked={batchOrders.every((o) =>
                                      selectedRows.has(o.id),
                                    )}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedRows((prev) => {
                                          const newSet = new Set(prev);
                                          batchOrders.forEach((o) =>
                                            newSet.add(o.id),
                                          );
                                          return newSet;
                                        });
                                      } else {
                                        setSelectedRows((prev) => {
                                          const newSet = new Set(prev);
                                          batchOrders.forEach((o) =>
                                            newSet.delete(o.id),
                                          );
                                          return newSet;
                                        });
                                      }
                                    }}
                                    className="cursor-pointer"
                                  />
                                </th>
                                <th className="border border-gray-300 px-3 py-2 text-left w-10">
                                  No.
                                </th>
                                {headers.map((header, idx) => (
                                  <th
                                    key={idx}
                                    className="border border-gray-300 px-3 py-2 text-left"
                                  >
                                    {header}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {batchOrders.map((order, index) => (
                                <tr key={order.id} className="hover:bg-gray-50">
                                  <td className="border border-gray-300 px-3 py-2 text-center">
                                    <input
                                      type="checkbox"
                                      checked={selectedRows.has(order.id)}
                                      onChange={(e) =>
                                        handleSelectRow(
                                          order.id,
                                          e.target.checked,
                                        )
                                      }
                                      className="cursor-pointer"
                                    />
                                  </td>
                                  <td className="border border-gray-300 px-3 py-2 text-center">
                                    {index + 1}
                                  </td>
                                  {headers.map((header, colIdx) => {
                                    const cellValue = getCellValue(
                                      order,
                                      header,
                                    );
                                    const isClickable =
                                      header === "매핑코드" ||
                                      header === "내부코드/주문번호";
                                    const isOrderStatus = header === "발주여부";
                                    const isProductName = header === "상품명";
                                    const isInternalCodeOrderNumber =
                                      header === "내부코드/주문번호";
                                    const isAddress = header === "주소";
                                    const sabangName =
                                      order.sabangName ||
                                      order.rowData?.사방넷명 ||
                                      order.rowData?.sabangName ||
                                      "";
                                    const rowData = order.rowData || {};
                                    const internalCode =
                                      rowData["내부코드"] || "";
                                    const orderNumber =
                                      rowData["주문번호"] || "";
                                    const deliveryMessage =
                                      rowData["배송메시지"] || "";

                                    return (
                                      <td
                                        key={colIdx}
                                        className={`border border-gray-300 px-3 py-2 ${
                                          isClickable
                                            ? "cursor-pointer text-blue-600 hover:underline"
                                            : ""
                                        } ${isOrderStatus ? getOrderStatusStyle(order.isOrdered) : ""}`}
                                        onClick={() => {
                                          if (header === "매핑코드")
                                            handleMappingCodeClick(order);
                                          else if (
                                            header === "내부코드/주문번호"
                                          )
                                            handleInternalCodeClick(order);
                                        }}
                                      >
                                        {isProductName && sabangName ? (
                                          <div>
                                            <div>{cellValue}</div>
                                            <div className="text-blue-600 text-xs mt-1">
                                              {sabangName}
                                            </div>
                                          </div>
                                        ) : isInternalCodeOrderNumber &&
                                          (internalCode || orderNumber) ? (
                                          <div>
                                            {internalCode && (
                                              <div>{internalCode}</div>
                                            )}
                                            {orderNumber && (
                                              <div className="text-blue-600 text-xs mt-1">
                                                {orderNumber}
                                              </div>
                                            )}
                                            {!internalCode && !orderNumber && (
                                              <div>-</div>
                                            )}
                                          </div>
                                        ) : isAddress && deliveryMessage ? (
                                          <div>
                                            <div>{cellValue}</div>
                                            <div className="text-blue-600 text-xs mt-1">
                                              {deliveryMessage}
                                            </div>
                                          </div>
                                        ) : (
                                          cellValue
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))
              ) : (
                // 차수 정보가 없으면 발주된 주문을 일반 리스트로 표시
                <div className="overflow-x-auto">
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-green-600 mb-2">
                      발주된 주문 (차수 정보 없음)
                    </h3>
                  </div>
                  <table className="w-full border-collapse border border-gray-300 text-xs">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-300 px-3 py-2 text-center w-10">
                          <input
                            type="checkbox"
                            checked={
                              orderedOrders.length > 0 &&
                              orderedOrders.every((o) => selectedRows.has(o.id))
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedRows((prev) => {
                                  const newSet = new Set(prev);
                                  orderedOrders.forEach((o) =>
                                    newSet.add(o.id),
                                  );
                                  return newSet;
                                });
                              } else {
                                setSelectedRows((prev) => {
                                  const newSet = new Set(prev);
                                  orderedOrders.forEach((o) =>
                                    newSet.delete(o.id),
                                  );
                                  return newSet;
                                });
                              }
                            }}
                            className="cursor-pointer"
                          />
                        </th>
                        <th className="border border-gray-300 px-3 py-2 text-left w-10">
                          No.
                        </th>
                        {headers.map((header, idx) => (
                          <th
                            key={idx}
                            className="border border-gray-300 px-3 py-2 text-left"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {orderedOrders.map((order, index) => (
                        <tr key={order.id} className="hover:bg-gray-50">
                          <td className="border border-gray-300 px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={selectedRows.has(order.id)}
                              onChange={(e) =>
                                handleSelectRow(order.id, e.target.checked)
                              }
                              className="cursor-pointer"
                            />
                          </td>
                          <td className="border border-gray-300 px-3 py-2 text-center">
                            {index + 1}
                          </td>
                          {headers.map((header, colIdx) => {
                            const cellValue = getCellValue(order, header);
                            const isClickable =
                              header === "매핑코드" ||
                              header === "내부코드/주문번호";
                            const isOrderStatus = header === "발주여부";
                            const isProductName = header === "상품명";
                            const isInternalCodeOrderNumber =
                              header === "내부코드/주문번호";
                            const isAddress = header === "주소";
                            const sabangName =
                              order.sabangName ||
                              order.rowData?.사방넷명 ||
                              order.rowData?.sabangName ||
                              "";
                            const rowData = order.rowData || {};
                            const internalCode = rowData["내부코드"] || "";
                            const orderNumber = rowData["주문번호"] || "";
                            const deliveryMessage = rowData["배송메시지"] || "";

                            return (
                              <td
                                key={colIdx}
                                className={`border border-gray-300 px-3 py-2 ${
                                  isClickable
                                    ? "cursor-pointer text-blue-600 hover:underline"
                                    : ""
                                } ${isOrderStatus ? getOrderStatusStyle(order.isOrdered) : ""}`}
                                onClick={() => {
                                  if (header === "매핑코드")
                                    handleMappingCodeClick(order);
                                  else if (header === "내부코드/주문번호")
                                    handleInternalCodeClick(order);
                                }}
                              >
                                {isProductName && sabangName ? (
                                  <div>
                                    <div>{cellValue}</div>
                                    <div className="text-blue-600 text-xs mt-1">
                                      {sabangName}
                                    </div>
                                  </div>
                                ) : isInternalCodeOrderNumber &&
                                  (internalCode || orderNumber) ? (
                                  <div>
                                    {internalCode && <div>{internalCode}</div>}
                                    {orderNumber && (
                                      <div className="text-blue-600 text-xs mt-1">
                                        {orderNumber}
                                      </div>
                                    )}
                                    {!internalCode && !orderNumber && (
                                      <div>-</div>
                                    )}
                                  </div>
                                ) : isAddress && deliveryMessage ? (
                                  <div>
                                    <div>{cellValue}</div>
                                    <div className="text-blue-600 text-xs mt-1">
                                      {deliveryMessage}
                                    </div>
                                  </div>
                                ) : (
                                  cellValue
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* all 필터일 때 미발주 주문도 표시 */}
              {orderFilter === "all" && unorderedOrders.length > 0 && (
                <>
                  <div className="mt-6 mb-4">
                    <h3 className="text-lg font-bold text-red-600 mb-2">
                      미발주 주문
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-300 text-xs">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="border border-gray-300 px-3 py-2 text-center w-10">
                            <input
                              type="checkbox"
                              checked={
                                unorderedOrders.length > 0 &&
                                unorderedOrders.every((o) =>
                                  selectedRows.has(o.id),
                                )
                              }
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedRows((prev) => {
                                    const newSet = new Set(prev);
                                    unorderedOrders.forEach((o) =>
                                      newSet.add(o.id),
                                    );
                                    return newSet;
                                  });
                                } else {
                                  setSelectedRows((prev) => {
                                    const newSet = new Set(prev);
                                    unorderedOrders.forEach((o) =>
                                      newSet.delete(o.id),
                                    );
                                    return newSet;
                                  });
                                }
                              }}
                              className="cursor-pointer"
                            />
                          </th>
                          <th className="border border-gray-300 px-3 py-2 text-left w-10">
                            No.
                          </th>
                          {headers.map((header, idx) => (
                            <th
                              key={idx}
                              className="border border-gray-300 px-3 py-2 text-left"
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {unorderedOrders.map((order, index) => (
                          <tr key={order.id} className="hover:bg-gray-50">
                            <td className="border border-gray-300 px-3 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={selectedRows.has(order.id)}
                                onChange={(e) =>
                                  handleSelectRow(order.id, e.target.checked)
                                }
                                className="cursor-pointer"
                              />
                            </td>
                            <td className="border border-gray-300 px-3 py-2 text-center">
                              {index + 1}
                            </td>
                            {headers.map((header, colIdx) => {
                              const cellValue = getCellValue(order, header);
                              const isClickable =
                                header === "매핑코드" ||
                                header === "내부코드/주문번호";
                              const isOrderStatus = header === "발주여부";
                              const isProductName = header === "상품명";
                              const isInternalCodeOrderNumber =
                                header === "내부코드/주문번호";
                              const isAddress = header === "주소";
                              const sabangName =
                                order.sabangName ||
                                order.rowData?.사방넷명 ||
                                order.rowData?.sabangName ||
                                "";
                              const rowData = order.rowData || {};
                              const internalCode = rowData["내부코드"] || "";
                              const orderNumber = rowData["주문번호"] || "";
                              const deliveryMessage =
                                rowData["배송메시지"] || "";

                              return (
                                <td
                                  key={colIdx}
                                  className={`border border-gray-300 px-3 py-2 ${
                                    isClickable
                                      ? "cursor-pointer text-blue-600 hover:underline"
                                      : ""
                                  } ${isOrderStatus ? getOrderStatusStyle(order.isOrdered) : ""}`}
                                  onClick={() => {
                                    if (header === "매핑코드") {
                                      handleMappingCodeClick(order);
                                    } else if (header === "내부코드/주문번호") {
                                      handleInternalCodeClick(order);
                                    }
                                  }}
                                >
                                  {isProductName && sabangName ? (
                                    <div>
                                      <div>{cellValue}</div>
                                      <div className="text-blue-600 text-xs mt-1">
                                        {sabangName}
                                      </div>
                                    </div>
                                  ) : isInternalCodeOrderNumber &&
                                    (internalCode || orderNumber) ? (
                                    <div>
                                      {internalCode && (
                                        <div>{internalCode}</div>
                                      )}
                                      {orderNumber && (
                                        <div className="text-blue-600 text-xs mt-1">
                                          {orderNumber}
                                        </div>
                                      )}
                                      {!internalCode && !orderNumber && (
                                        <div>-</div>
                                      )}
                                    </div>
                                  ) : isAddress && deliveryMessage ? (
                                    <div>
                                      <div>{cellValue}</div>
                                      <div className="text-blue-600 text-xs mt-1">
                                        {deliveryMessage}
                                      </div>
                                    </div>
                                  ) : (
                                    cellValue
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          ) : (
            // 미발주 주문만 - 기존 목록 보기 뷰
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300 text-xs">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-3 py-2 text-center w-10">
                      <input
                        type="checkbox"
                        checked={
                          paginatedOrders.length > 0 &&
                          paginatedOrders.every((o) => selectedRows.has(o.id))
                        }
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="cursor-pointer"
                      />
                    </th>
                    <th className="border border-gray-300 px-3 py-2 text-left w-10">
                      No.
                    </th>
                    {headers.map((header, idx) => (
                      <th
                        key={idx}
                        className="border border-gray-300 px-3 py-2 text-left"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedOrders.map((order, index) => (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={selectedRows.has(order.id)}
                          onChange={(e) =>
                            handleSelectRow(order.id, e.target.checked)
                          }
                          className="cursor-pointer"
                        />
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-center">
                        {(currentPage - 1) * itemsPerPage + index + 1}
                      </td>
                      {headers.map((header, colIdx) => {
                        const cellValue = getCellValue(order, header);
                        const isClickable =
                          header === "매핑코드" ||
                          header === "내부코드/주문번호";
                        const isOrderStatus = header === "발주여부";
                        const isProductName = header === "상품명";
                        const isInternalCodeOrderNumber =
                          header === "내부코드/주문번호";
                        const isAddress = header === "주소";
                        const sabangName =
                          order.sabangName ||
                          order.rowData?.사방넷명 ||
                          order.rowData?.sabangName ||
                          "";
                        const rowData = order.rowData || {};
                        const internalCode = rowData["내부코드"] || "";
                        const orderNumber = rowData["주문번호"] || "";
                        const deliveryMessage = rowData["배송메시지"] || "";

                        return (
                          <td
                            key={colIdx}
                            className={`border border-gray-300 px-3 py-2 ${
                              isClickable
                                ? "cursor-pointer text-blue-600 hover:underline"
                                : ""
                            } ${isOrderStatus ? getOrderStatusStyle(order.isOrdered) : ""}`}
                            onClick={() => {
                              if (header === "매핑코드") {
                                handleMappingCodeClick(order);
                              } else if (header === "내부코드/주문번호") {
                                handleInternalCodeClick(order);
                              }
                            }}
                          >
                            {isProductName && sabangName ? (
                              <div>
                                <div>{cellValue}</div>
                                <div className="text-blue-600 text-xs mt-1">
                                  {sabangName}
                                </div>
                              </div>
                            ) : isInternalCodeOrderNumber &&
                              (internalCode || orderNumber) ? (
                              <div>
                                {internalCode && <div>{internalCode}</div>}
                                {orderNumber && (
                                  <div className="text-blue-600 text-xs mt-1">
                                    {orderNumber}
                                  </div>
                                )}
                                {!internalCode && !orderNumber && <div>-</div>}
                              </div>
                            ) : isAddress && deliveryMessage ? (
                              <div>
                                <div>{cellValue}</div>
                                <div className="text-blue-600 text-xs mt-1">
                                  {deliveryMessage}
                                </div>
                              </div>
                            ) : (
                              cellValue
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 페이지네이션 */}
        {!showTemplateView &&
          !(
            (orderFilter === "ordered" || orderFilter === "all") &&
            Object.keys(orderedOrdersByBatch).length > 0
          ) &&
          totalPages > 1 && (
            <div className="p-4 border-t">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          )}

        {/* 하단 버튼 영역 */}
        <div className="flex items-center justify-between p-4 border-t bg-gray-50">
          <div className="text-sm text-gray-600">
            {selectedRows.size > 0
              ? `${selectedRows.size}건 선택됨`
              : `총 ${orders.length}건`}
          </div>
          <div className="flex gap-2">
            {selectedRows.size > 0 && (
              <>
                <button
                  onClick={handleCancelSelected}
                  disabled={isCanceling || isDeleting || isSending}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCanceling ? "처리 중..." : `${selectedRows.size}건 취소`}
                </button>
                <button
                  onClick={handleDeleteSelected}
                  disabled={isCanceling || isDeleting || isSending}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? "삭제 중..." : `${selectedRows.size}건 삭제`}
                </button>
              </>
            )}
            <button
              onClick={handleSendKakao}
              disabled={
                isSending ||
                isCanceling ||
                isDeleting ||
                !purchase.submitType?.includes("kakaotalk")
              }
              className="px-4 py-2 bg-yellow-500 text-white text-sm rounded hover:bg-yellow-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
              title={
                !purchase.submitType?.includes("kakaotalk")
                  ? "카카오톡 전송이 비활성화되어 있습니다"
                  : ""
              }
            >
              카카오톡 전송
            </button>
            <button
              onClick={handleSendEmail}
              disabled={
                isSending ||
                isCanceling ||
                isDeleting ||
                !purchase.submitType?.includes("email")
              }
              className="px-4 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
              title={
                !purchase.submitType?.includes("email")
                  ? "이메일 전송이 비활성화되어 있습니다"
                  : ""
              }
            >
              이메일 전송
            </button>
          </div>
        </div>
      </div>

      {/* 매핑코드 수정 창 */}
      {editingRow && (
        <CodeEditWindow
          rowId={editingRow.id}
          currentRowData={editingRow.rowData}
          onCodeUpdate={handleCodeUpdate}
          onClose={() => setEditingRow(null)}
        />
      )}

      {/* 상세 데이터 창 */}
      {detailRow && (
        <RowDetailWindow
          rowData={detailRow}
          onClose={() => setDetailRow(null)}
          onDataUpdate={fetchOrders}
        />
      )}
    </div>
  );
}

// 양식 보기 컴포넌트
function TemplateView({
  orders,
  purchase,
}: {
  orders: OrderData[];
  purchase: any;
}) {
  const [editableHeaders, setEditableHeaders] = useState<string[]>([]);
  const [editableCells, setEditableCells] = useState<{[key: string]: string}>(
    {},
  );
  const [mappedDataCache, setMappedDataCache] = useState<{
    [orderId: number]: string[];
  }>({});
  const [headerAliases, setHeaderAliases] = useState<
    Array<{column_key: string; aliases: string[]}>
  >([]);

  // 헤더 Alias 조회
  useEffect(() => {
    const fetchHeaderAliases = async () => {
      try {
        const response = await fetch("/api/header-aliases", {
          headers: getAuthHeaders(),
        });
        const result = await response.json();
        if (result.success && result.data) {
          const aliases = result.data.map((item: any) => ({
            column_key: item.column_key,
            aliases: Array.isArray(item.aliases) ? item.aliases : [],
          }));
          setHeaderAliases(aliases);
        }
      } catch (error) {
        console.error("헤더 Alias 조회 실패:", error);
      }
    };
    fetchHeaderAliases();
  }, []);

  // 기본 헤더 또는 매입처 템플릿 헤더 사용
  useEffect(() => {
    if (purchase?.templateHeaders && purchase.templateHeaders.length > 0) {
      const headers = getTemplateHeaderNames(purchase.templateHeaders);
      setEditableHeaders(headers);
    } else {
      // 기본 외주 발주서 헤더 (download-outsource와 동일)
      // 외주 발주서의 일반적인 헤더 구조 사용
      setEditableHeaders([
        "보내는 분",
        "전화번호",
        "주소",
        "받는사람",
        "전화번호1",
        "전화번호2",
        "우편번호",
        "주소",
        "", // 비어있는 열
        "상품명",
        "배송메시지",
        "박스",
        "업체명",
      ]);
    }
  }, [purchase]);

  // 각 주문의 데이터를 템플릿 형식으로 매핑
  useEffect(() => {
    if (orders.length > 0) {
      const cache: {[orderId: number]: string[]} = {};

      orders.forEach((order) => {
        const rowData = {
          ...order.rowData,
          상품명: order.rowData?.상품명 || order.productName,
          매핑코드: order.rowData?.매핑코드 || order.productCode,
        };

        if (purchase?.templateHeaders && purchase.templateHeaders.length > 0) {
          // 템플릿이 있는 경우
          const mappedValues = mapRowToTemplateFormat(
            rowData,
            purchase.templateHeaders,
            headerAliases,
          );
          cache[order.id] = mappedValues;
        } else {
          // 템플릿이 없는 경우 - 기본 외주 발주서 양식으로 매핑
          const defaultHeaders = [
            "보내는 분",
            "전화번호",
            "주소",
            "받는사람",
            "전화번호1",
            "전화번호2",
            "우편번호",
            "주소",
            "", // 비어있는 열
            "상품명",
            "배송메시지",
            "박스",
            "업체명",
          ];

          const mappedValues = defaultHeaders.map(
            (header: string, colIdx: number) => {
              if (header === "") return "";

              let value: any = "";

              // 각 헤더에 맞는 데이터 매핑 (download-outsource와 동일한 로직)
              switch (header) {
                case "보내는 분":
                  value = purchase?.name || "";
                  break;
                case "전화번호":
                  value = "";
                  break;
                case "받는사람":
                  value = mapDataToTemplate(rowData, "수취인명", {
                    formatPhone: false,
                  });
                  // 수취인명 앞에 ★ 붙이기
                  let receiverName = value != null ? String(value) : "";
                  receiverName = "★" + receiverName.replace(/^★/, "").trim();
                  value = receiverName;
                  break;
                case "전화번호1":
                  value = mapDataToTemplate(rowData, "전화번호1", {
                    formatPhone: true,
                  });
                  break;
                case "전화번호2":
                  value = mapDataToTemplate(rowData, "전화번호2", {
                    formatPhone: true,
                  });
                  break;
                case "우편번호":
                  value = mapDataToTemplate(rowData, "우편번호", {
                    formatPhone: false,
                  });
                  break;
                case "주소":
                  // 첫 번째 주소(인덱스 2)는 빈 값, 두 번째 주소(인덱스 7)는 실제 주소
                  const addressIndices = defaultHeaders
                    .map((h, idx) => (h === "주소" ? idx : -1))
                    .filter((idx) => idx !== -1);
                  const isFirstAddress = colIdx === addressIndices[0];
                  value = isFirstAddress
                    ? ""
                    : mapDataToTemplate(rowData, "주소", {
                        formatPhone: false,
                      });
                  break;
                case "상품명":
                  value = mapDataToTemplate(rowData, "상품명", {
                    formatPhone: false,
                    preferSabangName: true,
                  });
                  break;
                case "배송메시지":
                  value = mapDataToTemplate(rowData, "배송메시지", {
                    formatPhone: false,
                  });
                  break;
                case "박스":
                  value = "";
                  break;
                case "업체명":
                  value = purchase?.name || "";
                  break;
                default:
                  value = mapDataToTemplate(rowData, header, {
                    formatPhone: false,
                  });
              }

              return value != null ? String(value) : "";
            },
          );

          cache[order.id] = mappedValues;
        }
      });

      setMappedDataCache(cache);
    } else {
      setMappedDataCache({});
    }
  }, [orders, purchase?.templateHeaders, purchase?.name, headerAliases]);

  // 헤더 수정
  const handleHeaderChange = useCallback((index: number, value: string) => {
    setEditableHeaders((prev) => {
      const newHeaders = [...prev];
      newHeaders[index] = value;
      return newHeaders;
    });
  }, []);

  // 셀 값 수정
  const handleCellChange = useCallback(
    (rowId: number, header: string, value: string) => {
      setEditableCells((prev) => ({
        ...prev,
        [`${rowId}-${header}`]: value,
      }));
    },
    [],
  );

  // 셀 값 가져오기 (수정된 값 우선, 템플릿이 있으면 매핑된 값 사용)
  const getCellValue = useCallback(
    (order: OrderData, headerIndex: number): string => {
      const header = editableHeaders[headerIndex];
      if (!header) return "";

      const editedValue = editableCells[`${order.id}-${header}`];
      if (editedValue !== undefined) {
        return editedValue;
      }

      // 템플릿이 있고 매핑된 데이터가 있으면 사용
      if (purchase?.templateHeaders && purchase.templateHeaders.length > 0) {
        const mappedValues = mappedDataCache[order.id];
        if (mappedValues && mappedValues[headerIndex] !== undefined) {
          return mappedValues[headerIndex] || "";
        }
      }

      // 기본 매핑 (템플릿이 없을 때) - mappedDataCache에서 가져오기
      const mappedValues = mappedDataCache[order.id];
      if (mappedValues && mappedValues[headerIndex] !== undefined) {
        return mappedValues[headerIndex] || "";
      }

      // fallback: 기본 매핑
      const rowData = order.rowData || {};
      return rowData[header] || "";
    },
    [
      editableCells,
      editableHeaders,
      purchase?.templateHeaders,
      mappedDataCache,
    ],
  );

  return (
    <div className="overflow-x-auto">
      <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded text-sm">
        양식 미리보기 - 헤더와 셀 값을 수정할 수 있습니다.
      </div>
      <table className="w-full border-collapse border border-gray-300 text-xs">
        <thead>
          <tr className="bg-gray-100">
            {editableHeaders.map((header, idx) => (
              <th key={idx} className="border border-gray-300 px-2 py-2">
                <input
                  type="text"
                  value={header}
                  onChange={(e) => handleHeaderChange(idx, e.target.value)}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-center font-bold bg-transparent"
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="hover:bg-gray-50">
              {editableHeaders.map((header, colIdx) => (
                <td key={colIdx} className="border border-gray-300 px-2 py-1">
                  <input
                    type="text"
                    value={getCellValue(order, colIdx)}
                    onChange={(e) =>
                      handleCellChange(order.id, header, e.target.value)
                    }
                    className="w-full px-1 py-0.5 border border-gray-200 rounded text-sm"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
