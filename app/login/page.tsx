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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // TODO: 실제 로그인 API 호출
    // 임시로 테스트용 로그인 처리
    if (formData.id && formData.password) {
      // 임시 사용자 데이터 (실제로는 API에서 받아와야 함)
      login({
        id: formData.id,
        name: "홍길동", // 실제로는 API 응답에서 받아옴
        position: "대리", // 실제로는 API 응답에서 받아옴
        role: "일반사용자", // 실제로는 API 응답에서 받아옴
      });

      router.push("/upload");
    } else {
      alert("아이디와 비밀번호를 입력해주세요.");
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
          <button
            type="submit"
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors"
          >
            로그인
          </button>
        </form>
      </div>
    </div>
  );
}

