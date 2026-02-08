"use client";

import {useState, useEffect, useCallback, useMemo} from "react";
import {useRouter} from "next/navigation";
import {getTodayDate, formatDate} from "@/utils/date";
import {useLoadingStore} from "@/stores/loadingStore";
import {useAuthStore} from "@/stores/authStore";
import LoadingOverlay from "@/components/LoadingOverlay";
import MultiSelectDropdown from "@/components/MultiSelectDropdown";

interface SettlementData {
  id: number;
  purchaseId: number;
  purchaseName: string;
  periodStartDate: string;
  periodEndDate: string;
  orderQuantity: number;
  orderAmount: number;
  cancelQuantity: number;
  cancelAmount: number;
  netSalesQuantity: number;
  netSalesAmount: number;
  totalProfitAmount: number;
  totalProfitRate: number;
  createdAt: string;
  updatedAt: string;
}

interface Purchase {
  id: number;
  name: string;
}

interface OrderData {
  id: number;
  createdAt: string;
  orderNumber: string | null;
  internalCode: string | null;
  productName: string | null;
  mappingCode: string | null;
  quantity: number;
  salePrice: number;
  orderStatus: string | null;
  orderDate: string | null;
  [key: string]: any;
}

export default function SalesByPurchasePage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const todayDate = getTodayDate();
  const [startDate, setStartDate] = useState<string>(todayDate);
  const [endDate, setEndDate] = useState<string>(todayDate);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string>("");
  const [selectedPurchaseNames, setSelectedPurchaseNames] = useState<string[]>(
    [],
  );
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [settlements, setSettlements] = useState<SettlementData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const {
    isLoading,
    title,
    message,
    subMessage,
    startLoading,
    stopLoading,
    updateLoadingMessage,
  } = useLoadingStore();

  const [mounted, setMounted] = useState(false);

  // 클라이언트 마운트 확인
  useEffect(() => {
    setMounted(true);
  }, []);

  // 접근 권한 체크 (온라인 유저 또는 관리자만)
  useEffect(() => {
    if (mounted && user && user.grade !== "온라인" && user.grade !== "관리자") {
      alert("접근 권한이 없습니다.");
      router.push("/");
    }
  }, [mounted, user, router]);

  // 매입처명 목록 (가나다 순 정렬)
  const purchaseNames = useMemo(() => {
    return [...purchases]
      .sort((a, b) => a.name.localeCompare(b.name, "ko"))
      .map((purchase) => purchase.name);
  }, [purchases]);

  // 주문 목록 모달 상태
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderModalData, setOrderModalData] = useState<{
    purchaseId: number;
    purchaseName: string;
    startDate: string;
    endDate: string;
  } | null>(null);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // 체크박스 선택 상태
  const [selectedSettlementIds, setSelectedSettlementIds] = useState<
    Set<number>
  >(new Set());
  const [downloading, setDownloading] = useState(false);
  const [perOrderShippingFee, setPerOrderShippingFee] = useState<boolean>(true);

  // 인증 헤더 생성
  const getAuthHeaders = useCallback((): HeadersInit => {
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

    return headers;
  }, []);

  // 매입처 목록 조회
  const fetchPurchases = useCallback(async () => {
    try {
      const response = await fetch("/api/purchase-management", {
        headers: getAuthHeaders(),
      });

      const result = await response.json();
      if (result.success) {
        setPurchases(result.data || []);
      }
    } catch (err: any) {
      console.error("매입처 목록 조회 실패:", err);
    }
  }, [getAuthHeaders]);

  // 정산 데이터 조회
  const handleSearch = useCallback(async () => {
    if (!startDate || !endDate) {
      alert("시작일과 종료일을 선택해주세요.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
      });
      if (selectedPurchaseId) {
        params.append("purchaseId", selectedPurchaseId);
      }

      const response = await fetch(
        `/api/analytics/sales-by-purchase?${params.toString()}`,
        {
          headers: getAuthHeaders(),
        },
      );

      const result = await response.json();
      if (result.success) {
        setSettlements(result.data || []);
      } else {
        setError(result.error || "조회에 실패했습니다.");
      }
    } catch (err: any) {
      const errorMsg = err.message || "조회 중 오류가 발생했습니다.";
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedPurchaseId, getAuthHeaders]);

  // 정산 데이터 갱신
  const handleRefresh = useCallback(async () => {
    if (!startDate || !endDate) {
      alert("시작일과 종료일을 선택해주세요.");
      return;
    }

    setError("");
    startLoading(
      "매입처별 정산 갱신",
      "정산 데이터를 계산하고 있습니다...",
      "잠시만 기다려주세요",
    );

    try {
      updateLoadingMessage("주문 데이터를 조회하고 있습니다...");

      const requestBody: {
        startDate: string;
        endDate: string;
        purchaseId?: string;
      } = {
        startDate,
        endDate,
      };

      if (selectedPurchaseId) {
        requestBody.purchaseId = selectedPurchaseId;
      }

      const response = await fetch("/api/analytics/sales-by-purchase/refresh", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`서버 오류: ${response.status} - ${errorText}`);
      }

      updateLoadingMessage("정산 데이터를 저장하고 있습니다...");

      const result = await response.json();

      if (result.success) {
        updateLoadingMessage("갱신 완료! 데이터를 조회하고 있습니다...");
        await handleSearch();
        alert(result.message || "정산 데이터가 갱신되었습니다.");
      } else {
        const errorMsg = result.error || "갱신에 실패했습니다.";
        setError(errorMsg);
        alert(errorMsg);
      }
    } catch (err: any) {
      const errorMsg = err.message || "갱신 중 오류가 발생했습니다.";
      setError(errorMsg);
      alert(errorMsg);
    } finally {
      stopLoading();
    }
  }, [
    startDate,
    endDate,
    selectedPurchaseId,
    getAuthHeaders,
    startLoading,
    stopLoading,
    updateLoadingMessage,
    handleSearch,
  ]);

  // 숫자 포맷팅
  const formatNumber = (num: number | string | null | undefined): string => {
    if (num === null || num === undefined) return "-";
    const numValue = typeof num === "string" ? parseFloat(num) : num;
    if (isNaN(numValue)) return "-";
    return new Intl.NumberFormat("ko-KR").format(numValue);
  };

  // 퍼센트 포맷팅
  const formatPercent = (num: number | string | null | undefined): string => {
    if (num === null || num === undefined) return "-";
    const numValue = typeof num === "string" ? parseFloat(num) : num;
    if (isNaN(numValue)) return "-";
    return `${numValue.toFixed(2)}%`;
  };

  // 주문 목록 조회
  const fetchOrders = useCallback(
    async (
      settlementId: number,
      purchaseId: number,
      purchaseName: string,
      startDate: string,
      endDate: string,
    ) => {
      setOrdersLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({
          settlementId: settlementId.toString(),
        });

        const url = `/api/analytics/sales-by-purchase/orders?${params.toString()}`;

        const response = await fetch(url, {headers: getAuthHeaders()});

        const result = await response.json();

        if (result.success) {
          // 중복 제거 (같은 id를 가진 주문이 여러 개 있을 수 있음)
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
          setOrderModalData({purchaseId, purchaseName, startDate, endDate});
          setOrderModalOpen(true);
        } else {
          const errorMsg = result.error || "주문 목록 조회에 실패했습니다.";
          setError(errorMsg);
          alert(errorMsg);
        }
      } catch (err: any) {
        const errorMsg =
          err.message || "주문 목록 조회 중 오류가 발생했습니다.";
        setError(errorMsg);
        alert(errorMsg);
      } finally {
        setOrdersLoading(false);
      }
    },
    [getAuthHeaders],
  );

  // 날짜만 추출 (YYYY-MM-DD 형식)
  const extractDateOnly = useCallback(
    (date: string | Date | null | undefined): string => {
      if (!date) return "";

      if (typeof date === "string") {
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return date;
        }
        if (date.includes("T")) {
          return date.split("T")[0];
        }
        if (date.includes(" ")) {
          return date.split(" ")[0];
        }
        return formatDate(date);
      }

      if (date instanceof Date) {
        return formatDate(date);
      }

      const dateStr = String(date);
      if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        return dateStr.split("T")[0].split(" ")[0];
      }

      return formatDate(new Date(dateStr));
    },
    [],
  );

  // 주문 수량 셀 클릭 핸들러
  const handleOrderQuantityClick = useCallback(
    (settlement: SettlementData) => {
      if (settlement.orderQuantity === 0) {
        return;
      }

      let startDate: string;
      let endDate: string;

      if (typeof settlement.periodStartDate === "string") {
        if (/^\d{4}-\d{2}-\d{2}$/.test(settlement.periodStartDate)) {
          startDate = settlement.periodStartDate;
        } else {
          startDate = extractDateOnly(settlement.periodStartDate);
        }
      } else {
        startDate = extractDateOnly(settlement.periodStartDate);
      }

      if (typeof settlement.periodEndDate === "string") {
        if (/^\d{4}-\d{2}-\d{2}$/.test(settlement.periodEndDate)) {
          endDate = settlement.periodEndDate;
        } else {
          endDate = extractDateOnly(settlement.periodEndDate);
        }
      } else {
        endDate = extractDateOnly(settlement.periodEndDate);
      }

      fetchOrders(
        settlement.id,
        settlement.purchaseId,
        settlement.purchaseName,
        startDate,
        endDate,
      );
    },
    [fetchOrders, extractDateOnly],
  );

  // 주문 모달 닫기
  const handleCloseOrderModal = useCallback(() => {
    setOrderModalOpen(false);
    setOrderModalData(null);
    setOrders([]);
  }, []);

  // 체크박스 전체 선택/해제
  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedSettlementIds(new Set(settlements.map((s) => s.id)));
      } else {
        setSelectedSettlementIds(new Set());
      }
    },
    [settlements],
  );

  // 개별 체크박스 선택/해제
  const handleSelectSettlement = useCallback(
    (settlementId: number, checked: boolean) => {
      setSelectedSettlementIds((prev) => {
        const newSet = new Set(prev);
        if (checked) {
          newSet.add(settlementId);
        } else {
          newSet.delete(settlementId);
        }
        return newSet;
      });
    },
    [],
  );

  // 정산서 다운로드
  const handleDownloadSettlement = useCallback(async () => {
    const idsToDownload =
      selectedSettlementIds.size > 0
        ? Array.from(selectedSettlementIds)
        : settlements.map((s) => s.id);

    if (idsToDownload.length === 0) {
      alert("다운로드할 정산이 없습니다.");
      return;
    }

    setDownloading(true);
    try {
      const response = await fetch(
        "/api/analytics/sales-by-purchase/download-settlement",
        {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            settlementIds: idsToDownload,
            perOrderShippingFee: perOrderShippingFee,
          }),
        },
      );

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "다운로드 실패");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const contentDisposition = response.headers.get("Content-Disposition");
      let downloadFileName = `매입처_정산서_${new Date().toISOString().split("T")[0]}.zip`;
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(
          /filename\*=UTF-8''(.+)/,
        );
        if (fileNameMatch) {
          downloadFileName = decodeURIComponent(fileNameMatch[1]);
        }
      }

      a.download = downloadFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("정산서 다운로드 실패:", err);
      alert("정산서 다운로드에 실패했습니다: " + err.message);
    } finally {
      setDownloading(false);
    }
  }, [settlements, selectedSettlementIds, getAuthHeaders, perOrderShippingFee]);

  // 기간 표시 포맷팅
  const formatDateRange = useCallback(
    (startDate: string, endDate: string): string => {
      if (startDate === endDate) {
        return `${startDate} (00:00:00 ~ 23:59:59)`;
      } else {
        return `${startDate} 00:00:00 ~ ${endDate} 23:59:59`;
      }
    },
    [],
  );

  useEffect(() => {
    if (user && (user.grade === "온라인" || user.grade === "관리자")) {
      fetchPurchases();
    }
  }, [user, fetchPurchases]);

  // 접근 권한이 없으면 렌더링하지 않음 (클라이언트에서만 체크)
  if (
    !mounted ||
    !user ||
    (user.grade !== "온라인" && user.grade !== "관리자")
  ) {
    return null;
  }

  return (
    <>
      <LoadingOverlay
        isOpen={isLoading}
        title={title}
        message={message}
        subMessage={subMessage}
      />
      <div className="w-full h-full flex flex-col items-start justify-start pt-4 px-4">
        <div className="w-full bg-[#ffffff] rounded-lg px-8 shadow-md pb-12">
          <div className="w-full mt-6">
            <div className="mb-4 flex gap-4 items-center justify-between">
              <h2 className="text-xl font-bold">매입처별 매출 정산</h2>
              {settlements.length > 0 && (
                <div className="flex gap-4 items-center">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={perOrderShippingFee}
                      onChange={(e) => setPerOrderShippingFee(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span>건당 배송비</span>
                  </label>
                  <button
                    className="px-4 py-2 bg-indigo-500 text-white text-sm rounded hover:bg-indigo-600 disabled:bg-gray-400"
                    onClick={handleDownloadSettlement}
                    disabled={downloading}
                  >
                    {downloading
                      ? "다운로드 중..."
                      : selectedSettlementIds.size > 0
                        ? `${selectedSettlementIds.size}건 다운로드`
                        : "전체 다운로드"}
                  </button>
                </div>
              )}
            </div>

            {/* 필터 영역 */}
            <div className="mb-6 flex gap-4 items-center flex-wrap">
              <label className="text-sm font-medium">
                기간:
                <input
                  type="date"
                  className="ml-2 px-2 py-1 border border-gray-300 rounded"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <span className="mx-2">~</span>
                <input
                  type="date"
                  className="px-2 py-1 border border-gray-300 rounded"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </label>

              <MultiSelectDropdown
                label="매입처"
                options={purchaseNames}
                labelOnTop={false}
                selectedValues={selectedPurchaseNames}
                onChange={(values) => {
                  const stringValues = values.map((v) => String(v));
                  const newValues =
                    stringValues.length > 0
                      ? [stringValues[stringValues.length - 1]]
                      : [];
                  setSelectedPurchaseNames(newValues);

                  if (newValues.length === 0) {
                    setSelectedPurchaseId("");
                  } else {
                    const foundPurchase = purchases.find(
                      (p) => p.name === newValues[0],
                    );
                    if (foundPurchase) {
                      setSelectedPurchaseId(foundPurchase.id.toString());
                    } else {
                      setSelectedPurchaseId("");
                    }
                  }
                }}
                placeholder="전체"
                enableAutocomplete={true}
                className="w-auto"
              />

              <div className="flex gap-2">
                <button
                  className="px-4 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 disabled:bg-gray-400"
                  onClick={(e) => {
                    e.preventDefault();
                    handleRefresh();
                  }}
                  disabled={!startDate || !endDate}
                >
                  갱신
                </button>
                <button
                  className="px-4 py-2 bg-green-500 text-white text-sm rounded hover:bg-green-600 disabled:bg-gray-400"
                  onClick={handleSearch}
                  disabled={loading || !startDate || !endDate}
                >
                  {loading ? "조회 중..." : "검색"}
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
                {error}
              </div>
            )}

            {/* 테이블 */}
            {loading ? (
              <div className="text-center py-8">조회 중...</div>
            ) : settlements.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                조회할 데이터가 없습니다. 기간을 선택하고 검색 버튼을
                클릭하세요.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-300 px-4 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={
                            settlements.length > 0 &&
                            selectedSettlementIds.size === settlements.length
                          }
                          onChange={(e) => handleSelectAll(e.target.checked)}
                          className="cursor-pointer"
                        />
                      </th>
                      <th className="border border-gray-300 px-4 py-2 text-left">
                        No.
                      </th>
                      <th className="border border-gray-300 px-4 py-2 text-left">
                        매입처명
                      </th>
                      <th
                        className="border border-gray-300 px-4 py-2 text-center"
                        colSpan={2}
                      >
                        주문
                      </th>
                      <th
                        className="border border-gray-300 px-4 py-2 text-center"
                        colSpan={2}
                      >
                        취소
                      </th>
                      <th
                        className="border border-gray-300 px-4 py-2 text-center"
                        colSpan={2}
                      >
                        순매출
                      </th>
                      <th
                        className="border border-gray-300 px-4 py-2 text-center"
                        colSpan={2}
                      >
                        총이익
                      </th>
                    </tr>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-300 px-4 py-2"></th>
                      <th className="border border-gray-300 px-4 py-2"></th>
                      <th className="border border-gray-300 px-4 py-2"></th>
                      <th className="border border-gray-300 px-4 py-2 text-center">
                        수량
                      </th>
                      <th className="border border-gray-300 px-4 py-2 text-center">
                        금액
                      </th>
                      <th className="border border-gray-300 px-4 py-2 text-center">
                        수량
                      </th>
                      <th className="border border-gray-300 px-4 py-2 text-center">
                        금액
                      </th>
                      <th className="border border-gray-300 px-4 py-2 text-center">
                        수량
                      </th>
                      <th className="border border-gray-300 px-4 py-2 text-center">
                        금액
                      </th>
                      <th className="border border-gray-300 px-4 py-2 text-center">
                        이익액
                      </th>
                      <th className="border border-gray-300 px-4 py-2 text-center">
                        이익률
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlements.map((settlement, index) => (
                      <tr key={settlement.id} className="hover:bg-gray-50">
                        <td className="border border-gray-300 px-4 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={selectedSettlementIds.has(settlement.id)}
                            onChange={(e) =>
                              handleSelectSettlement(
                                settlement.id,
                                e.target.checked,
                              )
                            }
                            className="cursor-pointer"
                          />
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center">
                          {index + 1}
                        </td>
                        <td className="border border-gray-300 px-4 py-2">
                          {settlement.purchaseName}
                        </td>
                        <td
                          className="border border-gray-300 px-4 py-2 text-right cursor-pointer hover:bg-blue-50"
                          onClick={() => handleOrderQuantityClick(settlement)}
                          title="클릭하여 주문 목록 보기"
                        >
                          <span className="text-blue-600 underline hover:text-blue-800">
                            {formatNumber(settlement.orderQuantity)}
                          </span>
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-right">
                          {formatNumber(settlement.orderAmount)}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-right">
                          {formatNumber(settlement.cancelQuantity)}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-right">
                          {formatNumber(settlement.cancelAmount)}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-right">
                          {formatNumber(settlement.netSalesQuantity)}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-right">
                          {formatNumber(settlement.netSalesAmount)}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-right">
                          {formatNumber(settlement.totalProfitAmount)}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-right">
                          {formatPercent(settlement.totalProfitRate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {settlements.length > 0 && (
                    <tfoot>
                      <tr className="bg-gray-100 font-bold">
                        <td
                          className="border border-gray-300 px-4 py-2 text-center"
                          colSpan={3}
                        >
                          합계
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-right">
                          {formatNumber(
                            settlements.reduce(
                              (sum, s) => sum + (s.orderQuantity || 0),
                              0,
                            ),
                          )}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-right">
                          {formatNumber(
                            settlements.reduce(
                              (sum, s) => sum + (s.orderAmount || 0),
                              0,
                            ),
                          )}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-right">
                          {formatNumber(
                            settlements.reduce(
                              (sum, s) => sum + (s.cancelQuantity || 0),
                              0,
                            ),
                          )}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-right">
                          {formatNumber(
                            settlements.reduce(
                              (sum, s) => sum + (s.cancelAmount || 0),
                              0,
                            ),
                          )}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-right">
                          {formatNumber(
                            settlements.reduce(
                              (sum, s) => sum + (s.netSalesQuantity || 0),
                              0,
                            ),
                          )}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-right">
                          {formatNumber(
                            settlements.reduce(
                              (sum, s) => sum + (s.netSalesAmount || 0),
                              0,
                            ),
                          )}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-right">
                          {formatNumber(
                            settlements.reduce(
                              (sum, s) => sum + (s.totalProfitAmount || 0),
                              0,
                            ),
                          )}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-right">
                          {formatPercent(
                            (settlements.reduce(
                              (sum, s) => sum + (s.totalProfitAmount || 0),
                              0,
                            ) /
                              (settlements.reduce(
                                (sum, s) => sum + (s.netSalesAmount || 0),
                                0,
                              ) || 1)) *
                              100,
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        </div>

        {/* 주문 목록 모달 */}
        {orderModalOpen && orderModalData && (
          <div className="fixed inset-0 bg-[#00000080] flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-[90vw] max-w-6xl h-[90vh] flex flex-col">
              {/* 헤더 */}
              <div className="flex items-center justify-between p-4 border-b">
                <div>
                  <h2 className="text-xl font-bold">
                    {orderModalData.purchaseName} - 주문 목록
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    기간:{" "}
                    {formatDateRange(
                      orderModalData.startDate,
                      orderModalData.endDate,
                    )}{" "}
                    ({orders.length}건)
                  </p>
                </div>
                <button
                  onClick={handleCloseOrderModal}
                  className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                >
                  닫기
                </button>
              </div>

              {/* 주문 목록 테이블 */}
              <div className="flex-1 overflow-auto p-4">
                {ordersLoading ? (
                  <div className="text-center py-8">조회 중...</div>
                ) : orders.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    주문 데이터가 없습니다.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-300 text-sm">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="border border-gray-300 px-3 py-2 text-left">
                            No.
                          </th>
                          <th className="border border-gray-300 px-3 py-2 text-left">
                            주문번호
                          </th>
                          <th className="border border-gray-300 px-3 py-2 text-left">
                            주문상품명
                          </th>
                          <th className="border border-gray-300 px-3 py-2 text-left">
                            매핑코드
                          </th>
                          <th className="border border-gray-300 px-3 py-2 text-left">
                            내부코드
                          </th>
                          <th className="border border-gray-300 px-3 py-2 text-right">
                            수량
                          </th>
                          <th className="border border-gray-300 px-3 py-2 text-right">
                            공급가
                          </th>
                          <th className="border border-gray-300 px-3 py-2 text-right">
                            주문금액
                          </th>
                          <th className="border border-gray-300 px-3 py-2 text-left">
                            주문상태
                          </th>
                          <th className="border border-gray-300 px-3 py-2 text-left">
                            등록일시
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((order, index) => {
                          const quantity =
                            typeof order.quantity === "number"
                              ? order.quantity
                              : parseFloat(String(order.quantity)) || 1;
                          const salePrice =
                            typeof order.salePrice === "number"
                              ? order.salePrice
                              : parseFloat(String(order.salePrice)) || 0;
                          const orderAmount = quantity * salePrice;

                          return (
                            <tr key={order.id} className="hover:bg-gray-50">
                              <td className="border border-gray-300 px-3 py-2 text-center">
                                {index + 1}
                              </td>
                              <td className="border border-gray-300 px-3 py-2">
                                {order.orderNumber || "-"}
                              </td>
                              <td className="border border-gray-300 px-3 py-2">
                                {order.productName || "-"}
                              </td>
                              <td className="border border-gray-300 px-3 py-2">
                                {order.mappingCode || "-"}
                              </td>
                              <td className="border border-gray-300 px-3 py-2">
                                {order.internalCode || "-"}
                              </td>
                              <td className="border border-gray-300 px-3 py-2 text-right">
                                {formatNumber(quantity)}
                              </td>
                              <td className="border border-gray-300 px-3 py-2 text-right">
                                {formatNumber(salePrice)}
                              </td>
                              <td className="border border-gray-300 px-3 py-2 text-right font-semibold">
                                {formatNumber(orderAmount)}
                              </td>
                              <td className="border border-gray-300 px-3 py-2">
                                {order.orderStatus || "-"}
                              </td>
                              <td className="border border-gray-300 px-3 py-2">
                                {order.createdAt
                                  ? new Date(order.createdAt).toLocaleString(
                                      "ko-KR",
                                    )
                                  : "-"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {orders.length > 0 && (
                        <tfoot>
                          <tr className="bg-gray-100 font-bold">
                            <td
                              className="border border-gray-300 px-3 py-2 text-center"
                              colSpan={5}
                            >
                              합계
                            </td>
                            <td className="border border-gray-300 px-3 py-2 text-right">
                              {formatNumber(
                                orders.reduce((sum, o) => {
                                  const qty =
                                    typeof o.quantity === "number"
                                      ? o.quantity
                                      : parseFloat(String(o.quantity)) || 1;
                                  return sum + qty;
                                }, 0),
                              )}
                            </td>
                            <td className="border border-gray-300 px-3 py-2 text-right">
                              -
                            </td>
                            <td className="border border-gray-300 px-3 py-2 text-right">
                              {formatNumber(
                                orders.reduce((sum, o) => {
                                  const qty =
                                    typeof o.quantity === "number"
                                      ? o.quantity
                                      : parseFloat(String(o.quantity)) || 1;
                                  const salePrice =
                                    typeof o.salePrice === "number"
                                      ? o.salePrice
                                      : parseFloat(String(o.salePrice)) || 0;
                                  return sum + qty * salePrice;
                                }, 0),
                              )}
                            </td>
                            <td
                              className="border border-gray-300 px-3 py-2"
                              colSpan={2}
                            >
                              -
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
