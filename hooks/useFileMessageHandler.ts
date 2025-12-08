import {useEffect} from "react";
import {checkFileValidation} from "@/utils/fileValidation";
import {UploadedFile} from "@/stores/uploadStore";

interface UseFileMessageHandlerProps {
  uploadedFiles: UploadedFile[];
  setUploadedFiles: (files: UploadedFile[]) => void;
  confirmFile: (fileId: string) => void;
  updateValidationStatus: (fileId: string, isValid: boolean) => void;
}

export function useFileMessageHandler({
  uploadedFiles,
  setUploadedFiles,
  confirmFile,
  updateValidationStatus,
}: UseFileMessageHandlerProps) {
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data.type === "FILE_CONFIRMED") {
        const {fileId, fileData} = event.data;

        console.log("파일 확인 메시지 수신:", {
          fileId,
          fileData,
        });

        // sessionStorage 먼저 업데이트
        try {
          sessionStorage.setItem(
            `uploadedFile_${fileId}`,
            JSON.stringify(fileData)
          );
        } catch (error) {
          console.error("sessionStorage 업데이트 실패:", error);
        }

        // 업로드된 파일 목록 업데이트 (해당 파일만 업데이트)
        const fileExists = uploadedFiles.some((f) => f.id === fileId);

        if (fileExists) {
          const updatedFiles = uploadedFiles.map((f) =>
            f.id === fileId ? fileData : f
          );
          setUploadedFiles(updatedFiles);
        } else {
          console.warn(`파일 ${fileId}가 목록에 없습니다. 추가합니다.`);
          setUploadedFiles([...uploadedFiles, fileData]);
        }

        // 파일이 확인되었음을 표시
        confirmFile(fileId);

        // validation 상태 업데이트 (약간의 지연을 두어 setUploadedFiles 완료 후 실행)
        setTimeout(() => {
          const isValid = checkFileValidation(fileData);
          updateValidationStatus(fileId, isValid);
        }, 100);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [uploadedFiles, setUploadedFiles, confirmFile, updateValidationStatus]);
}

