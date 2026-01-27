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
  createdAt: string;
  uploadDate: string;
  productId: number;
  productCode: string;
  productName: string;
  salePrice: number;
  sabangName: string;
}

interface PurchaseOrdersModalProps {
  purchase: PurchaseStats;
  startDate: string;
  endDate: string;
  onClose: () => void;
}

export default function PurchaseOrdersModal({
  purchase,
  startDate,
  endDate,
  onClose,
}: PurchaseOrdersModalProps) {
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [orderFilter, setOrderFilter] = useState<"all" | "ordered" | "unordered">("unordered");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [editingRow, setEditingRow] = useState<{id: number; rowData: any} | null>(null);
  const [detailRow, setDetailRow] = useState<any>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSending, setIsSending] = useState(false);
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
        }
      );

      const result = await response.json();
      if (result.success) {
        // 중복 제거 (id 기준)
        const uniqueOrders = (result.data || []).reduce((acc: OrderData[], order: OrderData) => {
          if (!acc.find((o) => o.id === order.id)) {
            acc.push(order);
          }
          return acc;
        }, []);
        setOrders(uniqueOrders);
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

  // 페이지네이션
  const totalPages = Math.ceil(orders.length / itemsPerPage);
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return orders.slice(start, start + itemsPerPage);
  }, [orders, currentPage, itemsPerPage]);

  // 헤더 목록
  const headers = useMemo(() => {
    return [
      "내부코드",
      "주문번호",
      "상품명",
      "매핑코드",
      "수취인명",
      "수취인 전화번호",
      "주소",
      "수량",
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

  // 셀 값 가져오기
  const getCellValue = useCallback(
    (order: OrderData, header: string): string => {
      const rowData = order.rowData || {};
      switch (header) {
        case "내부코드":
          return rowData["내부코드"] || "-";
        case "주문번호":
          return rowData["주문번호"] || "-";
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
    []
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
    [paginatedOrders]
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
    } catch (err: any) {
      alert(`다운로드 오류: ${err.message}`);
    } finally {
      setIsDownloading(false);
    }
  }, [selectedRows, orders, purchase.id, purchase.name, startDate, endDate]);

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

    if (!confirm(`${orderIds.length}건의 주문을 카카오톡으로 전송하시겠습니까?`)) {
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
        fetchOrders();
      } else {
        alert(`전송 실패: ${result.error}`);
      }
    } catch (err: any) {
      alert(`전송 오류: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  }, [purchase.id, purchase.kakaotalk, selectedRows, orders, startDate, endDate, fetchOrders]);

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
        fetchOrders();
      } else {
        alert(`전송 실패: ${result.error}`);
      }
    } catch (err: any) {
      alert(`전송 오류: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  }, [purchase.id, purchase.email, selectedRows, orders, startDate, endDate, fetchOrders]);

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

  return (
    <div className="fixed inset-0 bg-[#00000080] flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[95vw] max-w-7xl h-[90vh] flex flex-col">
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
            <TemplateView
              orders={orders}
              purchase={purchaseDetail}
            />
          ) : (
            // 목록 보기 뷰
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300 text-sm">
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
                          header === "매핑코드" || header === "내부코드";
                        const isOrderStatus = header === "발주여부";

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
                              } else if (header === "내부코드") {
                                handleInternalCodeClick(order);
                              }
                            }}
                          >
                            {cellValue}
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
        {!showTemplateView && totalPages > 1 && (
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
            <button
              onClick={handleSendKakao}
              disabled={isSending || !purchase.submitType?.includes("kakaotalk")}
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
              disabled={isSending || !purchase.submitType?.includes("email")}
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
  const [editableCells, setEditableCells] = useState<{[key: string]: string}>({});
  const [mappedDataCache, setMappedDataCache] = useState<{[orderId: number]: string[]}>({});
  const [headerAliases, setHeaderAliases] = useState<Array<{column_key: string; aliases: string[]}>>([]);

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
      // 기본 외주 발주서 헤더
      setEditableHeaders([
        "주문번호",
        "상품명",
        "수량",
        "수취인명",
        "전화번호1",
        "전화번호2",
        "우편번호",
        "주소",
        "배송메시지",
      ]);
    }
  }, [purchase]);

  // 각 주문의 데이터를 템플릿 형식으로 매핑 (템플릿이 있을 때만)
  useEffect(() => {
    if (purchase?.templateHeaders && purchase.templateHeaders.length > 0 && orders.length > 0) {
      const cache: {[orderId: number]: string[]} = {};
      
      orders.forEach((order) => {
        const rowData = {
          ...order.rowData,
          상품명: order.rowData?.상품명 || order.productName,
          매핑코드: order.rowData?.매핑코드 || order.productCode,
        };
        
        const mappedValues = mapRowToTemplateFormat(
          rowData,
          purchase.templateHeaders,
          headerAliases
        );
        
        cache[order.id] = mappedValues;
      });
      
      setMappedDataCache(cache);
    } else {
      setMappedDataCache({});
    }
  }, [orders, purchase?.templateHeaders, headerAliases]);

  // 헤더 수정
  const handleHeaderChange = useCallback((index: number, value: string) => {
    setEditableHeaders((prev) => {
      const newHeaders = [...prev];
      newHeaders[index] = value;
      return newHeaders;
    });
  }, []);

  // 셀 값 수정
  const handleCellChange = useCallback((rowId: number, header: string, value: string) => {
    setEditableCells((prev) => ({
      ...prev,
      [`${rowId}-${header}`]: value,
    }));
  }, []);

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

      // 기본 매핑 (템플릿이 없을 때)
      const rowData = order.rowData || {};
      switch (header) {
        case "주문번호":
          return rowData["내부코드"] || rowData["주문번호"] || "";
        case "상품명":
          return rowData["상품명"] || order.productName || "";
        case "수량":
          return rowData["수량"] || "1";
        case "수취인명":
          return rowData["수취인명"] || "";
        case "전화번호1":
          return rowData["수취인 전화번호"] || rowData["전화번호1"] || "";
        case "전화번호2":
          return rowData["전화번호2"] || rowData["수취인 전화번호"] || "";
        case "우편번호":
          return rowData["우편"] || rowData["우편번호"] || "";
        case "주소":
          return rowData["주소"] || "";
        case "배송메시지":
          return rowData["배송메시지"] || "";
        default:
          return rowData[header] || "";
      }
    },
    [editableCells, editableHeaders, purchase?.templateHeaders, mappedDataCache]
  );

  return (
    <div className="overflow-x-auto">
      <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded text-sm">
        양식 미리보기 - 헤더와 셀 값을 수정할 수 있습니다.
      </div>
      <table className="w-full border-collapse border border-gray-300 text-sm">
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
