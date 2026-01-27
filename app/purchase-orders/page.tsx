"use client";

import {useState, useEffect, useCallback, useMemo} from "react";
import {useRouter} from "next/navigation";
import {getTodayDate} from "@/utils/date";
import {useLoadingStore} from "@/stores/loadingStore";
import {useAuthStore} from "@/stores/authStore";
import LoadingOverlay from "@/components/LoadingOverlay";
import PurchaseOrdersModal from "@/components/PurchaseOrdersModal";
import MultiSelectDropdown from "@/components/MultiSelectDropdown";

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

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const todayDate = getTodayDate();
  const [startDate, setStartDate] = useState<string>(todayDate);
  const [endDate, setEndDate] = useState<string>(todayDate);
  const [purchases, setPurchases] = useState<PurchaseStats[]>([]);
  const [selectedPurchaseNames, setSelectedPurchaseNames] = useState<string[]>(
    [],
  );
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

  // 모달 상태
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] =
    useState<PurchaseStats | null>(null);

  // 체크박스 선택 상태
  const [selectedPurchaseIds, setSelectedPurchaseIds] = useState<Set<number>>(
    new Set(),
  );

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

  // 매입처 목록 조회 (드롭다운용)
  const fetchPurchaseList = useCallback(async () => {
    try {
      const response = await fetch("/api/purchase-management", {
        headers: getAuthHeaders(),
      });

      const result = await response.json();
      if (result.success) {
        // 매입처 목록을 purchases 상태에 저장 (통계는 0으로 초기화)
        const purchaseList = (result.data || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          submitType: p.submitType || [],
          email: p.email,
          kakaotalk: p.kakaotalk,
          totalOrders: 0,
          orderedCount: 0,
          unorderedCount: 0,
        }));
        // 기존 purchases에 통계가 있으면 유지
        setPurchases((prevPurchases) => {
          if (prevPurchases.length === 0) {
            return purchaseList;
          }
          // 통계 데이터가 있는 경우, id 기준으로 병합
          const prevMap = new Map(prevPurchases.map((p) => [p.id, p]));
          return purchaseList.map((newP: PurchaseStats) => {
            const existing = prevMap.get(newP.id);
            return existing || newP;
          });
        });
      }
    } catch (err: any) {
      console.error("매입처 목록 조회 실패:", err);
    }
  }, [getAuthHeaders]);

  // 매입처 데이터 조회 (통계 포함)
  const fetchPurchases = useCallback(async () => {
    if (!startDate || !endDate) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
      });

      const response = await fetch(
        `/api/purchase-orders?${params.toString()}`,
        {
          headers: getAuthHeaders(),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `서버 오류: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        const statsData = result.data || [];
        // 기존 purchases와 통계 데이터 병합
        setPurchases((prevPurchases) => {
          if (prevPurchases.length === 0) {
            // 목록이 없으면 통계 데이터 그대로 사용
            return statsData;
          }
          // 목록이 있으면 통계 데이터로 업데이트
          const statsMap = new Map(
            statsData.map((p: PurchaseStats) => [p.id, p]),
          );
          return prevPurchases.map((p) => {
            const stats = statsMap.get(p.id);
            return stats || p;
          });
        });
      } else {
        setError(result.error || "조회에 실패했습니다.");
      }
    } catch (err: any) {
      const errorMsg = err.message || "조회 중 오류가 발생했습니다.";
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, getAuthHeaders]);

  // 초기 로드 시 매입처 목록만 조회 (드롭다운용)
  useEffect(() => {
    if (
      mounted &&
      user &&
      (user.grade === "온라인" || user.grade === "관리자")
    ) {
      fetchPurchaseList();
    }
  }, [mounted, user, fetchPurchaseList]);

  // 숫자 포맷팅
  const formatNumber = (num: number | string | null | undefined): string => {
    if (num === null || num === undefined) return "-";
    const numValue = typeof num === "string" ? parseFloat(num) : num;
    if (isNaN(numValue)) return "-";
    return new Intl.NumberFormat("ko-KR").format(numValue);
  };

  // 매입처 클릭 핸들러
  const handlePurchaseClick = useCallback((purchase: PurchaseStats) => {
    setSelectedPurchase(purchase);
    setModalOpen(true);
  }, []);

  // 모달 닫기
  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
    setSelectedPurchase(null);
    // 모달 닫을 때는 데이터 새로고침하지 않음 (검색 버튼으로만 조회)
  }, []);

  // 개별 체크박스 선택/해제
  const handleSelectPurchase = useCallback(
    (purchaseId: number, checked: boolean) => {
      setSelectedPurchaseIds((prev) => {
        const newSet = new Set(prev);
        if (checked) {
          newSet.add(purchaseId);
        } else {
          newSet.delete(purchaseId);
        }
        return newSet;
      });
    },
    [],
  );

  // 전체 전송 (미발주 건만)
  const handleSendAll = useCallback(async () => {
    if (
      !confirm(
        "모든 매입처의 미발주 주문을 해당 전송 방법(카카오톡/이메일)으로 전송하시겠습니까?",
      )
    ) {
      return;
    }

    startLoading("전체 전송", "미발주 주문을 전송 중입니다...");

    try {
      const response = await fetch("/api/purchase-orders/send-all", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          startDate,
          endDate,
        }),
      });

      const result = await response.json();
      if (result.success) {
        alert(`전송 완료: ${result.message}`);
        fetchPurchases();
      } else {
        alert(`전송 실패: ${result.error}`);
      }
    } catch (err: any) {
      alert(`전송 오류: ${err.message}`);
    } finally {
      stopLoading();
    }
  }, [
    startDate,
    endDate,
    getAuthHeaders,
    startLoading,
    stopLoading,
    fetchPurchases,
  ]);

  // 전체 다운로드
  const handleDownloadAll = useCallback(async () => {
    if (purchases.length === 0) {
      alert("다운로드할 데이터가 없습니다.");
      return;
    }

    startLoading("전체 다운로드", "발주서를 생성 중입니다...");

    try {
      const response = await fetch("/api/purchase-orders/download-all", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          startDate,
          endDate,
          purchaseIds:
            selectedPurchaseIds.size > 0
              ? Array.from(selectedPurchaseIds)
              : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "다운로드 실패");
      }

      // ZIP 파일 다운로드
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      // Content-Disposition 헤더에서 파일명 추출
      const contentDisposition = response.headers.get("Content-Disposition");
      let fileName = `매입처별_발주서_${startDate}.zip`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename\*=UTF-8''(.+)/);
        if (match) {
          fileName = decodeURIComponent(match[1]);
        }
      }

      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`다운로드 오류: ${err.message}`);
    } finally {
      stopLoading();
    }
  }, [
    purchases,
    startDate,
    endDate,
    selectedPurchaseIds,
    getAuthHeaders,
    startLoading,
    stopLoading,
  ]);

  // 매입처명 목록 (가나다 순 정렬)
  const purchaseNames = useMemo(() => {
    return [...purchases]
      .sort((a, b) => a.name.localeCompare(b.name, "ko"))
      .map((purchase) => purchase.name);
  }, [purchases]);

  // 필터링된 매입처 목록
  const filteredPurchases = useMemo(() => {
    if (selectedPurchaseNames.length === 0) {
      return purchases;
    }
    return purchases.filter((purchase) =>
      selectedPurchaseNames.includes(purchase.name),
    );
  }, [purchases, selectedPurchaseNames]);

  // 합계 계산 (필터링된 목록 기준)
  const totals = useMemo(() => {
    return filteredPurchases.reduce(
      (acc, p) => ({
        totalOrders: acc.totalOrders + p.totalOrders,
        orderedCount: acc.orderedCount + p.orderedCount,
        unorderedCount: acc.unorderedCount + p.unorderedCount,
      }),
      {totalOrders: 0, orderedCount: 0, unorderedCount: 0},
    );
  }, [filteredPurchases]);

  // 체크박스 전체 선택/해제 (필터링된 목록 기준)
  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedPurchaseIds(new Set(filteredPurchases.map((p) => p.id)));
      } else {
        // 필터링된 항목만 해제
        setSelectedPurchaseIds((prev) => {
          const newSet = new Set(prev);
          filteredPurchases.forEach((p) => newSet.delete(p.id));
          return newSet;
        });
      }
    },
    [filteredPurchases],
  );

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
              <h2 className="text-xl font-bold">매입처별 주문 관리</h2>
              <div className="flex gap-2">
                <button
                  className="px-4 py-2 bg-purple-500 text-white text-sm rounded hover:bg-purple-600"
                  onClick={handleSendAll}
                  disabled={purchases.length === 0}
                >
                  전체 전송
                </button>
                <button
                  className="px-4 py-2 bg-indigo-500 text-white text-sm rounded hover:bg-indigo-600"
                  onClick={handleDownloadAll}
                  disabled={purchases.length === 0}
                >
                  {selectedPurchaseIds.size > 0
                    ? `${selectedPurchaseIds.size}건 다운로드`
                    : "전체 다운로드"}
                </button>
              </div>
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
                label="매입처명"
                options={purchaseNames}
                labelOnTop={false}
                selectedValues={selectedPurchaseNames}
                onChange={(values) => {
                  const stringValues = values.map((v) => String(v));
                  setSelectedPurchaseNames(stringValues);
                }}
                placeholder="전체"
                enableAutocomplete={true}
                className="w-auto"
              />

              <button
                className="px-4 py-2 bg-green-500 text-white text-sm rounded hover:bg-green-600 disabled:bg-gray-400"
                onClick={fetchPurchases}
                disabled={loading || !startDate || !endDate}
              >
                {loading ? "조회 중..." : "조회"}
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
                {error}
              </div>
            )}

            {/* 테이블 */}
            {loading ? (
              <div className="text-center py-8">조회 중...</div>
            ) : purchases.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                조회할 데이터가 없습니다. 기간을 선택하고 검색 버튼을
                클릭하세요.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-300 px-4 py-2 text-center w-12">
                        <input
                          type="checkbox"
                          checked={
                            filteredPurchases.length > 0 &&
                            filteredPurchases.every((p) =>
                              selectedPurchaseIds.has(p.id),
                            )
                          }
                          onChange={(e) => handleSelectAll(e.target.checked)}
                          className="cursor-pointer"
                        />
                      </th>
                      <th className="border border-gray-300 px-4 py-2 text-left w-12">
                        No.
                      </th>
                      <th className="border border-gray-300 px-4 py-2 text-left">
                        매입처명
                      </th>
                      <th className="border border-gray-300 px-4 py-2 text-center">
                        총 주문 건수
                      </th>
                      <th className="border border-gray-300 px-4 py-2 text-center">
                        발주된 주문
                      </th>
                      <th className="border border-gray-300 px-4 py-2 text-center">
                        미발주 주문
                      </th>
                      <th className="border border-gray-300 px-4 py-2 text-center">
                        전송 방법
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPurchases.map((purchase, index) => (
                      <tr key={purchase.id} className="hover:bg-gray-50">
                        <td className="border border-gray-300 px-4 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={selectedPurchaseIds.has(purchase.id)}
                            onChange={(e) =>
                              handleSelectPurchase(
                                purchase.id,
                                e.target.checked,
                              )
                            }
                            className="cursor-pointer"
                          />
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center">
                          {index + 1}
                        </td>
                        <td
                          className="border border-gray-300 px-4 py-2 cursor-pointer hover:text-blue-600 hover:underline"
                          onClick={() => handlePurchaseClick(purchase)}
                        >
                          {purchase.name}
                        </td>
                        <td
                          className="border border-gray-300 px-4 py-2 text-center cursor-pointer hover:text-blue-600"
                          onClick={() => handlePurchaseClick(purchase)}
                        >
                          {formatNumber(purchase.totalOrders)}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center text-green-600">
                          {formatNumber(purchase.orderedCount)}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center text-red-600 font-semibold">
                          {formatNumber(purchase.unorderedCount)}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center">
                          <div className="flex gap-1 justify-center">
                            {purchase.submitType?.includes("kakaotalk") && (
                              <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded">
                                카카오톡
                              </span>
                            )}
                            {purchase.submitType?.includes("email") && (
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded">
                                이메일
                              </span>
                            )}
                            {(!purchase.submitType ||
                              purchase.submitType.length === 0) && (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {filteredPurchases.length > 0 && (
                    <tfoot>
                      <tr className="bg-gray-100 font-bold">
                        <td
                          className="border border-gray-300 px-4 py-2 text-center"
                          colSpan={3}
                        >
                          합계
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center">
                          {formatNumber(totals.totalOrders)}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center text-green-600">
                          {formatNumber(totals.orderedCount)}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center text-red-600">
                          {formatNumber(totals.unorderedCount)}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center">
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

        {/* 매입처 주문 상세 모달 */}
        {modalOpen && selectedPurchase && (
          <PurchaseOrdersModal
            purchase={selectedPurchase}
            startDate={startDate}
            endDate={endDate}
            onClose={handleCloseModal}
          />
        )}
      </div>
    </>
  );
}
