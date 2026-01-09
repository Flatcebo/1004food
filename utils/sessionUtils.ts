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

// 현재 세션 ID 가져오기 (세션 기능 제거로 인해 항상 "all" 반환)
export async function getCurrentSessionId(): Promise<string> {
  // 세션 기능 제거로 인해 항상 "all" 반환 (모든 파일 조회)
  return "all";
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

// 새 세션 생성 (세션 기능 제거로 인해 사용 안 함)
export async function createNewSession(
  sessionName: string,
  userId?: string
): Promise<UploadSession | null> {
  // 세션 기능 제거로 인해 null 반환
  return null;
}

// 모든 세션 목록 가져오기 (세션 기능 제거로 인해 빈 배열 반환)
export async function getAllSessions(
  userId?: string
): Promise<UploadSession[]> {
  // 세션 기능 제거로 인해 빈 배열 반환
  return [];
}

// 세션 변경
export function switchSession(session: UploadSession): void {
  setCurrentSession(session);
}

// 세션 삭제 (세션 기능 제거로 인해 항상 false 반환)
export async function deleteSession(sessionId: string): Promise<boolean> {
  // 세션 기능 제거로 인해 항상 false 반환
  return false;
}
