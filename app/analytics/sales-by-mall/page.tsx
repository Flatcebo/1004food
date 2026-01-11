"use client";

import {useState, useEffect, useCallback} from "react";
import {getTodayDate, formatDate} from "@/utils/date";
import {useLoadingStore} from "@/stores/loadingStore";
import LoadingOverlay from "@/components/LoadingOverlay";

interface SettlementData {
  id: number;
  mallId: number;
  mallName: string;
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
  salesFeeAmount: number | null;
  salesFeeRate: number | null;
  netProfitAmount: number;
  netProfitRate: number;
  createdAt: string;
  updatedAt: string;
}

interface Mall {
  id: number;
  name: string;
  code: string;
}

interface OrderData {
  id: number;
  shopName: string;
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

export default function SalesByMallPage() {
  const todayDate = getTodayDate();
  const [startDate, setStartDate] = useState<string>(todayDate);
  const [endDate, setEndDate] = useState<string>(todayDate);
  const [selectedMallId, setSelectedMallId] = useState<string>("");
  const [malls, setMalls] = useState<Mall[]>([]);
  const [settlements, setSettlements] = useState<SettlementData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const {isLoading, title, message, subMessage, startLoading, stopLoading, updateLoadingMessage} = useLoadingStore();
  
  // 주문 목록 모달 상태
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderModalData, setOrderModalData] = useState<{
    mallId: number;
    mallName: string;
    startDate: string;
    endDate: string;
  } | null>(null);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // 쇼핑몰 목록 조회
  const fetchMalls = useCallback(async () => {
    try {
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

      const response = await fetch("/api/mall?limit=1000", {
        headers,
      });

      const result = await response.json();
      if (result.success) {
        setMalls(result.data || []);
      }
    } catch (err: any) {
      console.error("쇼핑몰 목록 조회 실패:", err);
    }
  }, []);

  // 정산 데이터 조회
  const handleSearch = useCallback(async () => {
    if (!startDate || !endDate) {
      alert("시작일과 종료일을 선택해주세요.");
      return;
    }

    setLoading(true);
    setError("");

    try {
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

      const params = new URLSearchParams({
        startDate,
        endDate,
      });
      if (selectedMallId) {
        params.append("mallId", selectedMallId);
      }

      const response = await fetch(
        `/api/analytics/sales-by-mall?${params.toString()}`,
        {
          headers,
        }
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
  }, [startDate, endDate, selectedMallId]);

  // 정산 데이터 갱신
  const handleRefresh = useCallback(async () => {
    if (!startDate || !endDate) {
      alert("시작일과 종료일을 선택해주세요.");
      return;
    }

    setError("");
    startLoading("매출 정산 갱신", "정산 데이터를 계산하고 있습니다...", "잠시만 기다려주세요");

    try {
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

      updateLoadingMessage("주문 데이터를 조회하고 있습니다...");

      console.log("갱신 API 호출 시작:", {startDate, endDate});

      const response = await fetch("/api/analytics/sales-by-mall/refresh", {
        method: "POST",
        headers,
        body: JSON.stringify({
          startDate,
          endDate,
        }),
      });

      console.log("갱신 API 응답 상태:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("갱신 API 오류:", errorText);
        throw new Error(`서버 오류: ${response.status} - ${errorText}`);
      }

      updateLoadingMessage("정산 데이터를 저장하고 있습니다...");

      const result = await response.json();
      console.log("갱신 API 결과:", result);

      if (result.success) {
        updateLoadingMessage("갱신 완료! 데이터를 조회하고 있습니다...");
        // 갱신 후 조회
        await handleSearch();
        alert(result.message || "정산 데이터가 갱신되었습니다.");
      } else {
        const errorMsg = result.error || "갱신에 실패했습니다.";
        console.error("갱신 실패:", errorMsg);
        setError(errorMsg);
        alert(errorMsg);
      }
    } catch (err: any) {
      const errorMsg = err.message || "갱신 중 오류가 발생했습니다.";
      console.error("갱신 중 예외 발생:", err);
      setError(errorMsg);
      alert(errorMsg);
    } finally {
      stopLoading();
    }
  }, [startDate, endDate, startLoading, stopLoading, updateLoadingMessage, handleSearch]);

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
  const fetchOrders = useCallback(async (mallId: number, mallName: string, startDate: string, endDate: string) => {
    setOrdersLoading(true);
    setError("");

    console.log("[주문 목록 조회] 요청 파라미터:", {mallId, mallName, startDate, endDate});

    try {
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
              console.log("[주문 목록 조회] company_id:", user.companyId);
            }
          }
        } catch (e) {
          console.error("인증 정보 로드 실패:", e);
        }
      }

      const params = new URLSearchParams({
        mallId: mallId.toString(),
        startDate,
        endDate,
      });

      const url = `/api/analytics/sales-by-mall/orders?${params.toString()}`;
      console.log("[주문 목록 조회] API URL:", url);

      const response = await fetch(url, {headers});

      console.log("[주문 목록 조회] 응답 상태:", response.status);

      const result = await response.json();
      console.log("[주문 목록 조회] 응답 데이터:", result);

      if (result.success) {
        console.log("[주문 목록 조회] 조회된 주문 건수:", result.count || result.data?.length || 0);
        setOrders(result.data || []);
        setOrderModalData({mallId, mallName, startDate, endDate});
        setOrderModalOpen(true);
      } else {
        const errorMsg = result.error || "주문 목록 조회에 실패했습니다.";
        console.error("[주문 목록 조회] 오류:", errorMsg);
        setError(errorMsg);
        alert(errorMsg);
      }
    } catch (err: any) {
      const errorMsg = err.message || "주문 목록 조회 중 오류가 발생했습니다.";
      console.error("[주문 목록 조회] 예외 발생:", err);
      setError(errorMsg);
      alert(errorMsg);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  // 날짜만 추출 (YYYY-MM-DD 형식)
  const extractDateOnly = useCallback((date: string | Date | null | undefined): string => {
    if (!date) return "";
    
    // 문자열인 경우
    if (typeof date === "string") {
      // 이미 YYYY-MM-DD 형식인 경우 (예: "2024-01-01")
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return date;
      }
      // ISO 문자열인 경우 (예: "2024-01-01T15:00:00.000Z")
      if (date.includes("T")) {
        return date.split("T")[0];
      }
      // 공백으로 구분된 경우 (예: "2024-01-01 15:00:00")
      if (date.includes(" ")) {
        return date.split(" ")[0];
      }
      // 그 외의 경우 formatDate 사용
      return formatDate(date);
    }
    
    // Date 객체인 경우
    if (date instanceof Date) {
      return formatDate(date);
    }
    
    // 그 외의 경우 문자열로 변환 후 처리
    const dateStr = String(date);
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
      return dateStr.split("T")[0].split(" ")[0];
    }
    
    return formatDate(new Date(dateStr));
  }, []);

  // 주문 수량 셀 클릭 핸들러
  const handleOrderQuantityClick = useCallback((settlement: SettlementData) => {
    if (settlement.orderQuantity === 0) {
      return;
    }
    
    console.log("[주문 수량 클릭] 전체 settlement 데이터:", settlement);
    
    // 정산 데이터의 날짜를 직접 사용 (Date 객체로 변환하지 않음 - 타임존 문제 방지)
    // periodStartDate와 periodEndDate는 이미 YYYY-MM-DD 형식의 문자열이어야 함
    let startDate: string;
    let endDate: string;
    
    if (typeof settlement.periodStartDate === "string") {
      // 문자열인 경우: YYYY-MM-DD 형식인지 확인
      if (/^\d{4}-\d{2}-\d{2}$/.test(settlement.periodStartDate)) {
        startDate = settlement.periodStartDate;
      } else {
        // ISO 문자열이나 다른 형식인 경우 날짜만 추출
        startDate = extractDateOnly(settlement.periodStartDate);
      }
    } else {
      // Date 객체인 경우: UTC 날짜를 사용하여 타임존 문제 방지
      const date = settlement.periodStartDate as any;
      if (date instanceof Date) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, "0");
        const day = String(date.getUTCDate()).padStart(2, "0");
        startDate = `${year}-${month}-${day}`;
      } else {
        startDate = extractDateOnly(settlement.periodStartDate);
      }
    }
    
    if (typeof settlement.periodEndDate === "string") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(settlement.periodEndDate)) {
        endDate = settlement.periodEndDate;
      } else {
        endDate = extractDateOnly(settlement.periodEndDate);
      }
    } else {
      const date = settlement.periodEndDate as any;
      if (date instanceof Date) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, "0");
        const day = String(date.getUTCDate()).padStart(2, "0");
        endDate = `${year}-${month}-${day}`;
      } else {
        endDate = extractDateOnly(settlement.periodEndDate);
      }
    }
    
    console.log("[주문 수량 클릭] 날짜 처리:", {
      periodStartDate_원본: settlement.periodStartDate,
      periodStartDate_타입: typeof settlement.periodStartDate,
      periodEndDate_원본: settlement.periodEndDate,
      periodEndDate_타입: typeof settlement.periodEndDate,
      최종_startDate: startDate,
      최종_endDate: endDate,
      mallId: settlement.mallId,
      mallName: settlement.mallName,
      orderQuantity: settlement.orderQuantity,
    });
    
    fetchOrders(
      settlement.mallId,
      settlement.mallName,
      startDate,
      endDate
    );
  }, [fetchOrders, extractDateOnly]);

  // 주문 모달 닫기
  const handleCloseOrderModal = useCallback(() => {
    setOrderModalOpen(false);
    setOrderModalData(null);
    setOrders([]);
  }, []);

  // 기간 표시 포맷팅 (시간 포함)
  const formatDateRange = useCallback((startDate: string, endDate: string): string => {
    if (startDate === endDate) {
      // 같은 날짜인 경우: "2024-01-01 (00:00:00 ~ 23:59:59)"
      return `${startDate} (00:00:00 ~ 23:59:59)`;
    } else {
      // 다른 날짜인 경우: "2024-01-01 00:00:00 ~ 2024-01-02 23:59:59"
      return `${startDate} 00:00:00 ~ ${endDate} 23:59:59`;
    }
  }, []);

  useEffect(() => {
    fetchMalls();
  }, [fetchMalls]);

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
            <h2 className="text-xl font-bold">쇼핑몰별 매출 정산</h2>
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

            <label className="text-sm font-medium">
              쇼핑몰:
              <select
                className="ml-2 px-2 py-1 border border-gray-300 rounded"
                value={selectedMallId}
                onChange={(e) => setSelectedMallId(e.target.value)}
              >
                <option value="">전체</option>
                {malls.map((mall) => (
                  <option key={mall.id} value={mall.id.toString()}>
                    {mall.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex gap-2">
              <button
                className="px-4 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 disabled:bg-gray-400"
                onClick={(e) => {
                  e.preventDefault();
                  console.log("갱신 버튼 클릭됨");
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
              조회할 데이터가 없습니다. 기간을 선택하고 검색 버튼을 클릭하세요.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-4 py-2 text-left">
                      No.
                    </th>
                    <th className="border border-gray-300 px-4 py-2 text-left">
                      쇼핑몰명
                    </th>
                    <th className="border border-gray-300 px-4 py-2 text-center" colSpan={2}>
                      주문
                    </th>
                    <th className="border border-gray-300 px-4 py-2 text-center" colSpan={2}>
                      취소
                    </th>
                    <th className="border border-gray-300 px-4 py-2 text-center" colSpan={2}>
                      순매출
                    </th>
                    <th className="border border-gray-300 px-4 py-2 text-center" colSpan={2}>
                      총이익
                    </th>
                    <th className="border border-gray-300 px-4 py-2 text-center" colSpan={2}>
                      판매수수료
                    </th>
                    <th className="border border-gray-300 px-4 py-2 text-center" colSpan={2}>
                      순이익
                    </th>
                  </tr>
                  <tr className="bg-gray-50">
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
                    <th className="border border-gray-300 px-4 py-2 text-center">
                      수수료
                    </th>
                    <th className="border border-gray-300 px-4 py-2 text-center">
                      %
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
                        {index + 1}
                      </td>
                      <td className="border border-gray-300 px-4 py-2">
                        {settlement.mallName}
                      </td>
                      <td 
                        className="border border-gray-300 px-4 py-2 text-right cursor-pointer hover:bg-blue-50"
                        onClick={() => handleOrderQuantityClick(settlement)}
                        title="클릭하여 주문 목록 보기"
                      >
                        {formatNumber(settlement.orderQuantity)}
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
                      <td className="border border-gray-300 px-4 py-2 text-right">
                        {formatNumber(settlement.salesFeeAmount)}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-right">
                        {formatPercent(settlement.salesFeeRate)}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-right">
                        {formatNumber(settlement.netProfitAmount)}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-right">
                        {formatPercent(settlement.netProfitRate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {settlements.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-100 font-bold">
                      <td className="border border-gray-300 px-4 py-2 text-center" colSpan={2}>
                        합계
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-right">
                        {formatNumber(
                          settlements.reduce(
                            (sum, s) => sum + (s.orderQuantity || 0),
                            0
                          )
                        )}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-right">
                        {formatNumber(
                          settlements.reduce(
                            (sum, s) => sum + (s.orderAmount || 0),
                            0
                          )
                        )}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-right">
                        {formatNumber(
                          settlements.reduce(
                            (sum, s) => sum + (s.cancelQuantity || 0),
                            0
                          )
                        )}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-right">
                        {formatNumber(
                          settlements.reduce(
                            (sum, s) => sum + (s.cancelAmount || 0),
                            0
                          )
                        )}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-right">
                        {formatNumber(
                          settlements.reduce(
                            (sum, s) => sum + (s.netSalesQuantity || 0),
                            0
                          )
                        )}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-right">
                        {formatNumber(
                          settlements.reduce(
                            (sum, s) => sum + (s.netSalesAmount || 0),
                            0
                          )
                        )}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-right">
                        {formatNumber(
                          settlements.reduce(
                            (sum, s) => sum + (s.totalProfitAmount || 0),
                            0
                          )
                        )}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-right">
                        {formatPercent(
                          settlements.reduce(
                            (sum, s) => sum + (s.totalProfitAmount || 0),
                            0
                          ) /
                            (settlements.reduce(
                              (sum, s) => sum + (s.netSalesAmount || 0),
                              0
                            ) || 1) *
                            100
                        )}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-right">
                        {formatNumber(
                          settlements.reduce(
                            (sum, s) => sum + (s.salesFeeAmount || 0),
                            0
                          )
                        )}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-right">
                        -
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-right">
                        {formatNumber(
                          settlements.reduce(
                            (sum, s) => sum + (s.netProfitAmount || 0),
                            0
                          )
                        )}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-right">
                        {formatPercent(
                          settlements.reduce(
                            (sum, s) => sum + (s.netProfitAmount || 0),
                            0
                          ) /
                            (settlements.reduce(
                              (sum, s) => sum + (s.netSalesAmount || 0),
                              0
                            ) || 1) *
                            100
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
        <div className="fixed inset-0 bg-[#00000080] bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-[90vw] max-w-6xl h-[90vh] flex flex-col">
            {/* 헤더 */}
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 className="text-xl font-bold">
                  {orderModalData.mallName} - 주문 목록
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  기간: {formatDateRange(orderModalData.startDate, orderModalData.endDate)} ({orders.length}건)
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
                        <th className="border border-gray-300 px-3 py-2 text-left">No.</th>
                        <th className="border border-gray-300 px-3 py-2 text-left">주문번호</th>
                        <th className="border border-gray-300 px-3 py-2 text-left">상품명</th>
                        <th className="border border-gray-300 px-3 py-2 text-left">매핑코드</th>
                        <th className="border border-gray-300 px-3 py-2 text-left">내부코드</th>
                        <th className="border border-gray-300 px-3 py-2 text-right">수량</th>
                        <th className="border border-gray-300 px-3 py-2 text-right">공급가</th>
                        <th className="border border-gray-300 px-3 py-2 text-right">주문금액</th>
                        <th className="border border-gray-300 px-3 py-2 text-left">주문상태</th>
                        <th className="border border-gray-300 px-3 py-2 text-left">주문일시</th>
                        <th className="border border-gray-300 px-3 py-2 text-left">생성일시</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order, index) => {
                        const quantity = typeof order.quantity === "number" ? order.quantity : parseFloat(String(order.quantity)) || 1;
                        const salePrice = typeof order.salePrice === "number" ? order.salePrice : parseFloat(String(order.salePrice)) || 0;
                        const orderAmount = quantity * salePrice;
                        
                        // 행 클릭 핸들러: 내부코드로 order page 열기 (기간 필터링 포함)
                        const handleRowClick = () => {
                          if (!order.internalCode) {
                            alert("내부코드가 없습니다.");
                            return;
                          }
                          
                          // 새 윈도우에서 order page 열기 (내부코드 검색 파라미터 및 기간 필터링 포함)
                          const params = new URLSearchParams({
                            searchField: "내부코드",
                            searchValue: order.internalCode,
                            uploadTimeFrom: orderModalData.startDate,
                            uploadTimeTo: orderModalData.endDate,
                          });
                          const url = `/order?${params.toString()}`;
                          const newWindow = window.open(url, "_blank", "width=1200,height=800");
                          if (!newWindow) {
                            alert("팝업이 차단되었습니다. 팝업 차단을 해제해주세요.");
                          }
                        };
                        
                        return (
                          <tr 
                            key={order.id} 
                            className={`hover:bg-blue-50 ${order.internalCode ? "cursor-pointer" : ""}`}
                            onClick={order.internalCode ? handleRowClick : undefined}
                            title={order.internalCode ? "클릭하여 주문 페이지에서 검색" : ""}
                          >
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
                              <span className={`${order.internalCode ? "text-blue-600 underline cursor-pointer hover:text-blue-800" : ""}`}>
                                {formatNumber(quantity)}
                              </span>
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
                              {order.orderDate ? new Date(order.orderDate).toLocaleString("ko-KR") : "-"}
                            </td>
                            <td className="border border-gray-300 px-3 py-2">
                              {order.createdAt ? new Date(order.createdAt).toLocaleString("ko-KR") : "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {orders.length > 0 && (
                      <tfoot>
                        <tr className="bg-gray-100 font-bold">
                          <td className="border border-gray-300 px-3 py-2 text-center" colSpan={5}>
                            합계
                          </td>
                          <td className="border border-gray-300 px-3 py-2 text-right">
                            {formatNumber(
                              orders.reduce((sum, o) => {
                                const qty = typeof o.quantity === "number" ? o.quantity : parseFloat(String(o.quantity)) || 1;
                                return sum + qty;
                              }, 0)
                            )}
                          </td>
                          <td className="border border-gray-300 px-3 py-2 text-right">-</td>
                          <td className="border border-gray-300 px-3 py-2 text-right">
                            {formatNumber(
                              orders.reduce((sum, o) => {
                                const qty = typeof o.quantity === "number" ? o.quantity : parseFloat(String(o.quantity)) || 1;
                                const price = typeof o.salePrice === "number" ? o.salePrice : parseFloat(String(o.salePrice)) || 0;
                                return sum + (qty * price);
                              }, 0)
                            )}
                          </td>
                          <td className="border border-gray-300 px-3 py-2" colSpan={3}>-</td>
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
