import {useState, useEffect, useRef, useCallback} from "react";
import {checkFileValidation} from "@/utils/fileValidation";
import {UploadedFile} from "@/stores/uploadStore";

export function useFileValidation(
  uploadedFiles: UploadedFile[],
  productCodeMap?: {[name: string]: string}
) {
  const [fileValidationStatus, setFileValidationStatus] = useState<{
    [fileId: string]: boolean;
  }>({});
  const productCodeMapRef = useRef(productCodeMap);
  const uploadedFilesRef = useRef(uploadedFiles);

  // 최신 값 유지
  useEffect(() => {
    productCodeMapRef.current = productCodeMap;
  }, [productCodeMap]);

  useEffect(() => {
    uploadedFilesRef.current = uploadedFiles;
  }, [uploadedFiles]);

  // validation 상태 업데이트 함수
  const updateValidation = useCallback(() => {
    const currentFiles = uploadedFilesRef.current;
    const currentProductCodeMap = productCodeMapRef.current;
    
    if (currentFiles.length === 0) return;
    
    const newValidationStatus: {[fileId: string]: boolean} = {};
    currentFiles.forEach((file) => {
      const storedFile = sessionStorage.getItem(`uploadedFile_${file.id}`);
      let fileToCheck = file;
      if (storedFile) {
        try {
          fileToCheck = JSON.parse(storedFile);
        } catch (error) {
          console.error("파일 데이터 파싱 실패:", error);
        }
      }
      // 파일 자체에 productCodeMap이 있으면 우선 사용, 없으면 전역 productCodeMap 사용
      const fileProductCodeMap = fileToCheck.productCodeMap || currentProductCodeMap;
      if (fileProductCodeMap) {
        fileToCheck = {
          ...fileToCheck,
          productCodeMap: fileProductCodeMap,
        };
      }
      newValidationStatus[file.id] = checkFileValidation(fileToCheck);
    });
    setFileValidationStatus(newValidationStatus);
  }, []);

  // 파일 목록이나 productCodeMap이 변경될 때마다 validation 상태 업데이트
  // 엑셀 업로드 시 자동 매핑 완료 후 검증 실행
  useEffect(() => {
    if (uploadedFiles.length === 0) return;
    
    // 약간의 지연을 두어 자동 매핑 완료 후 검증
    const timeoutId = setTimeout(() => {
      updateValidation();
    }, 300);
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [uploadedFiles, productCodeMap, updateValidation]);

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

