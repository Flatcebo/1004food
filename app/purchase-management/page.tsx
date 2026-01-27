"use client";

import {useState, useEffect, useCallback} from "react";
import {useRouter} from "next/navigation";
import {useAuthStore} from "@/stores/authStore";
import {getAuthHeaders} from "@/utils/api";

interface Purchase {
  id: number;
  name: string;
  submitType: string[];
  email: string | null;
  kakaotalk: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function PurchaseManagementPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<Partial<Purchase>>({});
  const [searchValue, setSearchValue] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [mounted, setMounted] = useState(false);

  // 클라이언트 마운트 확인
  useEffect(() => {
    setMounted(true);
  }, []);

  // 접근 권한 체크 (관리자만)
  useEffect(() => {
    if (mounted && user && user.grade !== "관리자") {
      alert("관리자만 접근할 수 있습니다.");
      router.push("/");
    }
  }, [mounted, user, router]);

  // 매입처 목록 조회
  const fetchPurchases = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      if (searchValue) {
        params.append("search", searchValue);
      }

      const response = await fetch(
        `/api/purchase-management?${params.toString()}`,
        {
          headers: getAuthHeaders(),
        }
      );

      const result = await response.json();
      if (result.success) {
        setPurchases(result.data || []);
      } else {
        setError(result.error || "조회에 실패했습니다.");
      }
    } catch (err: any) {
      setError(err.message || "조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [searchValue]);

  // 초기 데이터 로드 (mounted 후에만 실행)
  useEffect(() => {
    if (mounted && user?.grade === "관리자") {
      fetchPurchases();
    }
  }, [mounted, user, fetchPurchases]);

  // 수정 시작
  const handleEdit = useCallback((purchase: Purchase) => {
    setEditingId(purchase.id);
    setEditData({
      name: purchase.name,
      email: purchase.email || "",
      kakaotalk: purchase.kakaotalk || "",
      submitType: purchase.submitType || [],
    });
  }, []);

  // 수정 취소
  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditData({});
  }, []);

  // 수정 저장
  const handleSave = useCallback(async () => {
    if (!editingId) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/purchase-management/${editingId}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: editData.name,
          email: editData.email || null,
          kakaotalk: editData.kakaotalk || null,
          submitType: editData.submitType || [],
        }),
      });

      const result = await response.json();
      if (result.success) {
        alert("저장되었습니다.");
        setEditingId(null);
        setEditData({});
        fetchPurchases();
      } else {
        alert(`저장 실패: ${result.error}`);
      }
    } catch (err: any) {
      alert(`저장 오류: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  }, [editingId, editData, fetchPurchases]);

  // submit_type 체크박스 변경
  const handleSubmitTypeChange = useCallback(
    (type: "kakaotalk" | "email", checked: boolean) => {
      setEditData((prev) => {
        const currentTypes = prev.submitType || [];
        if (checked) {
          return {
            ...prev,
            submitType: [...currentTypes.filter((t) => t !== type), type],
          };
        } else {
          return {
            ...prev,
            submitType: currentTypes.filter((t) => t !== type),
          };
        }
      });
    },
    []
  );

  // 접근 권한이 없으면 렌더링하지 않음 (클라이언트에서만 체크)
  if (!mounted || !user || user.grade !== "관리자") {
    return null;
  }

  return (
    <div className="w-full h-full flex flex-col items-start justify-start pt-4 px-4">
      <div className="w-full bg-[#ffffff] rounded-lg px-8 shadow-md pb-12">
        <div className="w-full mt-6">
          <div className="mb-4 flex gap-4 items-center justify-between">
            <h2 className="text-xl font-bold">매입처 관리</h2>
          </div>

          {/* 검색 영역 */}
          <div className="mb-6 flex gap-4 items-center">
            <input
              type="text"
              placeholder="매입처명 검색..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded w-64"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  fetchPurchases();
                }
              }}
            />
            <button
              className="px-4 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
              onClick={fetchPurchases}
              disabled={loading}
            >
              {loading ? "검색 중..." : "검색"}
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
              매입처가 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-4 py-2 text-left w-12">
                      No.
                    </th>
                    <th className="border border-gray-300 px-4 py-2 text-left">
                      매입처명
                    </th>
                    <th className="border border-gray-300 px-4 py-2 text-center">
                      이메일
                    </th>
                    <th className="border border-gray-300 px-4 py-2 text-center">
                      카카오톡
                    </th>
                    <th className="border border-gray-300 px-4 py-2 text-center">
                      전송 방법
                    </th>
                    <th className="border border-gray-300 px-4 py-2 text-center w-32">
                      작업
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((purchase, index) => (
                    <tr key={purchase.id} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-4 py-2 text-center">
                        {index + 1}
                      </td>
                      <td className="border border-gray-300 px-4 py-2">
                        {editingId === purchase.id ? (
                          <input
                            type="text"
                            value={editData.name || ""}
                            onChange={(e) =>
                              setEditData((prev) => ({
                                ...prev,
                                name: e.target.value,
                              }))
                            }
                            className="w-full px-2 py-1 border border-gray-300 rounded"
                          />
                        ) : (
                          purchase.name
                        )}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-center">
                        {editingId === purchase.id ? (
                          <input
                            type="email"
                            value={editData.email || ""}
                            onChange={(e) =>
                              setEditData((prev) => ({
                                ...prev,
                                email: e.target.value,
                              }))
                            }
                            placeholder="이메일 입력"
                            className="w-full px-2 py-1 border border-gray-300 rounded"
                          />
                        ) : (
                          purchase.email || "-"
                        )}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-center">
                        {editingId === purchase.id ? (
                          <input
                            type="text"
                            value={editData.kakaotalk || ""}
                            onChange={(e) =>
                              setEditData((prev) => ({
                                ...prev,
                                kakaotalk: e.target.value,
                              }))
                            }
                            placeholder="카카오톡 ID 입력"
                            className="w-full px-2 py-1 border border-gray-300 rounded"
                          />
                        ) : (
                          purchase.kakaotalk || "-"
                        )}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-center">
                        {editingId === purchase.id ? (
                          <div className="flex gap-4 justify-center">
                            <label className="flex items-center gap-1 text-sm">
                              <input
                                type="checkbox"
                                checked={editData.submitType?.includes("email") || false}
                                onChange={(e) =>
                                  handleSubmitTypeChange("email", e.target.checked)
                                }
                              />
                              이메일
                            </label>
                            <label className="flex items-center gap-1 text-sm">
                              <input
                                type="checkbox"
                                checked={editData.submitType?.includes("kakaotalk") || false}
                                onChange={(e) =>
                                  handleSubmitTypeChange("kakaotalk", e.target.checked)
                                }
                              />
                              카카오톡
                            </label>
                          </div>
                        ) : (
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
                        )}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-center">
                        {editingId === purchase.id ? (
                          <div className="flex gap-2 justify-center">
                            <button
                              onClick={handleSave}
                              disabled={isSaving}
                              className="px-3 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600 disabled:bg-gray-400"
                            >
                              {isSaving ? "저장 중..." : "저장"}
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="px-3 py-1 bg-gray-500 text-white text-xs rounded hover:bg-gray-600"
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleEdit(purchase)}
                            className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
                          >
                            수정
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
