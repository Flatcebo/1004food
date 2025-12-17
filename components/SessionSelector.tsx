"use client";

import {useState, useEffect} from "react";
import {useUploadStore} from "@/stores/uploadStore";

interface SessionData {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
  confirmedCount: number;
  displayName: string;
}

interface SessionSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSessionSelect: (sessionId: string) => void;
}

export default function SessionSelector({
  isOpen,
  onClose,
  onSessionSelect,
}: SessionSelectorProps) {
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const {sessionId: currentSessionId} = useUploadStore();

  // 세션 목록 로드
  const loadSessions = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/upload/temp/sessions");
      const result = await response.json();
      if (result.success) {
        setSessions(result.data || []);
      } else {
        console.error("세션 목록 로드 실패:", result.error);
      }
    } catch (error) {
      console.error("세션 목록 로드 중 오류:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSessions();
    }
  }, [isOpen]);

  const handleSessionSelect = () => {
    if (selectedSessionId && selectedSessionId !== currentSessionId) {
      onSessionSelect(selectedSessionId);
    }
    onClose();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-[600px] max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">
            업로드 세션 선택
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            다른 컴퓨터에서 업로드한 파일을 확인하고 수정할 수 있습니다.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-gray-600">
                세션 목록을 불러오는 중...
              </span>
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>다른 업로드 세션이 없습니다.</p>
              <p className="text-sm mt-1">
                다른 컴퓨터에서 파일을 업로드한 후 다시 시도해주세요.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => (
                <div
                  key={session.sessionId}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedSessionId === session.sessionId
                      ? "border-blue-500 bg-blue-50"
                      : session.sessionId === currentSessionId
                      ? "border-green-500 bg-green-50"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                  onClick={() => setSelectedSessionId(session.sessionId)}
                >
                  <div className="flex items-center justify-between p-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-gray-800">
                          {session.displayName}
                        </h3>
                        {session.sessionId === currentSessionId && (
                          <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
                            현재 세션
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        <p>
                          확인됨: {session.confirmedCount}/{session.fileCount}개
                        </p>
                        <p>업데이트: {formatDate(session.updatedAt)}</p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <input
                        type="radio"
                        name="session"
                        checked={selectedSessionId === session.sessionId}
                        onChange={() => setSelectedSessionId(session.sessionId)}
                        className="w-4 h-4 text-blue-600"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
          >
            취소
          </button>
          <button
            onClick={handleSessionSelect}
            disabled={
              !selectedSessionId || selectedSessionId === currentSessionId
            }
            className={`px-4 py-2 rounded text-white ${
              !selectedSessionId || selectedSessionId === currentSessionId
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            선택
          </button>
        </div>
      </div>
    </div>
  );
}
