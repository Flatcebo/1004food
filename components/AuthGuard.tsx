"use client";

import {useEffect, useState} from "react";
import {useRouter, usePathname} from "next/navigation";
import {useAuthStore} from "@/stores/authStore";
import {useAutoLogout} from "@/hooks/useAutoLogout";

/**
 * 인증이 필요한 경로 목록
 */
const protectedRoutes = [
  "/",
  "/upload",
  "/order",
  "/products",
  "/header-aliases",
  "/users",
  "/companies",
];

/**
 * 인증이 필요 없는 경로 목록 (공개 경로)
 */
const publicRoutes = ["/login"];

/**
 * AuthGuard 컴포넌트
 * 클라이언트 사이드에서 인증 상태를 확인하고 보호된 경로에 대한 접근을 제어합니다.
 */
export default function AuthGuard({children}: {children: React.ReactNode}) {
  const router = useRouter();
  const pathname = usePathname();
  const {isAuthenticated, user} = useAuthStore();
  const [mounted, setMounted] = useState(false);

  // 자동 로그아웃 기능 활성화 (인증된 사용자만)
  useAutoLogout();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    // 로그인 페이지에 이미 로그인한 사용자가 접근하면 메인으로 리다이렉트
    if (pathname === "/login" && isAuthenticated) {
      router.push("/");
      return;
    }

    // 공개 경로는 체크하지 않음
    if (publicRoutes.includes(pathname || "")) {
      return;
    }

    // 보호된 경로인지 확인
    // 루트 경로는 정확히 일치해야 함
    const isProtectedRoute =
      pathname === "/" ||
      protectedRoutes.some(
        (route) => route !== "/" && pathname?.startsWith(route),
      );

    if (isProtectedRoute && !isAuthenticated) {
      // 인증되지 않은 사용자는 로그인 페이지로 리다이렉트
      router.push("/login");
    }
  }, [pathname, isAuthenticated, router, mounted]);

  // 마운트 전에는 children 렌더링 (hydration mismatch 방지)
  if (!mounted) {
    return <>{children}</>;
  }

  // 공개 경로이거나 인증된 사용자는 children 렌더링
  if (publicRoutes.includes(pathname || "") || isAuthenticated) {
    return <>{children}</>;
  }

  // 보호된 경로이고 인증되지 않은 경우 로딩 표시 (리다이렉트 중)
  const isProtectedRoute =
    pathname === "/" ||
    protectedRoutes.some(
      (route) => route !== "/" && pathname?.startsWith(route),
    );

  if (isProtectedRoute) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">인증 확인 중...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
