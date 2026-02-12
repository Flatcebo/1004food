"use client";

import ModalPortal from "@/components/ModalPortal";

interface LoadingOverlayProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  subMessage?: string;
}

export default function LoadingOverlay({
  isOpen,
  title = "처리 중...",
  message = "",
  subMessage = "잠시만 기다려주세요",
}: LoadingOverlayProps) {
  if (!isOpen) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-9999 flex items-center justify-center bg-[#00000080] bg-opacity-50">
        <div className="bg-white rounded-lg shadow-xl px-8 py-6 flex flex-col items-center gap-4 min-w-[300px]">
          {/* 스피너 */}
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>

          {/* 타이틀 */}
          <div className="text-lg font-semibold text-gray-800">{title}</div>

          {/* 진행 메시지 */}
          {message && (
            <div className="text-sm text-gray-600 text-center">{message}</div>
          )}

          {/* 서브 메시지 */}
          {subMessage && (
            <div className="text-xs text-gray-500 mt-2">{subMessage}</div>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
