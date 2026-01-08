"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";
import {useAuthStore} from "@/stores/authStore";

export default function LoginPage() {
  const router = useRouter();
  const {login} = useAuthStore();
  const [formData, setFormData] = useState({
    id: "",
    password: "",
  });
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!formData.id || !formData.password) {
      setError("아이디와 비밀번호를 입력해주세요.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: formData.id,
          password: formData.password,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || "로그인에 실패했습니다.");
        setIsLoading(false);
        return;
      }

      // 로그인 성공 - 사용자 정보 저장
      login({
        id: result.data.id,
        companyId: result.data.companyId,
        name: result.data.name,
        position: result.data.position || "",
        role: result.data.role || "",
        grade: result.data.grade,
        assignedVendorIds: result.data.assignedVendorIds || [],
      });

      router.push("/");
    } catch (err: any) {
      console.error("로그인 오류:", err);
      setError("로그인 중 오류가 발생했습니다.");
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold text-center mb-8">로그인</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="id"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              아이디
            </label>
            <input
              id="id"
              type="text"
              value={formData.id}
              onChange={(e) =>
                setFormData({...formData, id: e.target.value})
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="아이디를 입력하세요"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) =>
                setFormData({...formData, password: e.target.value})
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="비밀번호를 입력하세요"
            />
          </div>
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
          >
            {isLoading ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </div>
    </div>
  );
}

