import {useState, useEffect} from "react";
import {checkFileValidation} from "@/utils/fileValidation";
import {UploadedFile} from "@/stores/uploadStore";

export function useFileValidation(uploadedFiles: UploadedFile[]) {
  const [fileValidationStatus, setFileValidationStatus] = useState<{
    [fileId: string]: boolean;
  }>({});

  // 파일 목록이 변경될 때마다 validation 상태 업데이트
  useEffect(() => {
    const newValidationStatus: {[fileId: string]: boolean} = {};
    uploadedFiles.forEach((file) => {
      const storedFile = sessionStorage.getItem(`uploadedFile_${file.id}`);
      let fileToCheck = file;
      if (storedFile) {
        try {
          fileToCheck = JSON.parse(storedFile);
        } catch (error) {
          console.error("파일 데이터 파싱 실패:", error);
        }
      }
      newValidationStatus[file.id] = checkFileValidation(fileToCheck);
    });
    setFileValidationStatus(newValidationStatus);
  }, [uploadedFiles]);

  const updateValidationStatus = (fileId: string, isValid: boolean) => {
    setFileValidationStatus((prev) => ({
      ...prev,
      [fileId]: isValid,
    }));
  };

  return {
    fileValidationStatus,
    updateValidationStatus,
  };
}

