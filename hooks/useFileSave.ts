import {useCallback} from "react";
import {checkFileValidation} from "@/utils/fileValidation";
import {UploadedFile} from "@/stores/uploadStore";
import {useLoadingStore} from "@/stores/loadingStore";

interface UseFileSaveProps {
  confirmedFiles: Set<string>;
  uploadedFiles: UploadedFile[];
  codes: Array<{name: string; code: string; [key: string]: any}>;
  fetchSavedData: () => Promise<void>;
  resetData: () => void;
  unconfirmFile: (fileId: string) => void;
}

export function useFileSave({
  confirmedFiles,
  uploadedFiles,
  codes,
  fetchSavedData,
  resetData,
  unconfirmFile,
}: UseFileSaveProps) {
  const {startLoading, updateLoadingMessage, stopLoading} = useLoadingStore();

  const handleSaveWithConfirmedFiles = useCallback(async () => {
    startLoading("업로드 중...", "업로드 준비 중...");

    try {
      const confirmedFileIds = Array.from(confirmedFiles);
      let filesToUpload: any[] = [];

      // 확인된 파일이 있으면 확인된 파일 사용, 없으면 일반 업로드된 파일 사용
      if (confirmedFileIds.length > 0) {
        filesToUpload = confirmedFileIds
          .map((fileId) => {
            const storedFile = sessionStorage.getItem(`uploadedFile_${fileId}`);
            if (storedFile) {
              try {
                return JSON.parse(storedFile);
              } catch (error) {
                console.error("파일 데이터 파싱 실패:", error);
                return null;
              }
            }
            return uploadedFiles.find((f) => f.id === fileId);
          })
          .filter((f) => f !== null);
      } else {
        filesToUpload = uploadedFiles.map((file) => {
          const storedFile = sessionStorage.getItem(`uploadedFile_${file.id}`);
          if (storedFile) {
            try {
              return JSON.parse(storedFile);
            } catch (error) {
              console.error("파일 데이터 파싱 실패:", error);
              return file;
            }
          }
          return file;
        });
      }

      if (filesToUpload.length === 0) {
        alert("업로드할 파일이 없습니다.");
        stopLoading();
        return false;
      }

      updateLoadingMessage("파일 유효성 검사 중...");

      // 업로드 전 validation 체크: 모든 파일이 유효해야 함 (연한 빨강 리스트가 없어야 함)
      const invalidFiles: string[] = [];
      for (const file of filesToUpload) {
        if (!file) {
          invalidFiles.push("알 수 없는 파일");
          continue;
        }

        const storedFile = sessionStorage.getItem(`uploadedFile_${file.id}`);
        let fileToCheck = file;
        if (storedFile) {
          try {
            fileToCheck = JSON.parse(storedFile);
          } catch (error) {
            console.error("파일 데이터 파싱 실패:", error);
          }
        }

        const isValid = checkFileValidation(fileToCheck);
        if (!isValid) {
          const fileName =
            fileToCheck?.fileName || file?.fileName || "알 수 없는 파일";
          invalidFiles.push(fileName);
        }
      }

      if (invalidFiles.length > 0) {
        alert(
          `다음 파일에 매핑코드나 업체명이 공란인 row가 있습니다:\n\n${invalidFiles.join(
            "\n"
          )}\n\n모든 row의 매핑코드와 업체명을 입력해주세요.`
        );
        stopLoading();
        return false;
      }

      updateLoadingMessage("상품 데이터 처리 중...");

      // 각 파일의 데이터를 매핑코드와 함께 변환 및 신규 상품 수집
      const newProducts: any[] = [];

      // 전체 row 개수 계산
      const totalRows = filesToUpload.reduce((sum, file: any) => {
        if (!file.tableData) return sum;
        return sum + (file.tableData.length - 1); // 헤더 제외
      }, 0);

      updateLoadingMessage(`내부 코드 생성 중... (${totalRows}개)`);

      // 내부 코드 일괄 생성
      let internalCodes: string[] = [];
      try {
        const response = await fetch("/api/internal-code/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({count: totalRows}),
        });
        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error || "내부 코드 생성 실패");
        }
        internalCodes = result.codes;
      } catch (error: any) {
        console.error("내부 코드 생성 실패:", error);
        alert(`내부 코드 생성 중 오류가 발생했습니다: ${error.message}`);
        stopLoading();
        return false;
      }

      updateLoadingMessage("업로드 데이터 준비 중...");

      let codeIndex = 0;
      const uploadData = filesToUpload
        .map((file: any) => {
          if (!file.tableData || !file.headerIndex) return null;

          const headerRow = file.tableData[0];
          const nameIdx = file.headerIndex.nameIdx;
          const mappingIdx = headerRow.findIndex((h: any) => h === "매핑코드");

          const typeIdx = headerRow.findIndex((h: any) => h === "내외주");
          const postTypeIdx = headerRow.findIndex((h: any) => h === "택배사");
          const pkgIdx = headerRow.findIndex((h: any) => h === "합포수량");
          const priceIdx = headerRow.findIndex((h: any) => h === "가격");
          const postFeeIdx = headerRow.findIndex((h: any) => h === "택배비");

          const rows = file.tableData.slice(1).map((row: any[]) => {
            const name = nameIdx !== -1 ? row[nameIdx] : "";

            const foundCode = codes.find((c: any) => c.name === name);
            const code = file.productCodeMap?.[name] || foundCode?.code || "";

            const rowData: any = {};
            headerRow.forEach((header: any, idx: number) => {
              // 파일명 컬럼은 제외
              if (header !== "파일명") {
                rowData[header] = row[idx];
              }
            });
            rowData["매핑코드"] = code;
            rowData["주문상태"] = "공급중"; // 기본값 설정
            rowData["내부코드"] = internalCodes[codeIndex++]; // 내부 코드 추가

            // 신규 상품 정보 수집 (매핑코드가 있고, codes에 없는 경우)
            if (name && code && !foundCode) {
              const productInfo: any = {
                name: name,
                code: code,
              };

              // 각 필드에서 정보 추출
              if (typeIdx >= 0 && row[typeIdx]) {
                productInfo.type = row[typeIdx];
              }
              if (postTypeIdx >= 0 && row[postTypeIdx]) {
                productInfo.postType = row[postTypeIdx];
              }
              if (pkgIdx >= 0 && row[pkgIdx]) {
                productInfo.pkg = String(row[pkgIdx]);
              }
              if (priceIdx >= 0 && row[priceIdx]) {
                productInfo.price = parseInt(String(row[priceIdx])) || null;
              }
              if (postFeeIdx >= 0 && row[postFeeIdx]) {
                productInfo.postFee = parseInt(String(row[postFeeIdx])) || null;
              }

              // 이미 수집된 상품인지 확인 (중복 방지)
              const existingProduct = newProducts.find(
                (p) => p.name === name && p.code === code
              );
              if (!existingProduct) {
                newProducts.push(productInfo);
              }
            }

            if (foundCode) {
              if (typeIdx >= 0 && foundCode.type) {
                rowData["내외주"] = foundCode.type;
              }
              if (postTypeIdx >= 0 && foundCode.postType) {
                rowData["택배사"] = foundCode.postType;
              }
            }

            return rowData;
          });

          return {
            fileName: file.fileName,
            rowCount: file.rowCount,
            data: rows,
          };
        })
        .filter((d: any) => d !== null);

      updateLoadingMessage("데이터베이스에 저장 중...");

      // DB에 저장
      try {
        // 신규 상품이 있으면 먼저 products 테이블에 저장
        if (newProducts.length > 0) {
          updateLoadingMessage(
            `신규 상품 저장 중... (${newProducts.length}개)`
          );
          const {batchCreateProducts} = await import("@/utils/api");
          const productResult = await batchCreateProducts(newProducts);
          if (!productResult.success) {
            console.warn("신규 상품 저장 실패:", productResult.error);
            // 상품 저장 실패해도 업로드는 계속 진행
          }
        }

        // 업로드 데이터 저장
        for (let i = 0; i < uploadData.length; i++) {
          const fileData = uploadData[i];
          if (!fileData) continue;

          updateLoadingMessage(
            `파일 저장 중... (${i + 1}/${uploadData.length})`
          );

          const response = await fetch("/api/upload/save", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              fileName: fileData.fileName,
              rowCount: fileData.rowCount,
              data: fileData.data,
            }),
          });

          const result = await response.json();
          if (!result.success) {
            throw new Error(result.error || "데이터 저장 실패");
          }
        }

        updateLoadingMessage("저장 완료! 데이터 새로고침 중...");

        alert("데이터가 성공적으로 저장되었습니다.");

        await fetchSavedData();

        // 업로드 후 모든 데이터 리셋
        resetData();
        Array.from(confirmedFiles).forEach((fileId) => {
          unconfirmFile(fileId);
        });

        stopLoading();
        return true;
      } catch (error: any) {
        console.error("데이터 저장 실패:", error);
        alert(`데이터 저장 중 오류가 발생했습니다: ${error.message}`);
        stopLoading();
        return false;
      }
    } catch (error: any) {
      console.error("업로드 중 오류:", error);
      alert(`업로드 중 오류가 발생했습니다: ${error.message}`);
      stopLoading();
      return false;
    }
  }, [
    confirmedFiles,
    uploadedFiles,
    codes,
    fetchSavedData,
    resetData,
    unconfirmFile,
    startLoading,
    updateLoadingMessage,
    stopLoading,
  ]);

  return {
    handleSaveWithConfirmedFiles,
  };
}
