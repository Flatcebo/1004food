"use client";

import {UploadedFile} from "@/stores/uploadStore";

interface UploadedFilesListProps {
  uploadedFiles: UploadedFile[];
  fileValidationStatus: {[fileId: string]: boolean};
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
  // if (uploadedFiles.length === 0) return null;

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
              <th className="border border-gray-300 px-4 py-2 text-center w-[160px]">
                작업
              </th>
            </tr>
          </thead>
          <tbody className="h-full">
            {uploadedFiles.map((file) => {
              const isValid = fileValidationStatus[file.id] !== false; // 기본값은 true
              return (
                <tr
                  key={file.id}
                  className={`${
                    isValid
                      ? "hover:bg-gray-50"
                      : "bg-red-50 hover:bg-red-100 cursor-pointer"
                  }`}
                  onClick={() => {
                    // 유효하지 않은 파일(연한 빨강 배경)만 클릭 가능
                    if (!isValid) {
                      onFileClick(file.id);
                    }
                  }}
                >
                  <td className="border border-gray-300 px-4 py-2">
                    {/* {file.venderName} */}
                  </td>
                  <td className="border border-gray-300 px-4 py-2">
                    {/* {file.uploadTime} */}
                  </td>
                  <td className="border border-gray-300 px-4 py-2">
                    {file.fileName}
                  </td>
                  <td className="border border-gray-300 px-4 py-2 text-center">
                    {file.rowCount}건
                  </td>
                  <td className="border border-gray-300 px-4 py-2 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        className={`px-3 py-1 text-white text-xs font-semibold rounded transition-colors ${
                          isValid
                            ? "bg-gray-400 cursor-not-allowed"
                            : "bg-blue-500 hover:bg-blue-600"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          // 유효하지 않은 파일(연한 빨강 배경)만 클릭 가능
                          if (!isValid) {
                            onFileClick(file.id);
                          }
                        }}
                        disabled={isValid}
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
