"use client";

import {useState, useEffect} from "react";
import {useRouter} from "next/navigation";
import {useAuthStore} from "@/stores/authStore";
import {getAuthHeaders} from "@/utils/api";

interface Vendor {
  id: number;
  companyId: number;
  username: string;
  name: string;
  template: string | null;
  createdAt: string;
  updatedAt: string;
  companyName: string;
}

interface Company {
  id: number;
  name: string;
}

export default function VendorsPage() {
  const router = useRouter();
  const {user: currentUser} = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [formData, setFormData] = useState({
    companyId: "",
    username: "",
    password: "",
    confirmPassword: "",
    name: "",
  });
  const [editFormData, setEditFormData] = useState({
    name: "",
    password: "",
    confirmPassword: "",
  });

  // 클라이언트 마운트 확인
  useEffect(() => {
    setMounted(true);
  }, []);

  // 관리자 권한 체크
  useEffect(() => {
    if (mounted && currentUser && currentUser.grade !== "관리자") {
      router.push("/upload");
    }
  }, [mounted, currentUser, router]);

  // 납품업체 목록 조회
  const fetchVendors = async () => {
    try {
      setIsLoading(true);
      
      const headers = getAuthHeaders();
      const response = await fetch("/api/vendors", {
        headers,
      });
      const result = await response.json();

      if (!result.success) {
        setError(result.error || "납품업체 목록을 불러오는데 실패했습니다.");
        return;
      }

      setVendors(result.data || []);
    } catch (err: any) {
      console.error("납품업체 목록 조회 오류:", err);
      setError("납품업체 목록을 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  // 회사 목록 조회
  const fetchCompanies = async () => {
    try {
      const response = await fetch("/api/companies");
      const result = await response.json();

      if (result.success) {
        setCompanies(result.data || []);
        // 현재 사용자의 회사 ID를 기본값으로 설정
        if (currentUser && result.data.length > 0) {
          setFormData((prev) => ({
            ...prev,
            companyId: currentUser.companyId.toString(),
          }));
        }
      }
    } catch (err: any) {
      console.error("회사 목록 조회 오류:", err);
    }
  };

  useEffect(() => {
    if (mounted && currentUser?.grade === "관리자") {
      fetchVendors();
      fetchCompanies();
    }
  }, [mounted, currentUser]);

  // 납품업체 생성
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // 유효성 검증
    if (!formData.companyId || !formData.username || !formData.password || !formData.name) {
      setError("필수 항목을 모두 입력해주세요.");
      return;
    }

    if (formData.password.length < 6) {
      setError("비밀번호는 최소 6자 이상이어야 합니다.");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    try {
      const headers = getAuthHeaders();
      const response = await fetch("/api/vendors", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyId: parseInt(formData.companyId),
          username: formData.username,
          password: formData.password,
          name: formData.name,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || "납품업체 생성에 실패했습니다.");
        return;
      }

      // 성공 시 목록 새로고침 및 폼 초기화
      setIsCreateModalOpen(false);
      setFormData({
        companyId: currentUser?.companyId.toString() || "",
        username: "",
        password: "",
        confirmPassword: "",
        name: "",
      });
      fetchVendors();
    } catch (err: any) {
      console.error("납품업체 생성 오류:", err);
      setError("납품업체 생성 중 오류가 발생했습니다.");
    }
  };

  // 납품업체 수정 모달 열기
  const handleEditClick = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setEditFormData({
      name: vendor.name,
      password: "",
      confirmPassword: "",
    });
    setIsEditModalOpen(true);
  };

  // 납품업체 수정
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVendor) return;

    setError("");

    // 비밀번호 변경 시 유효성 검증
    if (editFormData.password) {
      if (editFormData.password.length < 6) {
        setError("비밀번호는 최소 6자 이상이어야 합니다.");
        return;
      }

      if (editFormData.password !== editFormData.confirmPassword) {
        setError("비밀번호가 일치하지 않습니다.");
        return;
      }
    }

    try {
      const updateData: any = {
        name: editFormData.name,
      };

      // 비밀번호가 입력된 경우에만 포함
      if (editFormData.password) {
        updateData.password = editFormData.password;
      }

      const response = await fetch(`/api/vendors/${editingVendor.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || "납품업체 수정에 실패했습니다.");
        return;
      }

      // 성공 시 목록 새로고침 및 모달 닫기
      setIsEditModalOpen(false);
      setEditingVendor(null);
      fetchVendors();
    } catch (err: any) {
      console.error("납품업체 수정 오류:", err);
      setError("납품업체 수정 중 오류가 발생했습니다.");
    }
  };

  // 납품업체 삭제
  const handleDelete = async (vendorId: number) => {
    if (!confirm("정말 이 납품업체를 삭제하시겠습니까?")) {
      return;
    }

    try {
      const headers = getAuthHeaders();
      const response = await fetch(`/api/vendors/${vendorId}`, {
        method: "DELETE",
        headers,
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || "납품업체 삭제에 실패했습니다.");
        return;
      }

      fetchVendors();
    } catch (err: any) {
      console.error("납품업체 삭제 오류:", err);
      setError("납품업체 삭제 중 오류가 발생했습니다.");
    }
  };

  // 클라이언트 마운트 전에는 아무것도 렌더링하지 않음 (Hydration 오류 방지)
  if (!mounted) {
    return null;
  }

  // 관리자가 아니면 아무것도 렌더링하지 않음
  if (!currentUser || currentUser.grade !== "관리자") {
    return null;
  }

  if (isLoading) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <div className="text-lg">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full p-8">
      <div className="w-full flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">납품업체 관리</h1>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors"
        >
          새 납품업체 추가
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="w-full bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                아이디
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                이름
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                회사
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                템플릿
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                생성일
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                작업
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {vendors.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                  납품업체가 없습니다.
                </td>
              </tr>
            ) : (
              vendors.map((vendor) => (
                <tr key={vendor.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {vendor.username}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {vendor.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {vendor.companyName}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {vendor.template ? "있음" : "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(vendor.createdAt).toLocaleDateString("ko-KR")}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleEditClick(vendor)}
                      className="text-blue-600 hover:text-blue-900 mr-4"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDelete(vendor.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 납품업체 생성 모달 */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-6">새 납품업체 추가</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  회사 <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.companyId}
                  onChange={(e) =>
                    setFormData({...formData, companyId: e.target.value})
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">회사를 선택하세요</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  아이디 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) =>
                    setFormData({...formData, username: e.target.value})
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="아이디를 입력하세요"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  비밀번호 <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({...formData, password: e.target.value})
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="비밀번호를 입력하세요 (최소 6자)"
                  required
                  minLength={6}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  비밀번호 확인 <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) =>
                    setFormData({...formData, confirmPassword: e.target.value})
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="비밀번호를 다시 입력하세요"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  납품업체명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({...formData, name: e.target.value})
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="납품업체명을 입력하세요"
                  required
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors"
                >
                  생성
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setError("");
                  }}
                  className="flex-1 px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 font-medium rounded-md transition-colors"
                >
                  취소
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 납품업체 수정 모달 */}
      {isEditModalOpen && editingVendor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-6">납품업체 수정</h2>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  아이디
                </label>
                <input
                  type="text"
                  value={editingVendor.username}
                  disabled
                  className="w-full px-4 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  납품업체명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editFormData.name}
                  onChange={(e) =>
                    setEditFormData({...editFormData, name: e.target.value})
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  비밀번호 변경 (선택사항)
                </label>
                <input
                  type="password"
                  value={editFormData.password}
                  onChange={(e) =>
                    setEditFormData({...editFormData, password: e.target.value})
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="변경할 비밀번호를 입력하세요"
                  minLength={6}
                />
              </div>

              {editFormData.password && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    비밀번호 확인
                  </label>
                  <input
                    type="password"
                    value={editFormData.confirmPassword}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        confirmPassword: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="비밀번호를 다시 입력하세요"
                  />
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingVendor(null);
                    setError("");
                  }}
                  className="flex-1 px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 font-medium rounded-md transition-colors"
                >
                  취소
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
