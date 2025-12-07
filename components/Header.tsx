"use client";

import {usePathname} from "next/navigation";
import {useAuthStore} from "@/stores/authStore";
import Link from "next/link";

// 경로별 메뉴명 매핑
const menuNames: {[key: string]: string} = {
  "/": "홈",
  "/upload": "발주서 업로드",
  "/upload/templates": "양식 템플릿 관리",
};

interface HeaderProps {
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

export default function Header({
  onToggleSidebar,
  isSidebarOpen = false,
}: HeaderProps) {
  const pathname = usePathname();
  const {user, isAuthenticated, logout} = useAuthStore();

  // 현재 경로에 맞는 메뉴명 가져오기
  const currentMenuName =
    menuNames[pathname || ""] ||
    (pathname?.startsWith("/upload") ? "발주서 업로드" : "홈");

  const handleLogout = () => {
    if (confirm("로그아웃 하시겠습니까?")) {
      logout();
    }
  };

  return (
    <header className="w-full h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm">
      {/* 좌측: 사이드바 토글 버튼 + 현재 메뉴명 */}
      <div className="flex items-center gap-4">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="group p-2 hover:bg-gray-100 rounded-md transition-all duration-200 hover:scale-110 active:scale-95"
            aria-label="사이드바 토글"
          >
            {isSidebarOpen ? (
              <svg
                className="w-6 h-6 text-gray-600 group-hover:text-gray-900 transition-colors duration-200"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            ) : (
              <svg
                className="w-6 h-6 text-gray-600 group-hover:text-gray-900 transition-colors duration-200"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path d="M4 6h16M4 12h16M4 18h16"></path>
              </svg>
            )}
          </button>
        )}
        <h1 className="text-lg font-semibold text-gray-800">
          {currentMenuName}
        </h1>
      </div>

      {/* 우측: 사용자 정보 또는 로그인 버튼 */}
      <div className="flex items-center gap-4">
        {isAuthenticated && user ? (
          <>
            <div className="flex items-center gap-3 text-sm">
              <div className="flex flex-col items-end">
                <span className="font-medium text-gray-800">{user.name}</span>
                <span className="text-xs text-gray-500">
                  {user.position} / {user.role}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm font-medium transition-colors"
              >
                로그아웃
              </button>
            </div>
          </>
        ) : (
          <Link
            href="/login"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
          >
            로그인
          </Link>
        )}
      </div>
    </header>
  );
}
