import {create} from "zustand";

interface User {
  id: string;
  companyId: number; // 회사 ID
  name: string;
  position: string; // 직급
  role: string; // 권한명
  grade: "관리자" | "직원" | "납품업체"; // 등급
  assignedMallIds?: number[]; // 담당 쇼핑몰 ID 목록
}

interface AuthStoreState {
  user: User | null;
  isAuthenticated: boolean;
  lastActivityTime: number | null;
  login: (user: User) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  updateActivityTime: () => void;
  checkAutoLogout: () => boolean;
}

const AUTO_LOGOUT_TIME = 3 * 60 * 60 * 1000; // 3시간 (밀리초)

export const useAuthStore = create<AuthStoreState>((set, get) => ({
  user: typeof window !== "undefined"
    ? (() => {
        try {
          const stored = localStorage.getItem("auth-storage");
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.state?.user) {
              return parsed.state.user;
            }
          }
        } catch (e) {
          console.error("Failed to load auth from localStorage", e);
        }
        return null;
      })()
    : null,
  isAuthenticated: typeof window !== "undefined"
    ? (() => {
        try {
          const stored = localStorage.getItem("auth-storage");
          if (stored) {
            const parsed = JSON.parse(stored);
            return !!parsed.state?.isAuthenticated;
          }
        } catch (e) {
          console.error("Failed to load auth from localStorage", e);
        }
        return false;
      })()
    : false,
  lastActivityTime: typeof window !== "undefined"
    ? (() => {
        try {
          const stored = localStorage.getItem("last-activity-time");
          if (stored) {
            return parseInt(stored, 10);
          }
        } catch (e) {
          console.error("Failed to load last activity time from localStorage", e);
        }
        return Date.now();
      })()
    : null,
  login: (user) => {
    const now = Date.now();
    set({
      user,
      isAuthenticated: true,
      lastActivityTime: now,
    });
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(
          "auth-storage",
          JSON.stringify({
            state: {user, isAuthenticated: true},
          })
        );
        localStorage.setItem("last-activity-time", now.toString());
      } catch (e) {
        console.error("Failed to save auth to localStorage", e);
      }
    }
  },
  logout: () => {
    set({
      user: null,
      isAuthenticated: false,
      lastActivityTime: null,
    });
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("auth-storage");
        localStorage.removeItem("last-activity-time");
      } catch (e) {
        console.error("Failed to remove auth from localStorage", e);
      }
    }
  },
  updateUser: (updates) => {
    const currentUser = get().user;
    if (!currentUser) return;
    
    const updatedUser = {...currentUser, ...updates};
    set({user: updatedUser});
    
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("auth-storage");
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.state.user = updatedUser;
          localStorage.setItem("auth-storage", JSON.stringify(parsed));
        }
      } catch (e) {
        console.error("Failed to update user in localStorage", e);
      }
    }
  },
  updateActivityTime: () => {
    const now = Date.now();
    set({lastActivityTime: now});
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("last-activity-time", now.toString());
      } catch (e) {
        console.error("Failed to save last activity time to localStorage", e);
      }
    }
  },
  checkAutoLogout: () => {
    const state = get();
    if (!state.isAuthenticated || !state.lastActivityTime) {
      return false;
    }

    const now = Date.now();
    const timeSinceLastActivity = now - state.lastActivityTime;

    if (timeSinceLastActivity >= AUTO_LOGOUT_TIME) {
      // 자동 로그아웃
      state.logout();
      return true;
    }

    return false;
  },
}));

