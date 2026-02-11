"use client";

import {useState, useEffect} from "react";
import {useRouter} from "next/navigation";
import {useAuthStore} from "@/stores/authStore";
import {getAuthHeaders} from "@/utils/api";

interface Company {
  id: number;
  name: string;
  smtpEmail?: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function CompaniesPage() {
  const router = useRouter();
  const {user: currentUser} = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [createFormData, setCreateFormData] = useState({
    name: "",
    smtpEmail: "",
    nAppPw: "",
  });
  const [editFormData, setEditFormData] = useState({
    name: "",
    smtpEmail: "",
    nAppPw: "",
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // 관리자 권한 체크
  useEffect(() => {
    if (mounted && currentUser && currentUser.grade !== "관리자") {
      router.push("/");
    }
  }, [mounted, currentUser, router]);

  const fetchCompanies = async () => {
    try {
      setIsLoading(true);
      const headers = getAuthHeaders();
      const response = await fetch("/api/companies", {headers});
      const result = await response.json();

      if (!result.success) {
        setError(result.error || "회사 목록을 불러오는데 실패했습니다.");
        return;
      }

      setCompanies(result.data || []);
    } catch (err: unknown) {
      const e = err as Error;
      console.error("회사 목록 조회 오류:", e);
      setError("회사 목록을 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.grade === "관리자") {
      fetchCompanies();
    }
  }, [currentUser]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!createFormData.name.trim()) {
      setError("회사명을 입력해주세요.");
      return;
    }

    try {
      const headers = getAuthHeaders();
      const response = await fetch("/api/companies", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: createFormData.name.trim(),
          smtpEmail: createFormData.smtpEmail.trim() || undefined,
          nAppPw: createFormData.nAppPw || undefined,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || "회사 생성에 실패했습니다.");
        return;
      }

      setIsCreateModalOpen(false);
      setCreateFormData({name: "", smtpEmail: "", nAppPw: ""});
      fetchCompanies();
    } catch (err: unknown) {
      const e = err as Error;
      console.error("회사 생성 오류:", e);
      setError("회사 생성 중 오류가 발생했습니다.");
    }
  };

  const handleEditClick = (company: Company) => {
    setEditingCompany(company);
    setEditFormData({
      name: company.name,
      smtpEmail: company.smtpEmail || "",
      nAppPw: "",
    });
    setIsEditModalOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompany) return;

    setError("");

    if (!editFormData.name.trim()) {
      setError("회사명을 입력해주세요.");
      return;
    }

    try {
      const headers = getAuthHeaders();
      const body: {name: string; smtpEmail?: string; nAppPw?: string} = {
        name: editFormData.name.trim(),
        smtpEmail: editFormData.smtpEmail.trim() || undefined,
      };
      if (editFormData.nAppPw) {
        body.nAppPw = editFormData.nAppPw;
      }

      const response = await fetch(`/api/companies/${editingCompany.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || "회사 수정에 실패했습니다.");
        return;
      }

      setIsEditModalOpen(false);
      setEditingCompany(null);
      setEditFormData({name: "", smtpEmail: "", nAppPw: ""});
      fetchCompanies();
    } catch (err: unknown) {
      const e = err as Error;
      console.error("회사 수정 오류:", e);
      setError("회사 수정 중 오류가 발생했습니다.");
    }
  };

  const handleDelete = async (company: Company) => {
    if (
      !confirm(
        `"${company.name}" 회사를 삭제하시겠습니까?\n연결된 사용자 등 모든 관련 데이터가 삭제됩니다.`,
      )
    ) {
      return;
    }

    try {
      const headers = getAuthHeaders();
      const response = await fetch(`/api/companies/${company.id}`, {
        method: "DELETE",
        headers,
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || "회사 삭제에 실패했습니다.");
        return;
      }

      fetchCompanies();
    } catch (err: unknown) {
      const e = err as Error;
      console.error("회사 삭제 오류:", e);
      setError("회사 삭제 중 오류가 발생했습니다.");
    }
  };

  if (!mounted) {
    return null;
  }

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
        <h1 className="text-2xl font-bold">회사 관리</h1>
        <button
          onClick={() => {
            setIsCreateModalOpen(true);
            setCreateFormData({name: "", smtpEmail: "", nAppPw: ""});
            setError("");
          }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors text-[14px]"
        >
          새 회사 추가
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
                회사명
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                SMTP 이메일
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                생성일
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                수정일
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                작업
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {companies.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                  등록된 회사가 없습니다.
                </td>
              </tr>
            ) : (
              companies.map((company) => (
                <tr key={company.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {company.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {company.smtpEmail || "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(company.createdAt).toLocaleDateString("ko-KR")}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(company.updatedAt).toLocaleDateString("ko-KR")}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleEditClick(company)}
                      className="text-blue-600 hover:text-blue-900 mr-4"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDelete(company)}
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

      {/* 새 회사 추가 모달 */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
            <h2 className="text-xl font-bold mb-6">새 회사 추가</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  회사명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={createFormData.name}
                  onChange={(e) =>
                    setCreateFormData({...createFormData, name: e.target.value})
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="회사명을 입력하세요"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SMTP 이메일
                </label>
                <input
                  type="email"
                  value={createFormData.smtpEmail}
                  onChange={(e) =>
                    setCreateFormData({
                      ...createFormData,
                      smtpEmail: e.target.value,
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="메일 발송용 네이버 이메일 (선택)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  앱 비밀번호
                </label>
                <input
                  type="password"
                  value={createFormData.nAppPw}
                  onChange={(e) =>
                    setCreateFormData({
                      ...createFormData,
                      nAppPw: e.target.value,
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="네이버 앱 비밀번호 (선택)"
                />
                <p className="text-xs text-gray-500 mt-1">
                  SMTP 이메일과 함께 설정 시 해당 회사의 메일 발송에 사용됩니다.
                </p>
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

      {/* 회사 수정 모달 */}
      {isEditModalOpen && editingCompany && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
            <h2 className="text-xl font-bold mb-6">회사 수정</h2>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  회사명 <span className="text-red-500">*</span>
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
                  SMTP 이메일
                </label>
                <input
                  type="email"
                  value={editFormData.smtpEmail}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      smtpEmail: e.target.value,
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="메일 발송용 네이버 이메일"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  앱 비밀번호 변경
                </label>
                <input
                  type="password"
                  value={editFormData.nAppPw}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      nAppPw: e.target.value,
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="변경할 경우에만 입력"
                />
                <p className="text-xs text-gray-500 mt-1">
                  비워두면 기존 비밀번호가 유지됩니다.
                </p>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors"
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingCompany(null);
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
