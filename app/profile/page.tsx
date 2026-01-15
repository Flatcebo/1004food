"use client";

import {useState, useEffect} from "react";
import {useRouter} from "next/navigation";
import {useAuthStore} from "@/stores/authStore";
import {getAuthHeaders} from "@/utils/api";
import MultiSelectDropdown from "@/components/MultiSelectDropdown";

interface User {
  id: number;
  companyId: number;
  username: string;
  name: string;
  grade: "관리자" | "직원" | "납품업체";
  position: string | null;
  role: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  companyName: string;
  assignedMallIds?: number[];
}

interface Mall {
  id: number;
  name: string;
  code: string;
  companyName?: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const {user: currentUser, updateUser} = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [malls, setMalls] = useState<Mall[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [formData, setFormData] = useState({
    name: "",
    password: "",
    confirmPassword: "",
    assignedMallIds: [] as number[],
  });

  // 클라이언트 마운트 확인
  useEffect(() => {
    setMounted(true);
  }, []);

  // 인증 확인
  useEffect(() => {
    if (mounted && !currentUser) {
      router.push("/login");
    }
  }, [mounted, currentUser, router]);

  // 현재 사용자 정보 조회
  const fetchCurrentUser = async () => {
    if (!currentUser?.id) return;

    try {
      setIsLoading(true);
      const headers = getAuthHeaders();
      const response = await fetch(`/api/users/${currentUser.id}`, {
        headers,
      });
      const result = await response.json();

      if (!result.success) {
        setError(result.error || "사용자 정보를 불러오는데 실패했습니다.");
        return;
      }

      const userData = result.data;
      setUser(userData);
      
      // assignedMallIds를 숫자 배열로 변환
      const mallIds = Array.isArray(userData.assignedMallIds)
        ? userData.assignedMallIds
            .map((id: any) => Number(id))
            .filter((id: number) => !isNaN(id))
        : [];

      setFormData({
        name: userData.name,
        password: "",
        confirmPassword: "",
        assignedMallIds: mallIds,
      });
    } catch (err: any) {
      console.error("사용자 정보 조회 오류:", err);
      setError("사용자 정보를 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  // 쇼핑몰 목록 조회
  const fetchMalls = async () => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch("/api/mall?limit=1000", {
        headers,
      });
      const result = await response.json();

      if (result.success) {
        const mallsData = result.data || [];
        setMalls(mallsData);
      }
    } catch (err: any) {
      console.error("쇼핑몰 목록 조회 오류:", err);
    }
  };

  // 사용자 목록 조회 (다른 사용자에게 할당된 vendor 확인용)
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
    if (currentUser?.id) {
      fetchCurrentUser();
      fetchMalls();
      fetchUsers();
    }
  }, [currentUser]);

  // 사용자 정보 수정
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setError("");
    setSuccessMessage("");

    // 비밀번호 변경 시 유효성 검증
    if (formData.password) {
      if (formData.password.length < 6) {
        setError("비밀번호는 최소 6자 이상이어야 합니다.");
        return;
      }

      if (formData.password !== formData.confirmPassword) {
        setError("비밀번호가 일치하지 않습니다.");
        return;
      }
    }

    try {
      const updateData: any = {
        name: formData.name,
      };

      // 비밀번호가 입력된 경우에만 포함
      if (formData.password) {
        updateData.password = formData.password;
      }

      // assignedMallIds는 항상 배열로 보장
      const mallIds = Array.isArray(formData.assignedMallIds)
        ? formData.assignedMallIds
        : [];

      // 등급이 '납품업체'인 경우에만 assignedMallIds 포함
      if (user.grade === "납품업체") {
        updateData.assignedMallIds = mallIds;
      }

      const headers = getAuthHeaders();
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      const result = await response.json();

      if (!result.success) {
        console.error("사용자 수정 API 에러:", result.error, updateData);
        setError(result.error || "정보 수정에 실패했습니다.");
        return;
      }

      // 성공 메시지 표시
      setSuccessMessage("정보가 성공적으로 수정되었습니다.");
      
      // 폼에서 비밀번호 필드 초기화
      setFormData((prev) => ({
        ...prev,
        password: "",
        confirmPassword: "",
      }));

      // 사용자 정보 다시 조회
      fetchCurrentUser();
      
      // authStore 업데이트 (이름이 변경되었을 수 있음)
      if (currentUser) {
        updateUser({
          name: result.data.name,
          assignedMallIds: result.data.assignedMallIds || [],
        });
      }
    } catch (err: any) {
      console.error("사용자 수정 오류:", err);
      setError("정보 수정 중 오류가 발생했습니다.");
    }
  };

  // 클라이언트 마운트 전에는 아무것도 렌더링하지 않음 (Hydration 오류 방지)
  if (!mounted) {
    return null;
  }

  // 인증되지 않은 사용자는 아무것도 렌더링하지 않음
  if (!currentUser) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <div className="text-lg">로딩 중...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <div className="text-lg text-red-600">사용자 정보를 불러올 수 없습니다.</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full p-8">
      <div className="w-full max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">내 정보 수정</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md text-green-700 text-sm">
            {successMessage}
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-8">
          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                아이디
              </label>
              <input
                type="text"
                value={user.username}
                disabled
                className="w-full px-4 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                이름 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({...formData, name: e.target.value})
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {/* 담당 쇼핑몰 선택 */}
            <div className="w-full">
              <MultiSelectDropdown
                label="담당 쇼핑몰"
                options={(() => {
                  // 현재 편집 중인 사용자를 제외한 다른 사용자들에게 이미 할당된 mall ID 수집
                  const assignedMallIds = new Set<number>();
                  users.forEach((u) => {
                    // 현재 사용자는 제외
                    if (u.id !== user?.id && u.assignedMallIds) {
                      u.assignedMallIds.forEach((mallId) => {
                        assignedMallIds.add(mallId);
                      });
                    }
                  });

                  // 현재 사용자가 이미 선택한 mall은 포함 (자신이 선택한 것은 유지)
                  const currentSelectedIds = new Set(
                    formData.assignedMallIds || []
                  );

                  // 사용 가능한 malls: 다른 사용자에게 할당되지 않은 것들
                  // 또는 현재 사용자가 이미 선택한 것들
                  return malls
                    .filter((m: Mall) => {
                      // 이미 다른 사용자에게 할당되었고, 현재 사용자가 선택하지 않은 경우 제외
                      if (
                        assignedMallIds.has(m.id) &&
                        !currentSelectedIds.has(m.id)
                      ) {
                        return false;
                      }
                      return true;
                    })
                    .map((mall: Mall) => ({
                      value: mall.id,
                      label: `${mall.name}${mall.code ? ` (${mall.code})` : ""}`,
                    }));
                })()}
                selectedValues={
                  (formData.assignedMallIds || []) as (
                    | string
                    | number
                  )[]
                }
                onChange={(values) => {
                  setFormData((prev) => ({
                    ...prev,
                    assignedMallIds: values.map((v) =>
                      Number(v)
                    ) as number[],
                  }));
                }}
                placeholder="담당 쇼핑몰 선택"
                className="mb-2 w-full"
                showSelectedTags={true}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                비밀번호 변경 (선택사항)
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({...formData, password: e.target.value})
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="변경할 비밀번호를 입력하세요"
                minLength={6}
              />
            </div>

            {formData.password && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  비밀번호 확인
                </label>
                <input
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
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
                onClick={() => router.back()}
                className="flex-1 px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 font-medium rounded-md transition-colors"
              >
                취소
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
