import {useState, useEffect, useRef, useCallback} from "react";
import {checkFileValidation} from "@/utils/fileValidation";
import {UploadedFile} from "@/stores/uploadStore";

// 매 렌더마다 새 참조가 생성되는 것을 방지 (useEffect 무한 루프 방지)
const STABLE_EMPTY_CODES: any[] = [];
const STABLE_EMPTY_PRODUCT_ID_MAP: {[name: string]: string | number} = {};

interface UseFileValidationOptions {
  userGrade?: string;
  codes?: Array<{
    name: string;
    code: string;
    id?: number | string;
    [key: string]: any;
  }>;
  productIdMap?: {[name: string]: string | number};
}

export function useFileValidation(
  uploadedFiles: UploadedFile[],
  productCodeMap?: {[name: string]: string},
  options?: UseFileValidationOptions,
) {
  const {
    userGrade,
    codes = STABLE_EMPTY_CODES,
    productIdMap = STABLE_EMPTY_PRODUCT_ID_MAP,
  } = options || {};
  const [fileValidationStatus, setFileValidationStatus] = useState<{
    [fileId: string]: {isValid: boolean; errors: string[]};
  }>({});
  const productCodeMapRef = useRef(productCodeMap);
  const uploadedFilesRef = useRef(uploadedFiles);
  const previousFileIdsRef = useRef<Set<string>>(new Set());
  const previousVendorNamesRef = useRef<{[fileId: string]: string}>({});
  const updateValidationRef = useRef<typeof updateValidation>(() => {});

  // 최신 값 유지
  useEffect(() => {
    productCodeMapRef.current = productCodeMap;
  }, [productCodeMap]);

  useEffect(() => {
    uploadedFilesRef.current = uploadedFiles;
  }, [uploadedFiles]);

  // validation 상태 업데이트 함수 (특정 파일만 검증)
  const updateValidation = useCallback(
    (fileIds?: string[]) => {
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
          // DB에서 불러온 검증 상태가 있더라도 vendorName이 있으면 재검증
          // (서버의 검증 상태가 업체명 입력 전 상태일 수 있음)
          const hasVendorName =
            file.vendorName && String(file.vendorName).trim() !== "";
          if (file.validationStatus && !hasVendorName) {
            // vendorName이 없을 때만 서버의 검증 상태 사용
            newValidationStatus[file.id] = file.validationStatus;
            return;
          }
          // vendorName이 있으면 항상 재검증 (서버의 검증 상태가 오래된 것일 수 있음)

          // DB 검증 상태가 없으면 클라이언트에서 검증 수행
          const storedFile = sessionStorage.getItem(`uploadedFile_${file.id}`);
          let fileToCheck = file;
          if (storedFile) {
            try {
              const parsedStoredFile = JSON.parse(storedFile);
              // sessionStorage의 파일과 uploadedFiles의 파일을 병합
              // uploadedFiles의 vendorName을 무조건 우선 사용 (서버에서 최신 데이터)
              // 서버에서 가져온 vendorName이 있으면 무조건 사용
              const serverVendorName = file.vendorName;
              const storedVendorName = parsedStoredFile.vendorName;

              fileToCheck = {
                ...parsedStoredFile,
                ...file,
                // vendorName은 서버에서 가져온 값(file.vendorName)을 최우선으로 사용
                // 서버에 값이 있으면 무조건 사용, 없으면 sessionStorage 값 사용
                vendorName:
                  serverVendorName !== null &&
                  serverVendorName !== undefined &&
                  String(serverVendorName).trim() !== ""
                    ? String(serverVendorName).trim()
                    : storedVendorName || undefined,
              };
            } catch (error) {
              console.error("파일 데이터 파싱 실패:", error);
              // 파싱 실패 시 uploadedFiles의 파일 사용
              fileToCheck = file;
            }
          } else {
            // sessionStorage에 파일이 없으면 uploadedFiles의 파일 사용
            console.log(
              `⚠️ sessionStorage에 파일 없음: fileId=${file.id}, vendorName="${file.vendorName}"`,
            );
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

          // 파일별 productIdMap 사용 (세션스토리지에 저장된 값 우선, 없으면 전역 productIdMap)
          const fileProductIdMap = fileToCheck.productIdMap || productIdMap;

          newValidationStatus[file.id] = checkFileValidation(fileToCheck, {
            userGrade,
            codes,
            productIdMap: fileProductIdMap,
          });
        });

        return newValidationStatus;
      });
    },
    [userGrade, codes, productIdMap],
  );

  // updateValidation ref 업데이트
  useEffect(() => {
    updateValidationRef.current = updateValidation;
  }, [updateValidation]);

  // 파일 목록이나 productCodeMap이 변경될 때마다 validation 상태 업데이트
  // 새로 추가된 파일만 검증 실행, 자동 매핑 완료 후 재검증
  useEffect(() => {
    if (uploadedFiles.length === 0) {
      previousFileIdsRef.current = new Set();
      previousVendorNamesRef.current = {};
      return;
    }

    // 현재 파일 ID 목록
    const currentFileIds = new Set(uploadedFiles.map((f: any) => f.id));

    // 새로 추가된 파일 ID 찾기
    const newFileIds = uploadedFiles
      .filter((f: any) => !previousFileIdsRef.current.has(f.id))
      .map((f: any) => f.id);

    // vendorName이 변경된 파일 ID 찾기
    const vendorNameChangedFileIds = uploadedFiles
      .filter((file: any) => {
        const currentVendorName = String(file.vendorName || "").trim();
        const previousVendorName =
          previousVendorNamesRef.current[file.id] || "";
        return currentVendorName !== previousVendorName;
      })
      .map((f: any) => f.id);

    // DB에서 불러온 검증 상태가 있으면 우선 사용
    const dbValidationStatus: {
      [fileId: string]: {isValid: boolean; errors: string[]};
    } = {};

    uploadedFiles.forEach((file: any) => {
      // DB에서 불러온 검증 상태가 있더라도 vendorName이 있으면 재검증
      // (서버의 검증 상태가 업체명 입력 전 상태일 수 있음)
      const hasVendorName =
        file.vendorName && String(file.vendorName).trim() !== "";
      if (file.validationStatus && !hasVendorName) {
        // vendorName이 없을 때만 서버의 검증 상태 사용
        dbValidationStatus[file.id] = file.validationStatus;
      }
    });

    // DB 검증 상태가 있으면 먼저 설정 (vendorName이 없는 파일만)
    if (Object.keys(dbValidationStatus).length > 0) {
      setFileValidationStatus((prev) => ({
        ...prev,
        ...dbValidationStatus,
      }));
    }

    // 새로 추가된 파일이 있으면 검증 수행
    if (newFileIds.length > 0) {
      // 파일 업로드 직후 즉시 검증 수행 (자동 매핑 전)
      if (updateValidationRef.current) {
        updateValidationRef.current(newFileIds);
      }

      // 자동 매핑 완료 후 재검증 (약간의 지연을 두어 자동 매핑 완료 후 실행)
      const timeoutId = setTimeout(() => {
        if (updateValidationRef.current) {
          updateValidationRef.current(newFileIds);
        }
      }, 500);

      // 이전 파일 ID 목록 및 vendorName 업데이트
      previousFileIdsRef.current = currentFileIds;
      uploadedFiles.forEach((file: any) => {
        previousVendorNamesRef.current[file.id] = String(
          file.vendorName || "",
        ).trim();
      });

      return () => {
        clearTimeout(timeoutId);
      };
    } else if (vendorNameChangedFileIds.length > 0) {
      // vendorName이 변경된 파일만 재검증
      if (updateValidationRef.current) {
        updateValidationRef.current(vendorNameChangedFileIds);
      }

      // 이전 vendorName 업데이트
      uploadedFiles.forEach((file: any) => {
        previousVendorNamesRef.current[file.id] = String(
          file.vendorName || "",
        ).trim();
      });

      // 이전 파일 ID 목록 업데이트
      previousFileIdsRef.current = currentFileIds;
    } else {
      // 변경사항이 없으면 이전 파일 ID 목록만 업데이트
      previousFileIdsRef.current = currentFileIds;
    }
  }, [uploadedFiles, productCodeMap, codes, productIdMap]);

  const updateValidationStatus = (
    fileId: string,
    isValid: boolean,
    errors: string[] = [],
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
