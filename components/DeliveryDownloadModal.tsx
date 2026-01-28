"use client";

import {useState, useEffect, useMemo} from "react";
import {getAuthHeaders} from "@/utils/api";
import {IoDownload, IoClose, IoSearch, IoTimeOutline} from "react-icons/io5";
import {getTodayDate} from "@/utils/date";

interface FileStat {
  uploadId: number;
  fileName: string;
  createdAt: string;
  totalOrders: number;
  deliveryOrders: number;
}

interface VendorStat {
  vendorName: string;
  files: FileStat[];
  sabangCodeOrders: number;
  totalOrdersForSabang: number;
}

interface DeliveryDownloadModalProps {
  open: boolean;
  onClose: () => void;
}

interface DownloadHistory {
  id: number;
  vendor_name: string | null;
  file_name: string;
  form_type: "운송장" | "사방넷 AB" | "전체 사방넷 AB";
  downloaded_at: string;
  upload_id?: number | null;
  date_filter?: string | null;
}

export default function DeliveryDownloadModal({
  open,
  onClose,
}: DeliveryDownloadModalProps) {
  const [vendors, setVendors] = useState<VendorStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadingSabangnet, setDownloadingSabangnet] = useState<
    string | null
  >(null);
  const [downloadingAllSabangnet, setDownloadingAllSabangnet] = useState(false);
  // 기간 선택 (시작일, 종료일)
  const [startDate, setStartDate] = useState<string>(getTodayDate());
  const [endDate, setEndDate] = useState<string>(getTodayDate());
  const [isSearched, setIsSearched] = useState(false); // 조회 버튼 클릭 여부
  const [vendorSearchQuery, setVendorSearchQuery] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [downloadHistory, setDownloadHistory] = useState<DownloadHistory[]>([]);

  // 히스토리 로드
  useEffect(() => {
    if (open) {
      loadDownloadHistory();
    }
  }, [open]);

  const loadDownloadHistory = async () => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch("/api/upload/download-history/list", {
        headers,
      });
      const result = await response.json();

      if (result.success) {
        setDownloadHistory(result.data || []);
      } else {
        console.error("히스토리 로드 실패:", result.error);
      }
    } catch (error) {
      console.error("히스토리 로드 실패:", error);
    }
  };

  const deleteHistoryItem = async (id: number) => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch(
        `/api/upload/download-history/list?id=${id}`,
        {
          method: "DELETE",
          headers,
        },
      );
      const result = await response.json();

      if (result.success) {
        await loadDownloadHistory();
      } else {
        console.error("히스토리 삭제 실패:", result.error);
        alert("히스토리 삭제에 실패했습니다: " + result.error);
      }
    } catch (error: any) {
      console.error("히스토리 삭제 실패:", error);
      alert("히스토리 삭제에 실패했습니다: " + error.message);
    }
  };

  const deleteAllHistory = async () => {
    if (
      !confirm(
        "모든 히스토리를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.",
      )
    ) {
      return;
    }

    try {
      const headers = getAuthHeaders();
      const response = await fetch("/api/upload/download-history/list", {
        method: "DELETE",
        headers,
      });
      const result = await response.json();

      if (result.success) {
        setDownloadHistory([]);
      } else {
        console.error("히스토리 삭제 실패:", result.error);
        alert("히스토리 삭제에 실패했습니다: " + result.error);
      }
    } catch (error: any) {
      console.error("히스토리 삭제 실패:", error);
      alert("히스토리 삭제에 실패했습니다: " + error.message);
    }
  };

  // 업체 리스트 조회
  useEffect(() => {
    if (open) {
      // 모달이 열릴 때 날짜를 오늘로 초기화하고 자동 조회
      const today = getTodayDate();
      setStartDate(today);
      setEndDate(today);
      setVendorSearchQuery(""); // 모달이 열릴 때 검색어 초기화
      setIsSearched(false); // 조회 상태 초기화
      // 오늘 날짜로 자동 조회
      fetchVendors(today, today);
      setIsSearched(true);
    } else {
      setVendors([]);
      setVendorSearchQuery(""); // 모달이 닫힐 때 검색어 초기화
      setIsSearched(false);
    }
  }, [open]);

  const fetchVendors = async (fromDate?: string, toDate?: string) => {
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      // 기간 파라미터를 쿼리스트링으로 전달
      const params = new URLSearchParams();
      if (fromDate) params.append("startDate", fromDate);
      if (toDate) params.append("endDate", toDate);

      const url = `/api/upload/delivery-vendors${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url, {
        headers,
      });
      const result = await response.json();

      if (result.success) {
        setVendors(result.data || []);
      } else {
        console.error("업체 리스트 조회 실패:", result.error);
        alert("업체 리스트를 불러오는데 실패했습니다: " + result.error);
      }
    } catch (error: any) {
      console.error("업체 리스트 조회 실패:", error);
      alert("업체 리스트를 불러오는데 실패했습니다: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // 조회 버튼 클릭 핸들러
  const handleSearch = () => {
    if (!startDate || !endDate) {
      alert("시작일과 종료일을 선택해주세요.");
      return;
    }
    if (startDate > endDate) {
      alert("시작일이 종료일보다 늦을 수 없습니다.");
      return;
    }
    fetchVendors(startDate, endDate);
    setIsSearched(true);
  };

  const handleDownload = async (
    vendorName: string,
    uploadId: number,
    fileName: string,
  ) => {
    const downloadKey = `${vendorName}_${uploadId}`;
    setDownloading(downloadKey);
    try {
      const headers = getAuthHeaders();
      const response = await fetch("/api/upload/download-delivery", {
        method: "POST",
        headers,
        body: JSON.stringify({vendorName, uploadId}),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "다운로드 실패");
      }

      // 파일 다운로드
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      // Content-Disposition 헤더에서 파일명 추출 시도
      const contentDisposition = response.headers.get("Content-Disposition");
      let downloadFileName = `${vendorName}_운송장.xlsx`;
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(
          /filename\*=UTF-8''(.+)/,
        );
        if (fileNameMatch) {
          downloadFileName = decodeURIComponent(fileNameMatch[1]);
        } else {
          const fileNameMatch2 = contentDisposition.match(/filename="(.+)"/);
          if (fileNameMatch2) {
            downloadFileName = fileNameMatch2[1];
          }
        }
      }

      a.download = downloadFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      // 히스토리는 서버에서 자동 저장됨 (다운로드 API에서 처리)
      // UI 업데이트를 위해 히스토리 다시 로드
      setTimeout(() => {
        loadDownloadHistory();
      }, 500);
    } catch (error: any) {
      console.error("운송장 다운로드 실패:", error);
      alert("운송장 다운로드에 실패했습니다: " + error.message);
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadSabangnetAB = async (vendorName: string) => {
    const downloadKey = `sabangnet_${vendorName}`;
    setDownloadingSabangnet(downloadKey);
    try {
      const headers = getAuthHeaders();

      // 먼저 데이터 존재 여부 확인
      const checkResponse = await fetch("/api/upload/check-sabangnet-ab", {
        method: "POST",
        headers,
        body: JSON.stringify({
          vendorName,
          allVendors: false,
          startDate,
          endDate,
        }),
      });

      if (!checkResponse.ok) {
        throw new Error("데이터 확인 실패");
      }

      const checkResult = await checkResponse.json();

      if (!checkResult.hasData) {
        alert(`${startDate} ~ ${endDate} 기간에 다운로드할 데이터가 없습니다.`);
        return;
      }

      // 데이터가 있으면 다운로드 진행
      const response = await fetch("/api/upload/download-sabangnet-ab", {
        method: "POST",
        headers,
        body: JSON.stringify({
          vendorName,
          allVendors: false,
          startDate,
          endDate,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "다운로드 실패");
      }

      // 파일 다운로드
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      // Content-Disposition 헤더에서 파일명 추출 시도
      const contentDisposition = response.headers.get("Content-Disposition");
      let downloadFileName = `${vendorName}_사방넷AB.zip`;
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(
          /filename\*=UTF-8''(.+)/,
        );
        if (fileNameMatch) {
          downloadFileName = decodeURIComponent(fileNameMatch[1]);
        } else {
          const fileNameMatch2 = contentDisposition.match(/filename="(.+)"/);
          if (fileNameMatch2) {
            downloadFileName = fileNameMatch2[1];
          }
        }
      }

      a.download = downloadFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      // 히스토리는 서버에서 자동 저장됨 (다운로드 API에서 처리)
      // UI 업데이트를 위해 히스토리 다시 로드
      setTimeout(() => {
        loadDownloadHistory();
      }, 500);
    } catch (error: any) {
      console.error("사방넷 AB 다운로드 실패:", error);
      alert("사방넷 AB 다운로드에 실패했습니다: " + error.message);
    } finally {
      setDownloadingSabangnet(null);
    }
  };

  const handleDownloadAllSabangnetAB = async () => {
    setDownloadingAllSabangnet(true);
    try {
      const headers = getAuthHeaders();

      // 활성화된 업체 목록 추출 (sabang_code 입력률 1% 이상인 업체만)
      const activeVendorNames = vendors
        .filter((vendor) => {
          const sabangProgress =
            vendor.totalOrdersForSabang > 0
              ? (vendor.sabangCodeOrders / vendor.totalOrdersForSabang) * 100
              : 0;
          return sabangProgress >= 1;
        })
        .map((vendor) => vendor.vendorName);

      if (activeVendorNames.length === 0) {
        alert("다운로드할 데이터가 없습니다.");
        return;
      }

      // 활성화된 업체들만 다운로드 진행
      const response = await fetch("/api/upload/download-sabangnet-ab", {
        method: "POST",
        headers,
        body: JSON.stringify({
          allVendors: true,
          activeVendorNames: activeVendorNames,
          startDate,
          endDate,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "다운로드 실패");
      }

      // 파일 다운로드
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      // Content-Disposition 헤더에서 파일명 추출 시도
      const contentDisposition = response.headers.get("Content-Disposition");
      let downloadFileName = `전체_사방넷AB.zip`;
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(
          /filename\*=UTF-8''(.+)/,
        );
        if (fileNameMatch) {
          downloadFileName = decodeURIComponent(fileNameMatch[1]);
        } else {
          const fileNameMatch2 = contentDisposition.match(/filename="(.+)"/);
          if (fileNameMatch2) {
            downloadFileName = fileNameMatch2[1];
          }
        }
      }

      a.download = downloadFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      // 히스토리는 서버에서 자동 저장됨 (다운로드 API에서 처리)
      // UI 업데이트를 위해 히스토리 다시 로드
      setTimeout(() => {
        loadDownloadHistory();
      }, 500);
    } catch (error: any) {
      console.error("전체 사방넷 AB 다운로드 실패:", error);
      alert("전체 사방넷 AB 다운로드에 실패했습니다: " + error.message);
    } finally {
      setDownloadingAllSabangnet(false);
    }
  };

  // 검색어에 따라 업체 필터링
  const filteredVendors = useMemo(() => {
    if (!vendorSearchQuery.trim()) {
      return vendors;
    }
    const query = vendorSearchQuery.trim().toLowerCase();
    return vendors.filter((vendor) =>
      vendor.vendorName.toLowerCase().includes(query),
    );
  }, [vendors, vendorSearchQuery]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 backdrop-blur-xs flex justify-center items-center z-50 bg-[#00000053]"
    >
      <div
        className="bg-white rounded-lg w-[95vw] max-w-6xl h-[90vh] relative z-60 flex overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 히스토리 사이드바 */}
        <div
          className={`bg-gray-50 border-r border-gray-200 transition-all duration-300 ease-in-out overflow-hidden ${
            showHistory ? "w-96" : "w-0"
          }`}
        >
          <div className="h-full flex flex-col w-96">
            {/* 히스토리 헤더 */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-bold">다운로드 히스토리</h2>
              <button
                onClick={() => setShowHistory(false)}
                className="text-gray-500 hover:text-gray-700 text-xl leading-none"
                aria-label="Close"
              >
                <IoClose />
              </button>
            </div>

            {/* 히스토리 리스트 */}
            <div className="flex-1 overflow-y-auto p-4">
              {downloadHistory.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-600 text-sm">
                    다운로드 히스토리가 없습니다.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-4 gap-2 pb-2 border-b border-gray-200 font-semibold text-gray-700 text-xs">
                    <div>시간</div>
                    <div>업체</div>
                    <div>파일명</div>
                    <div className="flex items-center justify-between">
                      <span>양식</span>
                      <span>작업</span>
                    </div>
                  </div>
                  {downloadHistory.map((item) => {
                    const date = new Date(item.downloaded_at);
                    const formattedDate = `${date.getFullYear()}-${String(
                      date.getMonth() + 1,
                    ).padStart(2, "0")}-${String(date.getDate()).padStart(
                      2,
                      "0",
                    )} ${String(date.getHours()).padStart(2, "0")}:${String(
                      date.getMinutes(),
                    ).padStart(2, "0")}:${String(date.getSeconds()).padStart(
                      2,
                      "0",
                    )}`;

                    return (
                      <div
                        key={item.id}
                        className="grid grid-cols-4 gap-2 py-2 border-b border-gray-100 hover:bg-white transition-colors text-xs"
                      >
                        <div className="text-gray-600 wrap-break-words">
                          {formattedDate}
                        </div>
                        <div className="text-gray-800 font-medium wrap-break-words">
                          {item.vendor_name || "-"}
                        </div>
                        <div className="text-gray-700 wrap-break-words">
                          {item.file_name}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`inline-block px-2 py-1 rounded text-xs font-semibold whitespace-nowrap ${
                              item.form_type === "운송장"
                                ? "bg-blue-100 text-blue-700"
                                : item.form_type === "사방넷 AB"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-purple-100 text-purple-700"
                            }`}
                          >
                            {item.form_type}
                          </span>
                          <button
                            onClick={() => deleteHistoryItem(item.id)}
                            className="text-red-500 hover:text-red-700 text-xs whitespace-nowrap"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 히스토리 사이드바 하단 버튼 */}
            <div className="p-4 border-t border-gray-200">
              <button
                onClick={deleteAllHistory}
                className="w-full px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors text-sm disabled:bg-gray-300 disabled:cursor-not-allowed"
                disabled={downloadHistory.length === 0}
              >
                전체 삭제
              </button>
            </div>
          </div>
        </div>

        {/* 메인 콘텐츠 영역 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 헤더 */}
          <div className="flex items-center justify-between p-8 pb-4">
            <h2 className="text-2xl font-bold">운송장 다운로드</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-3xl leading-none"
              aria-label="Close"
            >
              <IoClose />
            </button>
          </div>

          {/* 스크롤 가능한 콘텐츠 */}
          <div className="flex-1 overflow-y-auto px-8">
            {/* 전체 AB 다운로드 버튼 */}
            <div className="mb-6 flex justify-end items-center gap-3">
              {(() => {
                // 활성화된 AB 버튼이 있는 업체 확인 (sabang_code 입력률 1% 이상)
                const hasActiveSabangnetButton = vendors.some((vendor) => {
                  const sabangProgress =
                    vendor.totalOrdersForSabang > 0
                      ? (vendor.sabangCodeOrders /
                          vendor.totalOrdersForSabang) *
                        100
                      : 0;
                  return sabangProgress >= 1;
                });

                return (
                  <div className="w-full h-auto flex items-center justify-between py-0.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          if (!showHistory) {
                            loadDownloadHistory();
                          }
                          setShowHistory(!showHistory);
                        }}
                        className={`h-full px-4 py-2 rounded-md text-sm font-semibold transition-colors flex items-center gap-2 ${
                          showHistory
                            ? "bg-blue-600 hover:bg-blue-700 text-white"
                            : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                        }`}
                        title="다운로드 히스토리"
                      >
                        <IoTimeOutline className="text-lg" />
                      </button>

                      <div className="w-[240px]">
                        <div className="relative">
                          <IoSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                          <input
                            type="text"
                            placeholder="업체명으로 검색..."
                            value={vendorSearchQuery}
                            onChange={(e) =>
                              setVendorSearchQuery(e.target.value)
                            }
                            className="w-full h-full pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <span className="text-gray-500">~</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <button
                        onClick={handleSearch}
                        disabled={loading}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-semibold transition-colors disabled:bg-gray-400"
                      >
                        {loading ? "조회 중..." : "조회"}
                      </button>
                      <button
                        onClick={handleDownloadAllSabangnetAB}
                        disabled={
                          downloadingAllSabangnet ||
                          !hasActiveSabangnetButton ||
                          !isSearched
                        }
                        className={`px-6 py-2 rounded-md text-sm font-semibold transition-colors flex items-center gap-2 ${
                          downloadingAllSabangnet ||
                          !hasActiveSabangnetButton ||
                          !isSearched
                            ? "bg-gray-400 cursor-not-allowed text-white"
                            : "bg-green-600 hover:bg-green-700 text-white"
                        }`}
                      >
                        {downloadingAllSabangnet ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <span>다운로드 중...</span>
                          </>
                        ) : (
                          <>
                            <IoDownload className="text-lg" />
                            <span>전체 AB 다운</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* 업체 검색 인풋 */}

            {/* 로딩 상태 */}
            {loading && (
              <div className="text-center py-8">
                <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-4 text-gray-600">
                  업체 리스트를 불러오는 중...
                </p>
              </div>
            )}

            {/* 업체 리스트 */}
            {!loading && filteredVendors.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-600">
                  {vendorSearchQuery.trim()
                    ? "검색 결과가 없습니다."
                    : "3일전~오늘 업로드한 업체가 없습니다."}
                </p>
              </div>
            )}

            {!loading && filteredVendors.length > 0 && (
              <div className="space-y-6">
                {filteredVendors.map((vendor) => (
                  <div
                    key={vendor.vendorName}
                    className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-800">
                        {vendor.vendorName}
                      </h3>

                      {/* 업체별 사방넷 AB 버튼 */}
                      {(() => {
                        const sabangProgress =
                          vendor.totalOrdersForSabang > 0
                            ? (vendor.sabangCodeOrders /
                                vendor.totalOrdersForSabang) *
                              100
                            : 0;
                        const canDownloadSabang = sabangProgress >= 1;
                        const sabangDownloadKey = `sabangnet_${vendor.vendorName}`;

                        return (
                          <button
                            onClick={() =>
                              handleDownloadSabangnetAB(vendor.vendorName)
                            }
                            disabled={
                              downloadingSabangnet === sabangDownloadKey ||
                              !canDownloadSabang ||
                              !isSearched
                            }
                            className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors flex items-center gap-2 ${
                              downloadingSabangnet === sabangDownloadKey
                                ? "bg-gray-400 cursor-not-allowed"
                                : !canDownloadSabang
                                  ? "bg-gray-300 cursor-not-allowed text-gray-500"
                                  : "bg-green-600 hover:bg-green-700 text-white"
                            }`}
                          >
                            {downloadingSabangnet === sabangDownloadKey ? (
                              <>
                                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                <span>다운로드 중...</span>
                              </>
                            ) : (
                              <>
                                <IoDownload className="text-base" />
                                <span>사방넷 AB</span>
                              </>
                            )}
                          </button>
                        );
                      })()}
                    </div>

                    {/* 사방넷 코드 입력 현황 Progress Bar */}
                    {vendor.totalOrdersForSabang > 0 && (
                      <div className="mb-4">
                        <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                          <span>
                            사방넷 코드 입력:{" "}
                            <strong>{vendor.sabangCodeOrders}</strong>건 /{" "}
                            <strong>{vendor.totalOrdersForSabang}</strong>건
                          </span>
                          <span>
                            {Math.round(
                              (vendor.sabangCodeOrders /
                                vendor.totalOrdersForSabang) *
                                100,
                            )}
                            %
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-green-600 h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${
                                (vendor.sabangCodeOrders /
                                  vendor.totalOrdersForSabang) *
                                100
                              }%`,
                            }}
                          ></div>
                        </div>
                      </div>
                    )}

                    {vendor.files.length === 0 ? (
                      <p className="text-sm text-gray-500">파일이 없습니다.</p>
                    ) : (
                      <div className="space-y-4">
                        {vendor.files.map((file) => {
                          const progress =
                            file.totalOrders > 0
                              ? (file.deliveryOrders / file.totalOrders) * 100
                              : 0;

                          // progress가 1% 이상이면 다운로드 가능
                          const canDownload = progress >= 1;
                          const downloadKey = `${vendor.vendorName}_${file.uploadId}`;

                          return (
                            <div
                              key={file.uploadId}
                              className="border border-gray-100 rounded-lg p-4 bg-gray-50"
                            >
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex-1">
                                  <div className="text-sm font-medium text-gray-700 mb-1">
                                    {file.fileName}
                                  </div>
                                  <div className="flex items-center gap-4 text-xs text-gray-600">
                                    <span>
                                      운송장 입력:{" "}
                                      <strong>{file.deliveryOrders}</strong>건
                                    </span>
                                    <span>
                                      총 주문:{" "}
                                      <strong>{file.totalOrders}</strong>건
                                    </span>
                                  </div>
                                </div>
                                <button
                                  onClick={() =>
                                    handleDownload(
                                      vendor.vendorName,
                                      file.uploadId,
                                      file.fileName,
                                    )
                                  }
                                  disabled={
                                    downloading === downloadKey || !canDownload
                                  }
                                  className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors flex items-center gap-2 ${
                                    downloading === downloadKey
                                      ? "bg-gray-400 cursor-not-allowed"
                                      : !canDownload
                                        ? "bg-gray-300 cursor-not-allowed text-gray-500"
                                        : "bg-blue-600 hover:bg-blue-700 text-white"
                                  }`}
                                >
                                  {downloading === downloadKey ? (
                                    <>
                                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                      <span>다운로드 중...</span>
                                    </>
                                  ) : (
                                    <>
                                      <IoDownload className="text-base" />
                                      <span>다운로드</span>
                                    </>
                                  )}
                                </button>
                              </div>

                              {/* Progress Bar */}
                              {file.totalOrders > 0 && (
                                <div className="mt-3">
                                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                                    <span>진행률</span>
                                    <span>{Math.round(progress)}%</span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                    <div
                                      className="bg-blue-600 h-full rounded-full transition-all duration-300"
                                      style={{width: `${progress}%`}}
                                    ></div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 닫기 버튼 */}
            <div className="mt-6 mb-8 flex justify-end">
              <button
                onClick={onClose}
                className="px-6 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
