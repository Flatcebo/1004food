import {create} from "zustand";

interface User {
  id: string;
  name: string;
  position: string; // 직급
  role: string; // 권한명
}

interface AuthStoreState {
  user: User | null;
  isAuthenticated: boolean;
  login: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStoreState>((set) => ({
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
  login: (user) => {
    set({
      user,
      isAuthenticated: true,
    });
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(
          "auth-storage",
          JSON.stringify({
            state: {user, isAuthenticated: true},
          })
        );
      } catch (e) {
        console.error("Failed to save auth to localStorage", e);
      }
    }
  },
  logout: () => {
    set({
      user: null,
      isAuthenticated: false,
    });
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("auth-storage");
      } catch (e) {
        console.error("Failed to remove auth from localStorage", e);
      }
    }
  },
}));

