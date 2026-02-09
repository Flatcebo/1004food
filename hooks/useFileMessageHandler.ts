import {useEffect} from "react";
import {checkFileValidation} from "@/utils/fileValidation";
import {UploadedFile} from "@/stores/uploadStore";

interface UseFileMessageHandlerProps {
  uploadedFiles: UploadedFile[];
  setUploadedFiles: (files: UploadedFile[]) => void;
  confirmFile: (fileId: string) => void;
  updateValidationStatus: (fileId: string, isValid: boolean) => void;
  loadFilesFromServer?: () => Promise<void>;
  userGrade?: string;
  codes?: Array<{
    name: string;
    code: string;
    id?: number | string;
    [key: string]: any;
  }>;
}

export function useFileMessageHandler({
  uploadedFiles,
  setUploadedFiles,
  confirmFile,
  updateValidationStatus,
  loadFilesFromServer,
  userGrade,
  codes = [],
}: UseFileMessageHandlerProps) {
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data.type === "FILE_CONFIRMED") {
        const {fileId, fileData} = event.data;

        console.log("파일 확인 메시지 수신:", {
          fileId,
          fileName: fileData?.fileName,
          rowCount: fileData?.rowCount,
          productCodeMapSize: Object.keys(fileData?.productCodeMap || {})
            .length,
        });

        // vendorName을 즉시 반영 (메시지에서 받은 값 우선 사용)
        const vendorNameFromMessage =
          event.data.vendorName || fileData?.vendorName;

        // 즉시 파일 목록 업데이트 (vendorName 포함)
        const fileExists = uploadedFiles.some((f) => f.id === fileId);
        if (fileExists) {
          const updatedFiles = uploadedFiles.map((f) =>
            f.id === fileId
              ? {
                  ...f,
                  ...fileData,
                  vendorName:
                    vendorNameFromMessage || f.vendorName || undefined,
                }
              : f,
          );
          setUploadedFiles(updatedFiles);
          console.log("즉시 업데이트 성공:", {
            fileId,
            vendorName: vendorNameFromMessage,
          });
        } else {
          // 파일이 없으면 추가
          console.warn(`파일 ${fileId}가 목록에 없습니다. 추가합니다.`);
          setUploadedFiles([
            ...uploadedFiles,
            {
              ...fileData,
              vendorName:
                vendorNameFromMessage || fileData.vendorName || undefined,
            },
          ]);
        }

        // 서버에서 최신 데이터 불러오기 (약간의 지연을 두어 서버 업데이트 반영 시간 확보)
        if (loadFilesFromServer) {
          try {
            // 서버 업데이트가 완료될 시간을 확보하기 위해 더 긴 지연
            await new Promise((resolve) => setTimeout(resolve, 500));

            await loadFilesFromServer();

            // loadFilesFromServer 내부에서 이미 vendorName을 보존하도록 수정했으므로
            // 추가 확인은 불필요 (서버에서 vendorName이 없으면 기존 값 유지)

            console.log("서버에서 최신 데이터를 불러왔습니다.", {
              fileId,
              vendorName: vendorNameFromMessage,
            });
          } catch (error) {
            console.error("서버에서 데이터 불러오기 실패:", error);
          }
        } else {
          // loadFilesFromServer가 없으면 기존 방식 사용
          // sessionStorage 먼저 업데이트 (깊은 복사로 저장)
          try {
            const fileDataToStore = {
              ...fileData,
              tableData: [...(fileData.tableData || [])],
              headerIndex: {...(fileData.headerIndex || {})},
              productCodeMap: {...(fileData.productCodeMap || {})},
              vendorName:
                vendorNameFromMessage || fileData.vendorName || undefined,
            };

            sessionStorage.setItem(
              `uploadedFile_${fileId}`,
              JSON.stringify(fileDataToStore),
            );
            console.log("sessionStorage 업데이트 성공:", fileData.fileName);
          } catch (error) {
            console.error("sessionStorage 업데이트 실패:", error);
          }
        }

        // 파일이 확인되었음을 표시
        confirmFile(fileId);

        // validation 상태 업데이트 (약간의 지연을 두어 setUploadedFiles 완료 후 실행)
        setTimeout(() => {
          const fileProductIdMap = fileData.productIdMap || {};
          const validationResult = checkFileValidation(fileData, {
            userGrade,
            codes,
            productIdMap: fileProductIdMap,
          });
          updateValidationStatus(fileId, validationResult.isValid);
        }, 100);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [
    uploadedFiles,
    setUploadedFiles,
    confirmFile,
    updateValidationStatus,
    loadFilesFromServer,
    userGrade,
    codes,
  ]);
}
