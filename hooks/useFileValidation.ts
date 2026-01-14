import {useState, useEffect, useRef, useCallback} from "react";
import {checkFileValidation} from "@/utils/fileValidation";
import {UploadedFile} from "@/stores/uploadStore";

export function useFileValidation(
  uploadedFiles: UploadedFile[],
  productCodeMap?: {[name: string]: string}
) {
  const [fileValidationStatus, setFileValidationStatus] = useState<{
    [fileId: string]: {isValid: boolean; errors: string[]};
  }>({});
  const productCodeMapRef = useRef(productCodeMap);
  const uploadedFilesRef = useRef(uploadedFiles);
  const previousFileIdsRef = useRef<Set<string>>(new Set());

  // 최신 값 유지
  useEffect(() => {
    productCodeMapRef.current = productCodeMap;
  }, [productCodeMap]);

  useEffect(() => {
    uploadedFilesRef.current = uploadedFiles;
  }, [uploadedFiles]);

  // validation 상태 업데이트 함수 (특정 파일만 검증)
  const updateValidation = useCallback((fileIds?: string[]) => {
    const currentFiles = uploadedFilesRef.current;
    const currentProductCodeMap = productCodeMapRef.current;

    if (currentFiles.length === 0) return;

    // 검증할 파일 ID 목록 (지정되지 않으면 모든 파일)
    const filesToValidate = fileIds
      ? currentFiles.filter((f: any) => fileIds.includes(f.id))
      : currentFiles;

    setFileValidationStatus((prevStatus) => {
      const newValidationStatus = {...prevStatus};

      filesToValidate.forEach((file: any) => {
        // DB에서 불러온 검증 상태가 있으면 우선 사용
        if (file.validationStatus) {
          newValidationStatus[file.id] = file.validationStatus;
          return;
        }

        // DB 검증 상태가 없으면 클라이언트에서 검증 수행
        const storedFile = sessionStorage.getItem(`uploadedFile_${file.id}`);
        let fileToCheck = file;
        if (storedFile) {
          try {
            const parsedStoredFile = JSON.parse(storedFile);
            // sessionStorage의 파일과 uploadedFiles의 파일을 병합
            // uploadedFiles의 vendorName을 우선 사용 (서버에서 최신 데이터)
            fileToCheck = {
              ...parsedStoredFile,
              ...file,
              // vendorName은 uploadedFiles의 값이 있으면 우선 사용
              vendorName: file.vendorName || parsedStoredFile.vendorName || undefined,
            };
          } catch (error) {
            console.error("파일 데이터 파싱 실패:", error);
            // 파싱 실패 시 uploadedFiles의 파일 사용
            fileToCheck = file;
          }
        }
        // 파일 자체에 productCodeMap이 있으면 우선 사용, 없으면 전역 productCodeMap 사용
        const fileProductCodeMap =
          fileToCheck.productCodeMap || currentProductCodeMap;
        if (fileProductCodeMap) {
          fileToCheck = {
            ...fileToCheck,
            productCodeMap: fileProductCodeMap,
          };
        }
        newValidationStatus[file.id] = checkFileValidation(fileToCheck);
      });

      return newValidationStatus;
    });
  }, []);

  // 파일 목록이나 productCodeMap이 변경될 때마다 validation 상태 업데이트
  // 새로 추가된 파일만 검증 실행, 자동 매핑 완료 후 재검증
  useEffect(() => {
    if (uploadedFiles.length === 0) {
      previousFileIdsRef.current = new Set();
      return;
    }

    // 현재 파일 ID 목록
    const currentFileIds = new Set(uploadedFiles.map((f: any) => f.id));

    // 새로 추가된 파일 ID 찾기
    const newFileIds = uploadedFiles
      .filter((f: any) => !previousFileIdsRef.current.has(f.id))
      .map((f: any) => f.id);

    // DB에서 불러온 검증 상태가 있으면 우선 사용
    const dbValidationStatus: {
      [fileId: string]: {isValid: boolean; errors: string[]};
    } = {};

    uploadedFiles.forEach((file: any) => {
      // DB에서 불러온 검증 상태가 있으면 사용
      if (file.validationStatus) {
        dbValidationStatus[file.id] = file.validationStatus;
      }
    });

    // DB 검증 상태가 있으면 먼저 설정
    if (Object.keys(dbValidationStatus).length > 0) {
      setFileValidationStatus((prev) => ({
        ...prev,
        ...dbValidationStatus,
      }));
    }

    // 새로 추가된 파일이 있으면 검증 수행
    if (newFileIds.length > 0) {
      // 파일 업로드 직후 즉시 검증 수행 (자동 매핑 전)
      updateValidation(newFileIds);

      // 자동 매핑 완료 후 재검증 (약간의 지연을 두어 자동 매핑 완료 후 실행)
      const timeoutId = setTimeout(() => {
        updateValidation(newFileIds);
      }, 500);

      // 이전 파일 ID 목록 업데이트
      previousFileIdsRef.current = currentFileIds;

      return () => {
        clearTimeout(timeoutId);
      };
    } else {
      // 새 파일이 없어도 기존 파일들의 vendorName이 업데이트되었을 수 있으므로 재검증
      // (서버에서 파일을 로드한 경우 등)
      const timeoutId = setTimeout(() => {
        updateValidation(); // 모든 파일 재검증
      }, 100);

      // 이전 파일 ID 목록 업데이트
      previousFileIdsRef.current = currentFileIds;

      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [uploadedFiles, productCodeMap, updateValidation]);

  const updateValidationStatus = (
    fileId: string,
    isValid: boolean,
    errors: string[] = []
  ) => {
    setFileValidationStatus((prev) => ({
      ...prev,
      [fileId]: {isValid, errors},
    }));
  };

  return {
    fileValidationStatus,
    updateValidationStatus,
    updateValidation,
  };
}
