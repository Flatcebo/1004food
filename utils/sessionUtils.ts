// 세션 관리 유틸리티 함수들

export interface UploadSession {
  sessionId: string;
  sessionName: string;
  createdAt: string;
  updatedAt: string;
  userId?: string; // 사용자 ID 추가
}

// 사용자별 세션 키 생성 함수
function getUserSessionKey(userId?: string | null): string {
  if (userId) {
    return `current_upload_session_${userId}`;
  }
  // 로그인하지 않은 경우 기본 키 사용
  return "current_upload_session_guest";
}

// 현재 사용자 ID 가져오기 (authStore에서)
function getCurrentUserId(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem("auth-storage");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.state?.user?.id) {
        return parsed.state.user.id;
      }
    }
  } catch (e) {
    console.error("Failed to load user from localStorage", e);
  }
  return null;
}

// 현재 세션 ID 가져오기
export async function getCurrentSessionId(): Promise<string> {
  if (typeof window === "undefined") return "default-session";

  const userId = getCurrentUserId();
  const sessionKey = getUserSessionKey(userId);

  const stored = localStorage.getItem(sessionKey);
  if (stored) {
    try {
      const session = JSON.parse(stored);
      return session.sessionId;
    } catch {
      // 파싱 실패 시 기본 세션 사용
    }
  }

  // 기본 세션 생성 및 데이터베이스 저장
  const defaultSession = {
    sessionId: `session_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`,
    sessionName: userId ? "내 세션" : "게스트 세션",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userId: userId || undefined,
  };

  try {
    // 데이터베이스에 세션 저장 시도
    const savedSession = await createNewSession(
      defaultSession.sessionName,
      userId || undefined
    );
    if (savedSession) {
      // 데이터베이스에 저장된 세션 정보로 업데이트
      defaultSession.sessionId = savedSession.sessionId;
      defaultSession.createdAt = savedSession.createdAt;
      defaultSession.updatedAt = savedSession.updatedAt;
    }
  } catch (error) {
    console.warn("기본 세션 데이터베이스 저장 실패:", error);
  }

  localStorage.setItem(sessionKey, JSON.stringify(defaultSession));
  return defaultSession.sessionId;
}

// 현재 세션 정보 가져오기
export function getCurrentSession(): UploadSession | null {
  if (typeof window === "undefined") return null;

  const userId = getCurrentUserId();
  const sessionKey = getUserSessionKey(userId);

  const stored = localStorage.getItem(sessionKey);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }
  return null;
}

// 세션 설정
export function setCurrentSession(session: UploadSession): void {
  if (typeof window === "undefined") return;

  const userId = getCurrentUserId();
  const sessionKey = getUserSessionKey(userId);

  localStorage.setItem(sessionKey, JSON.stringify(session));
}

// 새 세션 생성
export async function createNewSession(
  sessionName: string,
  userId?: string
): Promise<UploadSession | null> {
  try {
    // company-id 헤더 포함
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("auth-storage");
        if (stored) {
          const parsed = JSON.parse(stored);
          const user = parsed.state?.user;
          if (user?.companyId) {
            headers["company-id"] = user.companyId.toString();
          }
        }
      } catch (e) {
        console.error("인증 정보 로드 실패:", e);
      }
    }

    const response = await fetch("/api/upload/sessions", {
      method: "POST",
      headers,
      body: JSON.stringify({sessionName, userId}),
    });

    const result = await response.json();
    if (result.success) {
      const newSession: UploadSession = {
        sessionId: result.data.sessionId,
        sessionName: result.data.sessionName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setCurrentSession(newSession);
      return newSession;
    }
  } catch (error) {
    console.error("세션 생성 실패:", error);
  }
  return null;
}

// 모든 세션 목록 가져오기
export async function getAllSessions(
  userId?: string
): Promise<UploadSession[]> {
  try {
    const url = userId
      ? `/api/upload/sessions?userId=${userId}`
      : "/api/upload/sessions";
    const response = await fetch(url);
    const result = await response.json();
    if (result.success) {
      return result.data;
    }
  } catch (error) {
    console.error("세션 목록 조회 실패:", error);
  }
  return [];
}

// 세션 변경
export function switchSession(session: UploadSession): void {
  setCurrentSession(session);
}

// 세션 삭제
export async function deleteSession(sessionId: string): Promise<boolean> {
  try {
    // company-id 헤더 포함
    const headers: HeadersInit = {};

    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("auth-storage");
        if (stored) {
          const parsed = JSON.parse(stored);
          const user = parsed.state?.user;
          if (user?.companyId) {
            headers["company-id"] = user.companyId.toString();
          }
        }
      } catch (e) {
        console.error("인증 정보 로드 실패:", e);
      }
    }

    const response = await fetch(
      `/api/upload/sessions?sessionId=${sessionId}`,
      {
        method: "DELETE",
        headers,
      }
    );

    const result = await response.json();
    return result.success;
  } catch (error) {
    console.error("세션 삭제 실패:", error);
  }
  return false;
}
