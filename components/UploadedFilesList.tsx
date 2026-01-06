"use client";

import {useLoadingStore} from "@/stores/loadingStore";
import {UploadedFile, useUploadStore} from "@/stores/uploadStore";
import {useCallback, useMemo} from "react";

interface UploadedFilesListProps {
  uploadedFiles: UploadedFile[];
  fileValidationStatus: {
    [fileId: string]: {isValid: boolean; errors: string[]};
  };
  validatingFiles?: Set<string>;
  onFileClick: (fileId: string) => void;
  onFileDelete: (fileId: string) => void;
  onResetData: () => void;
}

export default function UploadedFilesList({
  uploadedFiles,
  fileValidationStatus,
  onFileClick,
  onFileDelete,
  onResetData,
}: UploadedFilesListProps) {
  const {isLoading} = useLoadingStore();
  const {confirmedFiles, confirmFile, unconfirmFile} = useUploadStore();

  // 전체 체크 상태 계산
  const isAllChecked = useMemo(() => {
    if (uploadedFiles.length === 0) return false;
    return uploadedFiles.every((file) => confirmedFiles.has(file.id));
  }, [uploadedFiles, confirmedFiles]);

  // 일부만 체크된 상태 계산
  const isIndeterminate = useMemo(() => {
    const checkedCount = uploadedFiles.filter((file) =>
      confirmedFiles.has(file.id)
    ).length;
    return checkedCount > 0 && checkedCount < uploadedFiles.length;
  }, [uploadedFiles, confirmedFiles]);

  // 전체 체크/해제 핸들러
  const handleSelectAll = useCallback(() => {
    if (isAllChecked) {
      // 전체 해제
      uploadedFiles.forEach((file) => unconfirmFile(file.id));
    } else {
      // 전체 체크
      uploadedFiles.forEach((file) => confirmFile(file.id));
    }
  }, [isAllChecked, uploadedFiles, confirmFile, unconfirmFile]);

  // 개별 체크/해제 핸들러
  const handleToggleFile = useCallback(
    (fileId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (confirmedFiles.has(fileId)) {
        unconfirmFile(fileId);
      } else {
        confirmFile(fileId);
      }
    },
    [confirmedFiles, confirmFile, unconfirmFile]
  );

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="w-full h-auto mt-4">
      <div className="font-bold text-lg mb-2 text-black flex flex-row justify-between">
        <span>업로드된 파일 목록 ({uploadedFiles.length}개)</span>
        <span>
          전체 {uploadedFiles.reduce((sum, file) => sum + file.rowCount, 0)}건
        </span>
      </div>
      <div className="w-full h-[500px] border border-gray-300 rounded-lg overflow-y-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-2 text-center w-[50px]">
                <input
                  type="checkbox"
                  checked={isAllChecked}
                  ref={(input) => {
                    if (input) input.indeterminate = isIndeterminate;
                  }}
                  onChange={handleSelectAll}
                  className="w-4 h-4 cursor-pointer"
                />
              </th>
              <th className="border border-gray-300 px-4 py-2 text-center w-[200px]">
                업체명
              </th>
              <th className="border border-gray-300 px-4 py-2 text-center w-[160px]">
                업로드 일시
              </th>
              <th className="border border-gray-300 px-4 py-2 text-center">
                파일명
              </th>
              <th className="border border-gray-300 px-4 py-2 text-center w-[100px]">
                건수
              </th>
              <th className="border border-gray-300 px-4 py-2 text-center w-[200px]">
                검증 상태
              </th>
              <th className="border border-gray-300 px-4 py-2 text-center w-[160px]">
                작업
              </th>
            </tr>
          </thead>
          <tbody className="h-full">
            {uploadedFiles.map((file) => {
              const validationResult = fileValidationStatus[file.id] || {
                isValid: true,
                errors: [],
              };
              const isValid = validationResult.isValid;
              const isChecked = confirmedFiles.has(file.id);
              return (
                <tr
                  key={file.id}
                  className={`${
                    // "bg-red-50 hover:bg-red-100 cursor-pointer"
                    isValid
                      ? "hover:bg-gray-50"
                      : "bg-red-50 hover:bg-red-100 cursor-pointer"
                  }`}
                  onClick={() => {
                    // 유효하지 않은 파일(연한 빨강 배경)만 클릭 가능
                    onFileClick(file.id);
                    if (!isValid) {
                    }
                  }}
                >
                  <td
                    className="border border-gray-300 px-4 py-2 text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      onClick={(e) => handleToggleFile(file.id, e)}
                      className="w-4 h-4 cursor-pointer"
                    />
                  </td>
                  <td className="border border-gray-300 px-4 py-2">
                    {file.vendorName || "-"}
                  </td>
                  <td className="border border-gray-300 px-4 py-2">
                    {(() => {
                      const dateStr = file.createdAt || file.uploadTime;
                      if (!dateStr) return "-";
                      
                      // UTC 시간을 한국 시간(KST)으로 변환
                      const date = new Date(dateStr);
                      
                      // 한국 시간대(Asia/Seoul)로 변환하여 표시
                      return date.toLocaleString("ko-KR", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Asia/Seoul",
                      });
                    })()}
                  </td>
                  <td className="border border-gray-300 px-4 py-2">
                    {file.fileName}
                  </td>
                  <td className="border border-gray-300 px-4 py-2 text-center">
                    {file.rowCount}건
                  </td>
                  <td className="border border-gray-300 px-4 py-2 text-center">
                    {isValid ? (
                      <span className="text-green-600 font-semibold">
                        ✓ 검증 통과
                      </span>
                    ) : (
                      <div className="text-red-600">
                        <div className="font-semibold mb-1">✗ 검증 실패</div>
                        <div className="text-xs max-h-20 overflow-y-auto">
                          {validationResult.errors
                            .slice(0, 3)
                            .map((error, idx) => (
                              <div key={idx} className="mb-1">
                                {error}
                              </div>
                            ))}
                          {validationResult.errors.length > 3 && (
                            <div className="text-gray-500">
                              외 {validationResult.errors.length - 3}건...
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="border border-gray-300 px-4 py-2 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        className={`px-3 py-1 text-white text-xs font-semibold rounded transition-colors ${
                          "bg-blue-500 hover:bg-blue-600"
                          // isValid
                          //   ? "bg-gray-400 cursor-not-allowed"
                          //   : "bg-blue-500 hover:bg-blue-600"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          // 유효하지 않은 파일(연한 빨강 배경)만 클릭 가능
                          onFileClick(file.id);
                          // if (!isValid) {}
                        }}
                        // disabled={isValid}
                      >
                        보기
                      </button>
                      <button
                        className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            confirm(
                              `"${file.fileName}" 파일을 삭제하시겠습니까?`
                            )
                          ) {
                            onFileDelete(file.id);
                            // 모든 파일이 삭제되면 데이터 리셋
                            const remainingFiles = uploadedFiles.filter(
                              (f) => f.id !== file.id
                            );
                            if (remainingFiles.length === 0) {
                              onResetData();
                            }
                          }
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
