"use client";

import {useEffect, useState, useRef} from "react";
import {useUploadStore} from "@/stores/uploadStore";
import {useAuthStore} from "@/stores/authStore";
import {useLoadingStore} from "@/stores/loadingStore";
import FileUploadArea from "@/components/FileUploadArea";
import LoadingOverlay from "@/components/LoadingOverlay";
import {useDragAndDrop} from "@/hooks/useDragAndDrop";

export default function Page() {
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 인증 정보 (임시: 로그인 기능 미구현으로 임시 사용자 설정)
  const {user, isAuthenticated} = useAuthStore();

  // 임시 사용자 정보 (로그인 기능이 구현될 때까지 사용)
  const tempUser = user || { id: 'temp-user-001', name: '임시 사용자', role: 'user' };
  const tempIsAuthenticated = true; // 임시로 항상 true로 설정

  // 업로드 스토어
  const {
    uploadedFiles,
    removeUploadedFile,
    unconfirmFile,
    handleFileChange,
    loadFilesFromServer,
  } = useUploadStore();

  // 로딩 상태
  const {isLoading, title, message, subMessage} = useLoadingStore();

  // 페이지 로드 시 서버에서 파일 리스트 가져오기
  useEffect(() => {
    if (isAuthenticated) {
      loadFilesFromServer();
    }
  }, [loadFilesFromServer, isAuthenticated]);

  // 드래그 앤 드롭 훅
  const {handleDrop, handleDragOver, handleDragLeave} = useDragAndDrop({
    setDragActive,
    handleFileChange,
  });

  // 파일 삭제 핸들러
  const handleFileDelete = async (fileId: string) => {
    if (confirm("정말로 이 발주서를 삭제하시겠습니까?")) {
      try {
        const response = await fetch(`/api/upload/temp/delete?fileId=${fileId}`, {
          method: "DELETE",
        });
        const result = await response.json();

        if (result.success) {
          removeUploadedFile(fileId);
          unconfirmFile(fileId);
          sessionStorage.removeItem(`uploadedFile_${fileId}`);
        } else {
          console.error("서버에서 파일 삭제 실패:", result.error);
        }
      } catch (error) {
        console.error("서버에서 파일 삭제 실패:", error);
      }
    }
  };

  // 사용자 파일 필터링 (임시: 로그인 기능 미구현으로 모든 파일 표시)
  const userFiles = uploadedFiles.filter(file => {
    // 임시 사용자는 모든 파일 표시 (로그인 기능 구현 후에는 본인 파일만 필터링)
    if (tempUser.id === 'temp-user-001') return true;

    // 실제 로그인된 사용자는 본인 파일만 표시
    return file.userId === tempUser.id;
  });

  // 임시: 로그인 기능 미구현 상태에서 접근 허용

  return (
    <div className="w-full h-full flex flex-col items-start justify-start px-4 py-6">
      {/* 업로드 로딩 오버레이 */}
      <LoadingOverlay
        isOpen={isLoading}
        title={title}
        message={message}
        subMessage={subMessage}
      />

      <div className="w-full">
        {/* 헤더 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">발주서 업로드</h1>
          <p className="text-gray-600">
            엑셀 파일을 업로드하여 발주서를 관리하세요.
          </p>
          <p className="text-sm text-blue-600 mt-1">
            현재 사용자: {tempUser.name} ({tempUser.role})
          </p>
        </div>

        {/* 파일 업로드 영역 */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">파일 업로드</h2>
          <FileUploadArea
            dragActive={dragActive}
            fileInputRef={fileInputRef}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onFileChange={handleFileChange}
            multiple={true}
            title="발주서 엑셀 파일을 드래그하거나 클릭하여 선택"
            description="엑셀(.xlsx, .xls) 파일만 가능합니다 (여러 파일 선택 가능)"
          />
        </div>

        {/* 업로드된 발주서 목록 */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold mb-4">내 발주서 목록 ({userFiles.length}개)</h2>

          {userFiles.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              업로드된 발주서가 없습니다.
            </div>
          ) : (
            <div className="w-full border border-gray-300 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border border-gray-300 px-4 py-3 text-left font-semibold">ID</th>
                    <th className="border border-gray-300 px-4 py-3 text-left font-semibold">업로드 일시</th>
                    <th className="border border-gray-300 px-4 py-3 text-left font-semibold">파일명</th>
                    <th className="border border-gray-300 px-4 py-3 text-center font-semibold w-24">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {userFiles.map((file) => (
                    <tr key={file.id} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-4 py-3">{file.id}</td>
                      <td className="border border-gray-300 px-4 py-3">
                        {file.uploadTime ? new Date(file.uploadTime).toLocaleString() : '알 수 없음'}
                      </td>
                      <td className="border border-gray-300 px-4 py-3">{file.fileName}</td>
                      <td className="border border-gray-300 px-4 py-3 text-center">
                        <button
                          onClick={() => handleFileDelete(file.id)}
                          className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded transition-colors"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

