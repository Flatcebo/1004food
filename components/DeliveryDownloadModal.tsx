"use client";

import {useState, useEffect} from "react";
import {getAuthHeaders} from "@/utils/api";
import {IoDownload, IoClose} from "react-icons/io5";

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

  // 업체 리스트 조회
  useEffect(() => {
    if (open) {
      fetchVendors();
    } else {
      setVendors([]);
    }
  }, [open]);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const response = await fetch("/api/upload/delivery-vendors", {
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

  const handleDownload = async (
    vendorName: string,
    uploadId: number,
    fileName: string
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
          /filename\*=UTF-8''(.+)/
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
        body: JSON.stringify({vendorName, allVendors: false}),
      });

      if (!checkResponse.ok) {
        throw new Error("데이터 확인 실패");
      }

      const checkResult = await checkResponse.json();

      if (!checkResult.hasData) {
        alert("다운로드할 데이터가 없습니다.");
        return;
      }

      // 데이터가 있으면 다운로드 진행
      const response = await fetch("/api/upload/download-sabangnet-ab", {
        method: "POST",
        headers,
        body: JSON.stringify({vendorName, allVendors: false}),
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
          /filename\*=UTF-8''(.+)/
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
          /filename\*=UTF-8''(.+)/
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
    } catch (error: any) {
      console.error("전체 사방넷 AB 다운로드 실패:", error);
      alert("전체 사방넷 AB 다운로드에 실패했습니다: " + error.message);
    } finally {
      setDownloadingAllSabangnet(false);
    }
  };

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 backdrop-blur-xs flex justify-center items-center z-50 bg-[#00000053]"
    >
      <div
        className="bg-white p-8 rounded-lg w-[90vw] max-w-4xl max-h-[90vh] overflow-auto relative z-60"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">운송장 다운로드</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-3xl leading-none"
            aria-label="Close"
          >
            <IoClose />
          </button>
        </div>

        {/* 전체 AB 다운로드 버튼 */}
        <div className="mb-6 flex justify-end">
          {(() => {
            // 활성화된 AB 버튼이 있는 업체 확인 (sabang_code 입력률 1% 이상)
            const hasActiveSabangnetButton = vendors.some((vendor) => {
              const sabangProgress =
                vendor.totalOrdersForSabang > 0
                  ? (vendor.sabangCodeOrders / vendor.totalOrdersForSabang) *
                    100
                  : 0;
              return sabangProgress >= 1;
            });

            return (
              <button
                onClick={handleDownloadAllSabangnetAB}
                disabled={downloadingAllSabangnet || !hasActiveSabangnetButton}
                className={`px-6 py-2 rounded-md text-sm font-semibold transition-colors flex items-center gap-2 ${
                  downloadingAllSabangnet || !hasActiveSabangnetButton
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
            );
          })()}
        </div>

        {/* 로딩 상태 */}
        {loading && (
          <div className="text-center py-8">
            <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-gray-600">업체 리스트를 불러오는 중...</p>
          </div>
        )}

        {/* 업체 리스트 */}
        {!loading && vendors.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-600">어제~오늘 업로드한 업체가 없습니다.</p>
          </div>
        )}

        {!loading && vendors.length > 0 && (
          <div className="space-y-6">
            {vendors.map((vendor) => (
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
                          !canDownloadSabang
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
                            100
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
                                  총 주문: <strong>{file.totalOrders}</strong>건
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() =>
                                handleDownload(
                                  vendor.vendorName,
                                  file.uploadId,
                                  file.fileName
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
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
