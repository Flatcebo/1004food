import {create} from "zustand";

interface LoadingState {
  isLoading: boolean;
  title: string;
  message: string;
  subMessage: string;
  setLoading: (
    isLoading: boolean,
    options?: {
      title?: string;
      message?: string;
      subMessage?: string;
    }
  ) => void;
  startLoading: (title?: string, message?: string, subMessage?: string) => void;
  updateLoadingMessage: (message: string) => void;
  stopLoading: () => void;
}

export const useLoadingStore = create<LoadingState>((set) => ({
  isLoading: false,
  title: "처리 중...",
  message: "",
  subMessage: "잠시만 기다려주세요",

  setLoading: (isLoading, options = {}) => {
    set({
      isLoading,
      title: options.title ?? "처리 중...",
      message: options.message ?? "",
      subMessage: options.subMessage ?? "잠시만 기다려주세요",
    });
  },

  startLoading: (
    title = "처리 중...",
    message = "",
    subMessage = "잠시만 기다려주세요"
  ) => {
    set({
      isLoading: true,
      title,
      message,
      subMessage,
    });
  },

  updateLoadingMessage: (message) => {
    set({message});
  },

  stopLoading: () => {
    set({
      isLoading: false,
      title: "처리 중...",
      message: "",
      subMessage: "잠시만 기다려주세요",
    });
  },
}));
