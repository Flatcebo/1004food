import React, {useState} from "react";
import {useUploadStore} from "@/stores/uploadStore";
import {IoClose, IoCheckmarkCircle, IoTime} from "react-icons/io5";

interface SessionSelectorModalProps {
  open: boolean;
  onClose: () => void;
  onSelectSession: (sessionId: string | null) => void;
}

export default function SessionSelectorModal({
  open,
  onClose,
  onSelectSession,
}: SessionSelectorModalProps) {
  const {
    availableSessions,
    currentSession,
    selectedSessionId,
    loadSessions,
    switchToSession,
  } = useUploadStore();

  const [loading, setLoading] = useState(false);
  const [savedSelectedId, setSavedSelectedId] = useState<string | null>(null);

  // 모달이 열릴 때 세션 목록 새로고침하되 선택 상태는 유지
  React.useEffect(() => {
    if (open) {
      setSavedSelectedId(selectedSessionId);
      handleRefresh();
    }
  }, [open]);

  // 세션 목록이 로드된 후 선택 상태 복원
  React.useEffect(() => {
    if (
      open &&
      savedSelectedId !== null &&
      savedSelectedId !== selectedSessionId
    ) {
      // 선택 상태가 변경되었으면 원래 상태로 복원
      setSavedSelectedId(null);
    }
  }, [availableSessions, selectedSessionId, savedSelectedId, open]);

  const handleSessionSelect = async (sessionId: string | null) => {
    setLoading(true);
    try {
      if (sessionId === "all") {
        // 모든 세션 선택
        onSelectSession(null);
      } else {
        // 특정 세션 선택
        const session = availableSessions.find(
          (s) => s.sessionId === sessionId
        );
        if (session) {
          await switchToSession(session);
          onSelectSession(sessionId);
        }
      }
      onClose();
    } catch (error) {
      console.error("세션 변경 실패:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const currentSelectedId = selectedSessionId;
      await loadSessions();
      // refresh 후 선택 상태 복원 (loadSessions에서 localStorage에서 불러오므로 필요 없음)
    } catch (error) {
      console.error("세션 목록 새로고침 실패:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#00000080] bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[80vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">세션 선택</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
              title="새로고침"
            >
              <IoTime className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <IoClose className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 세션 목록 */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {/* 현재 세션 옵션 */}
            {currentSession && (
              <div
                onClick={() => handleSessionSelect(currentSession.sessionId)}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedSessionId === currentSession.sessionId
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">
                      {currentSession.sessionName} (현재 세션)
                    </div>
                    <div className="text-sm text-gray-500">
                      생성일:{" "}
                      {new Date(currentSession.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  {selectedSessionId === currentSession.sessionId && (
                    <IoCheckmarkCircle className="w-5 h-5 text-blue-500" />
                  )}
                </div>
              </div>
            )}

            {/* 모든 세션 옵션 */}
            <div
              onClick={() => handleSessionSelect("all")}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                selectedSessionId === null
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">모든 세션</div>
                  <div className="text-sm text-gray-500">
                    모든 사용자의 파일 보기
                  </div>
                </div>
                {selectedSessionId === null && (
                  <IoCheckmarkCircle className="w-5 h-5 text-blue-500" />
                )}
              </div>
            </div>

            {/* 다른 세션 목록 (현재 세션 제외) */}
            {availableSessions
              .filter(
                (session) => session.sessionId !== currentSession?.sessionId
              )
              .map((session) => (
                <div
                  key={session.sessionId}
                  onClick={() => handleSessionSelect(session.sessionId)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedSessionId === session.sessionId
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900">
                        {session.sessionName}
                      </div>
                      <div className="text-sm text-gray-500">
                        생성일:{" "}
                        {new Date(session.createdAt).toLocaleDateString()}
                      </div>
                      {session.userId && (
                        <div className="text-xs text-gray-400">사용자 세션</div>
                      )}
                    </div>
                    {selectedSessionId === session.sessionId && (
                      <IoCheckmarkCircle className="w-5 h-5 text-blue-500" />
                    )}
                  </div>
                </div>
              ))}

            {availableSessions.length === 0 && !loading && (
              <div className="text-center py-8 text-gray-500">
                <div className="text-sm">사용 가능한 세션이 없습니다.</div>
                <button
                  onClick={handleRefresh}
                  className="mt-2 text-blue-500 hover:text-blue-600 text-sm underline"
                >
                  새로고침
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
