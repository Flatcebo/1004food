"use client";

import {useState, useEffect, useCallback} from "react";
import ModalPortal from "@/components/ModalPortal";
import {getAuthHeaders} from "@/utils/api";

interface OrderSnapshot {
  id: number;
  orderBatchId: number | null;
  sendType: string;
  fileName: string;
  headers: string[];
  rowData: string[][];
  createdAt: string;
  batchNumber: number | null;
  batchDate: string | null;
}

interface OrderHistoryModalProps {
  purchaseId: number;
  purchaseName: string;
  onClose: () => void;
}

const SEND_TYPE_LABEL: Record<string, string> = {
  download: "다운로드",
  email: "이메일 발송",
  kakaotalk: "카카오톡 발송",
};

export default function OrderHistoryModal({
  purchaseId,
  purchaseName,
  onClose,
}: OrderHistoryModalProps) {
  const [snapshots, setSnapshots] = useState<OrderSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [selectedSnapshot, setSelectedSnapshot] =
    useState<OrderSnapshot | null>(null);

  const fetchSnapshots = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/purchase-orders/order-snapshots?purchaseId=${purchaseId}`,
        {headers: getAuthHeaders()},
      );
      const result = await res.json();
      if (result.success) {
        setSnapshots(result.data || []);
      } else {
        setError(result.error || "조회에 실패했습니다.");
      }
    } catch (err: any) {
      setError(err.message || "조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [purchaseId]);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  const formatDateTime = (str: string) => {
    if (!str) return "";
    const d = new Date(str);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 bg-[#00000080] flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl w-[95vw] max-w-6xl h-[90vh] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-xl font-bold">{purchaseName} - 발주 내역</h2>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              닫기
            </button>
          </div>

          <div className="flex-1 flex overflow-hidden">
            {/* 왼쪽: 발주 내역 목록 */}
            <div className="w-80 border-r overflow-y-auto p-4">
              {loading ? (
                <div className="text-center py-8 text-gray-500">조회 중...</div>
              ) : error ? (
                <div className="text-center py-8 text-red-500">{error}</div>
              ) : snapshots.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  발주 내역이 없습니다.
                </div>
              ) : (
                <div className="space-y-2">
                  {snapshots.map((snap) => (
                    <button
                      key={snap.id}
                      onClick={() => setSelectedSnapshot(snap)}
                      className={`w-full text-left p-3 rounded border transition-colors ${
                        selectedSnapshot?.id === snap.id
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-blue-600">
                          {snap.batchNumber != null
                            ? `${snap.batchNumber}차`
                            : "-"}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            snap.sendType === "download"
                              ? "bg-green-100 text-green-700"
                              : snap.sendType === "email"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {SEND_TYPE_LABEL[snap.sendType] || snap.sendType}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {formatDateTime(snap.createdAt)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {snap.rowData?.length || 0}건
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 오른쪽: 선택한 발주서 원본 보기 */}
            <div className="flex-1 overflow-auto p-4">
              {selectedSnapshot ? (
                <div>
                  <div className="mb-4 flex items-center gap-2">
                    <span
                      className={`text-sm px-3 py-1 rounded ${
                        selectedSnapshot.sendType === "download"
                          ? "bg-green-100 text-green-700"
                          : selectedSnapshot.sendType === "email"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {SEND_TYPE_LABEL[selectedSnapshot.sendType] ||
                        selectedSnapshot.sendType}
                    </span>
                    <span className="text-sm text-gray-500">
                      {formatDateTime(selectedSnapshot.createdAt)}
                    </span>
                  </div>
                  <div className="overflow-x-auto border border-gray-300 rounded">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-gray-100">
                          {selectedSnapshot.headers.map((h, i) => (
                            <th
                              key={i}
                              className="border border-gray-300 px-2 py-2 text-left font-bold whitespace-nowrap"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedSnapshot.rowData || []).map((row, rowIdx) => {
                          const colCount = Math.max(
                            selectedSnapshot.headers.length,
                            row.length,
                          );
                          return (
                            <tr key={rowIdx} className="hover:bg-gray-50">
                              {Array.from({length: colCount}).map(
                                (_, colIdx) => (
                                  <td
                                    key={colIdx}
                                    className="border border-gray-300 px-2 py-1 whitespace-nowrap"
                                  >
                                    {row[colIdx] ?? ""}
                                  </td>
                                ),
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  발주 내역을 선택하면 원본이 표시됩니다.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
