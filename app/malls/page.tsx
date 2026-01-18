"use client";

import {useState, useEffect} from "react";
import {useRouter} from "next/navigation";
import {useAuthStore} from "@/stores/authStore";
import {getAuthHeaders} from "@/utils/api";
import MultiSelectDropdown from "@/components/MultiSelectDropdown";

interface Mall {
  id: number;
  code: string;
  name: string;
  companyName?: string;
  representativeName?: string;
  businessNumber?: string;
  marketCategory?: string;
  postalCode?: string;
  address1?: string;
  address2?: string;
  businessType?: string;
  businessCategory?: string;
  registrationDate?: string;
  createdAt: string;
  updatedAt: string;
  assignedUsers?: AssignedUser[];
}

interface AssignedUser {
  id: number;
  name: string;
  grade: string;
  position?: string;
  role?: string;
}

interface User {
  id: number;
  name: string;
  grade: string;
  position?: string;
  role?: string;
}

export default function MallsPage() {
  const router = useRouter();
  const {user: currentUser} = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [malls, setMalls] = useState<Mall[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingMall, setEditingMall] = useState<Mall | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [editFormData, setEditFormData] = useState({
    name: "",
    marketCategory: "",
    assignedUserIds: [] as number[],
  });
  const [createFormData, setCreateFormData] = useState({
    name: "",
    marketCategory: "",
    assignedUserIds: [] as number[],
  });
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  // 클라이언트 마운트 확인
  useEffect(() => {
    setMounted(true);
  }, []);

  // 관리자 권한 체크
  useEffect(() => {
    if (mounted && currentUser && currentUser.grade !== "관리자") {
      router.push("/");
    }
  }, [mounted, currentUser, router]);

  // 쇼핑몰 목록 조회
  const fetchMalls = async () => {
    try {
      setIsLoading(true);
      const headers = getAuthHeaders();
      const response = await fetch("/api/mall?limit=1000", {
        headers,
      });
      const result = await response.json();

      if (!result.success) {
        setError(result.error || "쇼핑몰 목록을 불러오는데 실패했습니다.");
        return;
      }

      setMalls(result.data || []);
    } catch (err: any) {
      console.error("쇼핑몰 목록 조회 오류:", err);
      setError("쇼핑몰 목록을 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  // 사용자 목록 조회
  const fetchUsers = async () => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch("/api/users", {
        headers,
      });
      const result = await response.json();

      if (result.success) {
        setUsers(result.data || []);
      }
    } catch (err: any) {
      console.error("사용자 목록 조회 오류:", err);
    }
  };

  useEffect(() => {
    if (currentUser?.grade === "관리자") {
      fetchMalls();
      fetchUsers();
    }
  }, [currentUser]);

  // 수정 모달 열기
  const handleEdit = async (mall: Mall) => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch(`/api/mall/${mall.id}`, {
        headers,
      });
      const result = await response.json();

      if (result.success) {
        setEditingMall(result.data);
        setEditFormData({
          name: result.data.name || "",
          marketCategory: result.data.marketCategory || "",
          assignedUserIds: result.data.assignedUsers?.map((u: AssignedUser) => u.id) || [],
        });
        setIsEditModalOpen(true);
      } else {
        alert(`쇼핑몰 정보 조회 실패: ${result.error}`);
      }
    } catch (err: any) {
      console.error("쇼핑몰 정보 조회 오류:", err);
      alert("쇼핑몰 정보를 불러오는데 실패했습니다.");
    }
  };

  // 수정 저장
  const handleSave = async () => {
    if (!editingMall) return;

    setError("");

    if (!editFormData.name.trim()) {
      setError("쇼핑몰 이름을 입력해주세요.");
      return;
    }

    try {
      setSaving(true);
      const headers = getAuthHeaders();
      const response = await fetch(`/api/mall/${editingMall.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: editFormData.name.trim(),
          marketCategory: editFormData.marketCategory || null,
          assignedUserIds: editFormData.assignedUserIds,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || "쇼핑몰 정보 수정에 실패했습니다.");
        return;
      }

      alert("쇼핑몰 정보가 성공적으로 수정되었습니다.");
      setIsEditModalOpen(false);
      setEditingMall(null);
      await fetchMalls();
    } catch (err: any) {
      console.error("쇼핑몰 수정 오류:", err);
      setError("쇼핑몰 정보 수정 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  // 신규 등록 저장
  const handleCreate = async () => {
    setError("");

    if (!createFormData.name.trim()) {
      setError("쇼핑몰 이름을 입력해주세요.");
      return;
    }

    try {
      setCreating(true);
      const headers = getAuthHeaders();
      const response = await fetch("/api/mall", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: createFormData.name.trim(),
          marketCategory: createFormData.marketCategory || null,
          assignedUserIds: createFormData.assignedUserIds,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || "쇼핑몰 등록에 실패했습니다.");
        return;
      }

      alert("쇼핑몰이 성공적으로 등록되었습니다.");
      setIsCreateModalOpen(false);
      setCreateFormData({
        name: "",
        marketCategory: "",
        assignedUserIds: [],
      });
      await fetchMalls();
    } catch (err: any) {
      console.error("쇼핑몰 등록 오류:", err);
      setError("쇼핑몰 등록 중 오류가 발생했습니다.");
    } finally {
      setCreating(false);
    }
  };

  // 날짜 포맷팅
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Seoul",
    });
  };

  // 검색 필터링
  const filteredMalls = malls.filter((mall) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      mall.name.toLowerCase().includes(query) ||
      mall.code?.toLowerCase().includes(query) ||
      mall.companyName?.toLowerCase().includes(query) ||
      mall.marketCategory?.toLowerCase().includes(query)
    );
  });

  if (!mounted) {
    return null;
  }

  if (currentUser?.grade !== "관리자") {
    return null;
  }

  return (
    <div className="w-full h-full flex flex-col items-start justify-start pt-4 px-4">
      <div className="w-full bg-[#ffffff] rounded-lg px-8 shadow-md">
        <div className="w-full mt-6">
          <div className="mb-4 flex gap-4 items-center justify-between">
            <h2 className="text-xl font-bold">쇼핑몰 관리</h2>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                placeholder="쇼핑몰명, 코드, 업체명, 마켓분류 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <button
                className="px-5 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                onClick={() => {
                  setCreateFormData({
                    name: "",
                    marketCategory: "",
                    assignedUserIds: [],
                  });
                  setError("");
                  setIsCreateModalOpen(true);
                }}
              >
                신규 등록
              </button>
              <button
                className="px-5 py-2 bg-gray-500 text-white text-sm rounded hover:bg-gray-600 transition-colors"
                onClick={fetchMalls}
                disabled={isLoading}
              >
                새로고침
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-8 text-gray-500">로딩 중...</div>
          ) : filteredMalls.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchQuery ? "검색 결과가 없습니다." : "등록된 쇼핑몰이 없습니다."}
            </div>
          ) : (
            <div className="mt-2 w-full overflow-x-auto pb-12">
              <table className="table-auto border border-collapse border-gray-400 w-full min-w-[1000px]">
                <thead>
                  <tr>
                    <th className="border border-[#cacaca] bg-gray-100 px-4 py-2 text-xs text-center">
                      번호
                    </th>
                    <th className="border border-[#cacaca] bg-gray-100 px-4 py-2 text-xs text-center">
                      코드
                    </th>
                    <th className="border border-[#cacaca] bg-gray-100 px-4 py-2 text-xs text-center">
                      쇼핑몰명
                    </th>
                    <th className="border border-[#cacaca] bg-gray-100 px-4 py-2 text-xs text-center">
                      마켓분류
                    </th>
                    <th className="border border-[#cacaca] bg-gray-100 px-4 py-2 text-xs text-center">
                      담당자
                    </th>
                    <th className="border border-[#cacaca] bg-gray-100 px-4 py-2 text-xs text-center">
                      수정일시
                    </th>
                    <th className="border border-[#cacaca] bg-gray-100 px-4 py-2 text-xs text-center">
                      작업
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMalls.map((mall, index) => (
                    <tr key={mall.id} style={{height: "56px"}}>
                      <td
                        className="border px-4 border-gray-300 text-xs text-center align-middle"
                        style={{height: "56px"}}
                      >
                        {filteredMalls.length - index}
                      </td>
                      <td
                        className="border px-4 border-gray-300 text-xs text-center align-middle"
                        style={{height: "56px"}}
                      >
                        {mall.code || "-"}
                      </td>
                      <td
                        className="border px-4 border-gray-300 text-xs align-middle text-left"
                        style={{height: "56px"}}
                      >
                        {mall.name}
                      </td>
                      <td
                        className="border px-4 border-gray-300 text-xs text-center align-middle"
                        style={{height: "56px"}}
                      >
                        {mall.marketCategory || "-"}
                      </td>
                      <td
                        className="border px-4 border-gray-300 text-xs text-center align-middle"
                        style={{height: "56px"}}
                      >
                        {mall.assignedUsers && mall.assignedUsers.length > 0
                          ? mall.assignedUsers.map((u) => u.name).join(", ")
                          : "-"}
                      </td>
                      <td
                        className="border px-4 border-gray-300 text-xs text-center align-middle"
                        style={{height: "56px"}}
                      >
                        {mall.updatedAt ? formatDate(mall.updatedAt) : "-"}
                      </td>
                      <td
                        className="border px-4 border-gray-300 text-xs text-center align-middle"
                        style={{height: "56px"}}
                      >
                        <button
                          onClick={() => handleEdit(mall)}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                        >
                          수정
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 수정 모달 */}
      {isEditModalOpen && editingMall && (
        <div className="fixed inset-0 bg-black/30 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-[90%] max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">쇼핑몰 정보 수정</h3>
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingMall(null);
                  setError("");
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  쇼핑몰명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editFormData.name}
                  onChange={(e) =>
                    setEditFormData({...editFormData, name: e.target.value})
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="쇼핑몰명을 입력하세요"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  마켓분류
                </label>
                <select
                  value={editFormData.marketCategory}
                  onChange={(e) =>
                    setEditFormData({...editFormData, marketCategory: e.target.value})
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="">선택 안함</option>
                  <option value="협력사">협력사</option>
                  <option value="오픈마켓">오픈마켓</option>
                  <option value="소셜">소셜</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  담당자
                </label>
                <MultiSelectDropdown
                  label=""
                  options={users
                    .filter((u) => u.grade === "납품업체" || u.grade === "온라인")
                    .map((u) => ({
                      value: u.id,
                      label: `${u.name} (${u.grade})`,
                    }))}
                  selectedValues={editFormData.assignedUserIds as (string | number)[]}
                  onChange={(values) =>
                    setEditFormData({
                      ...editFormData,
                      assignedUserIds: values.map((v) =>
                        typeof v === "string" ? parseInt(v, 10) : v
                      ),
                    })
                  }
                  placeholder="담당자를 선택하세요"
                  labelOnTop={false}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  납품업체 또는 온라인 등급의 사용자만 선택할 수 있습니다.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingMall(null);
                  setError("");
                }}
                className="px-4 py-2 bg-gray-500 text-white text-sm rounded hover:bg-gray-600 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 신규 등록 모달 */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/30 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-[90%] max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">쇼핑몰 신규 등록</h3>
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setCreateFormData({
                    name: "",
                    marketCategory: "",
                    assignedUserIds: [],
                  });
                  setError("");
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  쇼핑몰명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={createFormData.name}
                  onChange={(e) =>
                    setCreateFormData({...createFormData, name: e.target.value})
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="쇼핑몰명을 입력하세요"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  마켓분류
                </label>
                <select
                  value={createFormData.marketCategory}
                  onChange={(e) =>
                    setCreateFormData({...createFormData, marketCategory: e.target.value})
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="">선택 안함</option>
                  <option value="협력사">협력사</option>
                  <option value="오픈마켓">오픈마켓</option>
                  <option value="소셜">소셜</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  담당자
                </label>
                <MultiSelectDropdown
                  label=""
                  options={users
                    .filter((u) => u.grade === "납품업체" || u.grade === "온라인")
                    .map((u) => ({
                      value: u.id,
                      label: `${u.name} (${u.grade})`,
                    }))}
                  selectedValues={createFormData.assignedUserIds as (string | number)[]}
                  onChange={(values) =>
                    setCreateFormData({
                      ...createFormData,
                      assignedUserIds: values.map((v) =>
                        typeof v === "string" ? parseInt(v, 10) : v
                      ),
                    })
                  }
                  placeholder="담당자를 선택하세요"
                  labelOnTop={false}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  납품업체 또는 온라인 등급의 사용자만 선택할 수 있습니다.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setCreateFormData({
                    name: "",
                    marketCategory: "",
                    assignedUserIds: [],
                  });
                  setError("");
                }}
                className="px-4 py-2 bg-gray-500 text-white text-sm rounded hover:bg-gray-600 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? "등록 중..." : "등록"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
