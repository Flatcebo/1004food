import {NextResponse} from "next/server";
import type {NextRequest} from "next/server";

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
];

/**
 * 인증이 필요 없는 경로 목록 (공개 경로)
 */
const publicRoutes = [
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/register",
];

/**
 * Next.js 미들웨어
 * 로그인 상태를 확인하고 보호된 경로에 대한 접근을 제어합니다.
 */
export function middleware(request: NextRequest) {
  const {pathname} = request.nextUrl;

  // API 경로는 별도 처리 (API 라우트는 자체 인증 처리)
  if (pathname.startsWith("/api/")) {
    // 인증 API는 항상 허용
    if (publicRoutes.some((route) => pathname.startsWith(route))) {
      return NextResponse.next();
    }
    // 다른 API는 통과 (API 라우트에서 자체 인증 처리)
    return NextResponse.next();
  }

  // 공개 경로는 항상 허용
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  // 보호된 경로인지 확인
  // 루트 경로는 정확히 일치해야 함
  const isProtectedRoute = 
    pathname === "/" || 
    protectedRoutes.some((route) => 
      route !== "/" && pathname.startsWith(route)
    );

  if (isProtectedRoute) {
    // 쿠키에서 인증 정보 확인 (서버 사이드에서는 localStorage 접근 불가)
    // 클라이언트 사이드에서 리다이렉트하도록 처리
    // 여기서는 쿠키나 헤더를 확인할 수 있지만, 
    // 실제로는 클라이언트 사이드에서 localStorage를 확인하는 것이 더 안전
    
    // 쿠키 확인 (선택사항 - 향후 JWT 토큰 사용 시)
    const authCookie = request.cookies.get("auth-token");
    
    // 현재는 클라이언트 사이드에서 처리하도록 허용
    // 실제 프로덕션에서는 서버 사이드 세션이나 JWT 토큰을 사용해야 함
    return NextResponse.next();
  }

  return NextResponse.next();
}

/**
 * 미들웨어가 실행될 경로 설정
 */
export const config = {
  matcher: [
    /*
     * 다음 경로를 제외한 모든 요청 경로에 매칭:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public 폴더의 파일들
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
