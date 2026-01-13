import {useCallback} from "react";
import {checkFileValidation} from "@/utils/fileValidation";
import {UploadedFile} from "@/stores/uploadStore";
import {useLoadingStore} from "@/stores/loadingStore";
import {PRODUCT_FIELD_ORDER} from "@/constants/productFields";
import {
  PRODUCT_COLUMN_MAPPINGS,
  mapExcelHeaderToDbColumn,
} from "@/constants/productColumnMappings";

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

  // console.log("codes", codes);
  // console.log("uploadedFiles", uploadedFiles);
  // console.log("confirmedFiles", confirmedFiles);
  // console.log("fetchSavedData", fetchSavedData);

  const handleSaveWithConfirmedFiles = useCallback(async () => {
    startLoading("업로드 중...", "업로드 준비 중...");

    try {
      // codes가 비어있으면 DB에서 직접 가져오기
      let productsToUse = codes;
      if (!productsToUse || productsToUse.length === 0) {
        updateLoadingMessage("상품 목록 로드 중...");
        const {fetchProducts} = await import("@/utils/api");
        const result = await fetchProducts();
        if (result.success && result.data) {
          productsToUse = result.data;
          console.log(
            "📦 DB에서 상품 목록 로드 완료:",
            productsToUse.length,
            "개"
          );
        } else {
          console.warn("⚠️ 상품 목록을 가져올 수 없습니다.");
        }
      }

      const confirmedFileIds = Array.from(confirmedFiles);
      let filesToUpload: any[] = [];
      // console.log("confirmedFileIds", confirmedFileIds);
      // console.log("uploadedFiles", uploadedFiles);

      // 체크박스가 체크된 파일만 업로드 (체크박스가 하나도 체크되지 않으면 업로드 불가)
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
          .filter((f) => f != null);
      } else {
        // 체크박스가 하나도 체크되지 않으면 업로드 불가
        alert("업로드할 파일을 선택해주세요.");
        stopLoading();
        return false;
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

        // 최신 파일 데이터 가져오기 (우선순위: sessionStorage > uploadedFiles)
        let fileToCheck = file;
        const storedFile = sessionStorage.getItem(`uploadedFile_${file.id}`);

        if (storedFile) {
          try {
            const parsedStoredFile = JSON.parse(storedFile);
            // sessionStorage의 데이터가 더 최신이면 사용
            fileToCheck = parsedStoredFile;
            // console.log(`파일 ${file.fileName}: sessionStorage에서 최신 데이터 사용`);
          } catch (error) {
            console.error("파일 데이터 파싱 실패:", error);
          }
        } else {
          // sessionStorage에 없으면 uploadedFiles에서 최신 데이터 찾기
          const latestFile = uploadedFiles.find((f) => f.id === file.id);
          if (latestFile) {
            fileToCheck = latestFile;
            // console.log(`파일 ${file.fileName}: uploadedFiles에서 최신 데이터 사용`);
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

      // 업체명 배열 추출 (드롭다운에서 선택한 업체명을 무조건 사용)
      const vendorNames: string[] = [];
      filesToUpload.forEach((file: any) => {
        if (!file.tableData || !file.headerIndex) return;

        // 파일 레벨의 업체명 (드롭다운에서 선택한 값) - row 확인 없이 무조건 사용
        let fileVendorName = file.vendorName
          ? String(file.vendorName).trim()
          : "";

        // vendorName이 비어있으면 테이블 데이터에서 업체명 찾기 (하위 호환성)
        if (!fileVendorName || fileVendorName === "") {
          const headerRow = file.tableData[0];
          const vendorIdx = headerRow.findIndex(
            (h: any) => h && typeof h === "string" && (h === "업체명" || h === "업체")
          );
          
          if (vendorIdx !== -1 && file.tableData.length > 1) {
            // 첫 번째 데이터 행에서 업체명 찾기
            const firstDataRow = file.tableData[1];
            const vendorFromTable = firstDataRow[vendorIdx];
            if (vendorFromTable && typeof vendorFromTable === "string") {
              fileVendorName = String(vendorFromTable).trim();
              console.warn(
                `⚠️ 파일 "${file.fileName}": 파일 객체의 vendorName이 비어있어 테이블 데이터에서 업체명을 찾았습니다: "${fileVendorName}"`
              );
            }
          }
          
          // 여전히 비어있으면 경고 로그
          if (!fileVendorName || fileVendorName === "") {
            console.error(
              `❌ 파일 "${file.fileName}": 업체명을 찾을 수 없습니다. 파일 객체의 vendorName도 비어있고 테이블 데이터에도 업체명 컬럼이 없습니다.`
            );
          }
        } else {
          console.log(
            `✅ 파일 "${file.fileName}": 파일 객체의 vendorName 사용: "${fileVendorName}"`
          );
        }

        // 모든 row에 동일한 업체명 사용
        const rowCount = file.tableData.length - 1; // 헤더 제외
        for (let i = 0; i < rowCount; i++) {
          vendorNames.push(fileVendorName || ""); // 빈 문자열이면 "미지정"이 됨
        }
      });

      // 내부 코드 일괄 생성
      let internalCodes: string[] = [];
      try {
        const response = await fetch("/api/internal-code/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({vendorNames}),
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

          // 모든 필드에 대한 인덱스 찾기 (mapExcelHeaderToDbColumn 사용)
          const fieldIndices: {[key: string]: number} = {};
          headerRow.forEach((header: any, index: number) => {
            if (header) {
              const dbColumn = mapExcelHeaderToDbColumn(String(header));
              if (dbColumn && !fieldIndices.hasOwnProperty(dbColumn)) {
                fieldIndices[dbColumn] = index;
              }
            }
          });

          // 디버깅: 헤더와 매핑된 인덱스 확인
          console.log("📋 헤더 행:", headerRow);
          console.log("🗺️ 필드 인덱스 매핑:", fieldIndices);

          // 하위 호환성을 위해 기존 변수명도 유지
          const typeIdx =
            fieldIndices.type ??
            headerRow.findIndex((h: any) => h === "내외주");
          const postTypeIdx =
            fieldIndices.postType ??
            headerRow.findIndex((h: any) => h === "택배사");
          const pkgIdx =
            fieldIndices.pkg ??
            headerRow.findIndex((h: any) => h === "합포수량");
          const priceIdx =
            fieldIndices.price ?? headerRow.findIndex((h: any) => h === "가격");
          const postFeeIdx =
            fieldIndices.postFee ??
            headerRow.findIndex((h: any) => h === "택배비");

          // productIdMap 업데이트를 위한 맵 생성
          const updatedProductIdMap = {...(file.productIdMap || {})};

          const rows = file.tableData.slice(1).map((row: any[]) => {
            const name =
              nameIdx !== -1 ? String(row[nameIdx] || "").trim() : "";

            const foundCode = productsToUse.find(
              (c: any) => String(c.name || "").trim() === name
            );
            const rawCode =
              file.productCodeMap?.[name] || foundCode?.code || "";
            const code = String(rawCode || "").trim();

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

            // 상품 정보 수집 (매핑코드가 있는 경우)
            // 상품명이 같다면 DB에 업데이트, 없다면 DB에 신규 등록
            if (name && code) {
              // 매핑된 상품 찾기: 사용자가 선택한 상품 ID 우선 사용
              // 1순위: 사용자가 선택한 상품 ID로 찾기 (productIdMap에 저장된 ID)
              // 2순위: 상품명이 정확히 일치하는 경우만 찾기
              // 3순위: 매핑코드로 찾기 (같은 매핑코드를 가진 여러 상품 중 첫 번째가 선택될 수 있음)
              const productIdMap = file.productIdMap || {};
              let matchedProduct = null;
              let productId = null;
              
              const selectedProductId = productIdMap[name];
              if (selectedProductId !== undefined) {
                // 사용자가 선택한 상품 ID가 있으면 그것으로 정확히 찾기 (무조건 사용자가 선택한 상품만 사용)
                matchedProduct = productsToUse.find(
                  (c: any) => c.id === selectedProductId
                );
                // 사용자가 선택한 상품 ID 저장 (다운로드 시 정확한 상품을 찾기 위함)
                productId = selectedProductId;
                rowData["productId"] = selectedProductId;
              }
              
              if (!matchedProduct) {
                // 사용자가 선택하지 않은 경우에만 상품명이 정확히 일치할 때만 찾기
                matchedProduct = productsToUse.find(
                  (c: any) => c.name && String(c.name).trim() === name
                );
                // 상품명으로 찾은 경우에도 ID 저장
                if (matchedProduct?.id) {
                  productId = matchedProduct.id;
                  rowData["productId"] = matchedProduct.id;
                }
              }
              
              if (!matchedProduct) {
                // 상품명으로도 찾지 못했으면 매핑코드로 찾기 (같은 매핑코드를 가진 여러 상품 중 첫 번째가 선택될 수 있음)
                matchedProduct = productsToUse.find((c: any) => {
                  const cCode = String(c.code || "").trim();
                  return cCode === code;
                });
                // 매핑코드로 찾은 경우에도 ID 저장
                if (matchedProduct?.id) {
                  productId = matchedProduct.id;
                  rowData["productId"] = matchedProduct.id;
                }
              }

              // productIdMap 업데이트 (productId가 있으면)
              if (productId && name) {
                updatedProductIdMap[name] = productId;
              }

              // 디버깅: 첫 번째 상품만 로그 출력
              if (newProducts.length === 0) {
                console.log("🔍 상품 찾기 시도:", {
                  name,
                  code,
                  codeLength: code.length,
                  productsLength: productsToUse.length,
                  foundInProducts: productsToUse.some((c: any) => {
                    const cCode = String(c.code || "").trim();
                    return cCode === code;
                  }),
                  sampleProducts: productsToUse.slice(0, 3).map((c: any) => ({
                    name: c.name,
                    code: c.code,
                    codeType: typeof c.code,
                    codeTrimmed: String(c.code || "").trim(),
                  })),
                });
              }

              // 매핑코드로 찾지 못했으면 이름으로 찾기
              if (!matchedProduct) {
                matchedProduct = foundCode;
              }

              // 상품의 모든 필드를 포함하여 초기화
              const productInfo: any = {
                name: name,
                code: code,
              };

              // 상품의 모든 필드를 기본값으로 초기화
              PRODUCT_FIELD_ORDER.forEach((field) => {
                if (!productInfo[field]) {
                  // 택배사(postType)는 null 대신 빈 문자열로 초기화
                  productInfo[field] = field === "postType" ? "" : null;
                }
              });

              // 매핑된 상품이 있으면 그 정보를 우선 사용 (기본값)
              if (matchedProduct) {
                // 기존 상품의 모든 정보를 복사 (기존 업로드 데이터 유지)
                Object.keys(matchedProduct).forEach((key) => {
                  if (
                    key !== "id" &&
                    key !== "createdAt" &&
                    key !== "updatedAt" &&
                    key !== "name" // name은 현재 row의 name 사용
                  ) {
                    // 택배사(postType)는 null을 빈 문자열로 변환
                    if (key === "postType") {
                      productInfo[key] = matchedProduct[key] || "";
                    } else {
                      productInfo[key] = matchedProduct[key];
                    }
                  }
                });

                // 디버깅: 첫 번째 상품만 로그 출력
                if (newProducts.length === 0) {
                  console.log(
                    "🔍 매핑코드로 찾은 상품 정보:",
                    code,
                    matchedProduct
                  );
                  console.log(
                    "📦 매핑된 상품 정보에서 가져온 모든 필드:",
                    productInfo
                  );
                }
              } else {
                // 디버깅: 매핑된 상품을 찾지 못한 경우
                if (newProducts.length === 0) {
                  console.log(
                    "⚠️ 매핑된 상품을 찾지 못함:",
                    "name=",
                    name,
                    "code=",
                    code
                  );
                }
              }

              // row에 있는 데이터로 업데이트 (값이 있는 경우에만 덮어쓰기)
              // 모든 필드를 PRODUCT_COLUMN_MAPPINGS를 사용하여 매핑
              Object.keys(PRODUCT_COLUMN_MAPPINGS).forEach((dbColumn) => {
                const fieldIdx = fieldIndices[dbColumn];
                if (
                  fieldIdx !== undefined &&
                  fieldIdx >= 0 &&
                  row[fieldIdx] !== undefined &&
                  row[fieldIdx] !== null &&
                  row[fieldIdx] !== ""
                ) {
                  const value = row[fieldIdx];
                  const trimmedValue = String(value).trim();

                  // 빈 문자열이 아닌 경우에만 업데이트
                  if (trimmedValue !== "") {
                    // 디버깅: 첫 번째 상품만 로그 출력
                    if (newProducts.length === 0) {
                      console.log(
                        `  📝 필드 매핑: ${dbColumn} (인덱스 ${fieldIdx}) = "${trimmedValue}"`
                      );
                    }

                    // 숫자 필드 처리
                    if (
                      dbColumn === "price" ||
                      dbColumn === "salePrice" ||
                      dbColumn === "postFee"
                    ) {
                      const numValue = parseInt(trimmedValue);
                      if (!isNaN(numValue)) {
                        productInfo[dbColumn] = numValue;
                      }
                    }
                    // 문자열 필드 처리
                    else {
                      // 택배사(postType) 필드는 빈 문자열도 유효한 값으로 처리
                      if (dbColumn === "postType") {
                        productInfo[dbColumn] = trimmedValue || "";
                      } else {
                        productInfo[dbColumn] = trimmedValue;
                      }
                    }
                  }
                } else if (fieldIdx !== undefined && fieldIdx >= 0) {
                  // 디버깅: 값이 비어있는 경우
                  if (newProducts.length === 0) {
                    console.log(
                      `  ⚠️ 필드 비어있음: ${dbColumn} (인덱스 ${fieldIdx}) = ${row[fieldIdx]}`
                    );
                  }
                } else {
                  // 디버깅: 필드가 엑셀에 없는 경우
                  if (newProducts.length === 0) {
                    console.log(
                      `  ℹ️ 필드 없음: ${dbColumn} (엑셀에 해당 헤더가 없음)`
                    );
                  }
                }
              });

              // 하위 호환성을 위해 기존 로직도 유지 (fieldIndices에 없는 경우만)
              // 이미 위의 forEach 루프에서 처리된 필드는 건너뛰기
              if (
                typeIdx >= 0 &&
                fieldIndices.type === undefined &&
                row[typeIdx]
              ) {
                productInfo.type = row[typeIdx];
              }
              if (
                postTypeIdx >= 0 &&
                fieldIndices.postType === undefined &&
                row[postTypeIdx]
              ) {
                // 택배사 값이 있으면 trim하고, 없으면 빈 문자열로 설정
                const postTypeValue = String(row[postTypeIdx] || "").trim();
                productInfo.postType = postTypeValue || "";
              } else if (fieldIndices.postType === undefined) {
                // 택배사 필드가 없거나 값이 없으면 빈 문자열로 설정
                productInfo.postType = "";
              }
              if (
                pkgIdx >= 0 &&
                fieldIndices.pkg === undefined &&
                row[pkgIdx]
              ) {
                productInfo.pkg = String(row[pkgIdx]);
              }
              if (
                priceIdx >= 0 &&
                fieldIndices.price === undefined &&
                row[priceIdx]
              ) {
                productInfo.price = parseInt(String(row[priceIdx])) || null;
              }
              if (
                postFeeIdx >= 0 &&
                fieldIndices.postFee === undefined &&
                row[postFeeIdx]
              ) {
                productInfo.postFee = parseInt(String(row[postFeeIdx])) || null;
              }

              // 택배사가 null이면 빈 문자열로 정규화 (NULL은 UNIQUE 제약조건에서 서로 다른 값으로 취급되므로)
              if (
                productInfo.postType === null ||
                productInfo.postType === undefined
              ) {
                productInfo.postType = "";
              }

              console.log("productInfo >>>", productInfo);
              console.log("newProducts >>>", newProducts);
              // 이미 수집된 상품인지 확인 (중복 방지) - 상품명, 매핑코드, 택배사 모두 같아야 중복으로 간주
              // 택배사는 null/undefined를 빈 문자열로 정규화하여 비교
              const normalizedPostType = productInfo.postType || "";
              const existingProduct = newProducts.find((p) => {
                const pPostType = p.postType || "";
                return (
                  p.name === name &&
                  p.code === code &&
                  pPostType === normalizedPostType
                );
              });
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
            productIdMap: updatedProductIdMap, // 업데이트된 productIdMap 포함
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

          console.log("newProducts", newProducts);
          const {batchCreateProducts} = await import("@/utils/api");
          const productResult = await batchCreateProducts(newProducts);

          console.log("productResult", productResult);
          if (!productResult.success) {
            console.warn("신규 상품 저장 실패:", productResult.error);
            // 상품 저장 실패해도 업로드는 계속 진행
          }
        }

        // 임시 저장된 데이터를 정식으로 저장하고 임시 데이터 삭제
        updateLoadingMessage("임시 저장 데이터를 정식 저장 중...");

        // 저장할 파일들을 서버에서 확인 상태로 업데이트
        const fileIdsToConfirm =
          confirmedFileIds.length > 0
            ? confirmedFileIds
            : filesToUpload.map((f) => f.id);

        // 각 파일을 서버에서 is_confirmed = true로 업데이트
        const updatePromises = fileIdsToConfirm.map(async (fileId) => {
          const file = filesToUpload.find((f) => f.id === fileId);
          if (!file) return null;

          // uploadData에서 해당 파일의 업데이트된 productIdMap 찾기
          const uploadDataItem = uploadData.find((d: any) => d.fileName === file.fileName);
          const updatedProductIdMap = uploadDataItem?.productIdMap || {};

          // 최신 파일 데이터 가져오기
          let fileData = file;
          const storedFile = sessionStorage.getItem(`uploadedFile_${fileId}`);
          if (storedFile) {
            try {
              fileData = JSON.parse(storedFile);
            } catch (error) {
              console.error("파일 데이터 파싱 실패:", error);
            }
          }

          // 기존 productIdMap과 업데이트된 productIdMap 병합 (업데이트된 것이 우선)
          const mergedProductIdMap = {
            ...(fileData.productIdMap || {}),
            ...updatedProductIdMap,
          };

          // company-id 헤더 포함
          const headers: HeadersInit = {
            "Content-Type": "application/json",
          };

          if (typeof window !== "undefined") {
            try {
              const stored = localStorage.getItem("auth-storage");
              if (stored) {
                const parsed = JSON.parse(stored);
                const user = parsed.state?.user;
                if (user?.companyId) {
                  headers["company-id"] = user.companyId.toString();
                }
              }
            } catch (e) {
              console.error("인증 정보 로드 실패:", e);
            }
          }

          // 서버에 파일 업데이트 및 확인 상태 설정
          const updateResponse = await fetch("/api/upload/temp/update", {
            method: "PUT",
            headers,
            body: JSON.stringify({
              fileId: fileData.id,
              tableData: fileData.tableData,
              headerIndex: fileData.headerIndex,
              productCodeMap: fileData.productCodeMap || {},
              productIdMap: mergedProductIdMap, // 업데이트된 productIdMap 사용
              vendorName: fileData.vendorName || null, // vendorName 포함
              mallId: fileData.mallId || null, // mallId 포함
              isConfirmed: true,
            }),
          });

          console.log("📤 useFileSave에서 업데이트 요청:", {
            fileId: fileData.id,
            fileName: fileData.fileName,
            vendorName: fileData.vendorName,
            mallId: fileData.mallId,
          });

          const updateResult = await updateResponse.json();
          if (!updateResult.success) {
            console.error(
              `파일 ${fileData.fileName} 확인 상태 업데이트 실패:`,
              updateResult.error
            );
            return null;
          }
          return fileId;
        });

        await Promise.all(updatePromises);

        // company-id 헤더 포함
        const confirmHeaders: HeadersInit = {
          "Content-Type": "application/json",
        };

        if (typeof window !== "undefined") {
          try {
            const stored = localStorage.getItem("auth-storage");
            if (stored) {
              const parsed = JSON.parse(stored);
              const user = parsed.state?.user;
              if (user?.companyId) {
                confirmHeaders["company-id"] = user.companyId.toString();
              }
            }
          } catch (e) {
            console.error("인증 정보 로드 실패:", e);
          }
        }

        // 확인된 파일들을 정식으로 저장
        const response = await fetch("/api/upload/temp/confirm", {
          method: "POST",
          headers: confirmHeaders,
          body: JSON.stringify({}),
        });

        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error || "데이터 저장 실패");
        }

        updateLoadingMessage("저장 완료! 데이터 새로고침 중...");

        alert("데이터가 성공적으로 저장되었습니다.");

        await fetchSavedData();

        // 업로드 후 모든 데이터 리셋
        resetData();
        Array.from(confirmedFiles).forEach((fileId) => {
          unconfirmFile(fileId);
          // sessionStorage에서도 제거
          sessionStorage.removeItem(`uploadedFile_${fileId}`);
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
