"use client";

import {useState, useEffect} from "react";
import {useAuthStore} from "@/stores/authStore";
import {getAuthHeaders} from "@/utils/api";
import {useRouter} from "next/navigation";

interface User {
  id: number;
  companyId: number;
  username: string;
  name: string;
  grade: "관리자" | "직원" | "납품업체" | "온라인";
  position: string | null;
  role: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  companyName: string;
}

export default function LogsPage() {
  const router = useRouter();
  const {user: currentUser} = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    setMounted(true);
  }, []);

  // 관리자 권한 체크
  useEffect(() => {
    if (mounted && currentUser && currentUser.grade !== "관리자") {
      router.push("/");
    }
  }, [mounted, currentUser, router]);

  // 사용자 목록 조회
  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const headers = getAuthHeaders();
      const response = await fetch("/api/users", {
        headers,
      });
      const result = await response.json();

      if (!result.success) {
        setError(result.error || "사용자 목록을 불러오는데 실패했습니다.");
        return;
      }

      setUsers(result.data || []);
    } catch (err: any) {
      console.error("사용자 목록 조회 오류:", err);
      setError("사용자 목록을 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (mounted && currentUser?.grade === "관리자") {
      fetchUsers();
    }
  }, [mounted, currentUser]);

  const handleUserClick = (userId: number) => {
    // 새 윈도우 창 열기
    const url = `/logs/users/${userId}`;
    window.open(url, "_blank", "width=1200,height=800");
  };

  if (!mounted) {
    return null;
  }

  if (currentUser?.grade !== "관리자") {
    return null;
  }

  return (
    <div className="w-full h-full flex flex-col p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">로그</h1>
        <p className="text-gray-600 mt-1">전체 유저 리스트 및 업로드 이력</p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">로딩 중...</div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  이름
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  아이디
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  회사
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  직급
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  상태
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
              {users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                    사용자가 없습니다.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleUserClick(user.id)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {user.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.username}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.companyName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.grade}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          user.isActive
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {user.isActive ? "활성" : "비활성"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(user.createdAt).toLocaleDateString("ko-KR")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600">
                      상세보기 →
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
