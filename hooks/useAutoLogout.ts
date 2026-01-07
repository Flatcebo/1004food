"use client";

import {useEffect, useRef} from "react";
import {useRouter} from "next/navigation";
import {useAuthStore} from "@/stores/authStore";

const AUTO_LOGOUT_TIME = 3 * 60 * 60 * 1000; // 3시간 (밀리초)
const CHECK_INTERVAL = 60 * 1000; // 1분마다 체크

/**
 * 자동 로그아웃 훅
 * 사용자 활동을 감지하고 3시간 동안 활동이 없으면 자동으로 로그아웃합니다.
 */
export function useAutoLogout() {
  const router = useRouter();
  const {isAuthenticated, updateActivityTime, checkAutoLogout, logout} =
    useAuthStore();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    // 활동 감지 이벤트 핸들러
    const handleActivity = () => {
      updateActivityTime();
    };

    // 활동 감지 이벤트 리스너 등록
    const events = [
      "mousedown",
      "mousemove",
      "keypress",
      "scroll",
      "touchstart",
      "click",
    ];

    events.forEach((event) => {
      document.addEventListener(event, handleActivity, true);
    });

    // 주기적으로 자동 로그아웃 체크
    const checkAutoLogoutPeriodically = () => {
      if (checkAutoLogout()) {
        // 자동 로그아웃 발생
        router.push("/login");
        // 로그아웃 메시지 표시 (선택사항)
        console.log("3시간 동안 활동이 없어 자동 로그아웃되었습니다.");
      }
    };

    // 초기 활동 시간 업데이트
    updateActivityTime();

    // 주기적 체크 시작
    checkIntervalRef.current = setInterval(
      checkAutoLogoutPeriodically,
      CHECK_INTERVAL
    );

    // 초기 체크
    checkAutoLogoutPeriodically();

    // 클린업
    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity, true);
      });

      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [isAuthenticated, updateActivityTime, checkAutoLogout, router]);
}
