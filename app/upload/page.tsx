"use client";

import DirectInputModal from "@/components/DirectInputModal";
import FileUploadArea from "@/components/FileUploadArea";
import UploadedFilesList from "@/components/UploadedFilesList";
import {useAutoMapping} from "@/hooks/useAutoMapping";
import {useFileSave} from "@/hooks/useFileSave";
import {useFileValidation} from "@/hooks/useFileValidation";
import {useUploadData} from "@/hooks/useUploadData";
import {useUploadStore} from "@/stores/uploadStore";
import {fieldNameMap} from "@/constants/fieldMappings";
import DataTable from "@/components/DataTable";
import {useEffect} from "react";
import {useDragAndDrop} from "@/hooks/useDragAndDrop";
import {useLoadingStore} from "@/stores/loadingStore";
import LoadingOverlay from "@/components/LoadingOverlay";

export default function Page() {
  // const {
  //   tableData,
  //   setTableData,
  //   isModalOpen,
  //   setIsModalOpen,
  //   dragActive,
  //   setDragActive,
  //   fileInputRef,
  //   setFileInputRef,
  //   fileName,
  //   setFileName,
  //   codes,
  //   setCodes,
  //   productCodeMap,
  //   setProductCodeMap,
  //   headerIndex,
  //   setHeaderIndex,
  //   recommendIdx,
  //   setRecommendIdx,
  //   recommendList,
  //   setRecommendList,
  //   handleInputCode,
  //   handleRecommendClick,
  //   handleSelectSuggest,
  //   directInputModal,
  //   setDirectInputValue,
  //   closeDirectInputModal,
  //   saveDirectInputModal,
  //   openDirectInputModal,
  //   uploadedFiles,
  //   setUploadedFiles,
  //   openFileInNewWindow,
  //   confirmedFiles,
  //   confirmFile,
  //   unconfirmFile,
  //   removeUploadedFile,
  //   handleFileChange,
  // } = useUploadStore();
  // const {isLoading, title, message, subMessage} = useLoadingStore();
  // const {fileValidationStatus, updateValidationStatus} = useFileValidation(
  //   uploadedFiles,
  //   productCodeMap
  // );
  // const {codesOriginRef} = useAutoMapping({
  //   tableData,
  //   codes,
  //   productCodeMap,
  //   headerIndex,
  //   setTableData,
  //   setProductCodeMap,
  //   setHeaderIndex,
  // });
  // const {
  //   filters,
  //   selectedType,
  //   setSelectedType,
  //   selectedPostType,
  //   setSelectedPostType,
  //   selectedVendor,
  //   setSelectedVendor,
  //   selectedOrderStatus,
  //   setSelectedOrderStatus,
  //   searchField,
  //   setSearchField,
  //   searchValue,
  //   setSearchValue,
  //   uploadTimeFrom,
  //   setUploadTimeFrom,
  //   uploadTimeTo,
  //   setUploadTimeTo,
  //   itemsPerPage,
  //   setItemsPerPage,
  //   appliedType,
  //   appliedPostType,
  //   appliedVendor,
  //   appliedOrderStatus,
  //   appliedSearchField,
  //   appliedSearchValue,
  //   appliedUploadTimeFrom,
  //   appliedUploadTimeTo,
  //   appliedItemsPerPage,
  //   setAppliedType,
  //   setAppliedPostType,
  //   setAppliedVendor,
  //   setAppliedOrderStatus,
  //   setAppliedSearchField,
  //   setAppliedSearchValue,
  //   setAppliedUploadTimeFrom,
  //   setAppliedUploadTimeTo,
  //   applySearchFilter,
  //   resetFilters,
  //   loading,
  //   currentPage,
  //   setCurrentPage,
  //   totalPages,
  //   totalCount,
  //   headers,
  //   paginatedRows,
  //   tableRows,
  //   fetchSavedData,
  // } = useUploadData();
  // const resetData = () => {
  //   setTableData([]);
  //   setFileName("");
  //   setProductCodeMap({});
  //   setUploadedFiles([]);
  //   setHeaderIndex(null);
  //   setRecommendIdx(null);
  //   setRecommendList([]);
  //   codesOriginRef.current = [];
  // };
  // const {handleSaveWithConfirmedFiles} = useFileSave({
  //   confirmedFiles,
  //   uploadedFiles,
  //   codes,
  //   fetchSavedData,
  //   resetData,
  //   unconfirmFile,
  // });
  // // 각 업로드된 파일에 자동 매핑 적용
  // useEffect(() => {
  //   if (uploadedFiles.length === 0 || codes.length === 0) return;
  //   // 약간의 지연을 두어 파일 업로드 완료 후 실행
  //   const timeoutId = setTimeout(() => {
  //     let hasChanges = false;
  //     const updatedFiles = uploadedFiles.map((file) => {
  //       if (!file.tableData || !file.tableData.length) return file;
  //       if (!file.headerIndex || typeof file.headerIndex.nameIdx !== "number")
  //         return file;
  //       const headerRow = file.tableData[0];
  //       const nameIdx = file.headerIndex.nameIdx;
  //       const mappingIdx = headerRow.findIndex((h: any) => h === "매핑코드");
  //       const typeIdx = headerRow.findIndex((h: any) => h === "내외주");
  //       const postTypeIdx = headerRow.findIndex((h: any) => h === "택배사");
  //       if (mappingIdx === -1 && typeIdx === -1 && postTypeIdx === -1)
  //         return file;
  //       let fileChanged = false;
  //       const fileProductCodeMap = {...file.productCodeMap};
  //       const updatedTableData = file.tableData.map((row, idx) => {
  //         if (idx === 0) return row;
  //         const nameVal = row[nameIdx];
  //         if (!nameVal || typeof nameVal !== "string") return row;
  //         const name = nameVal.trim();
  //         if (!name) return row;
  //         let rowChanged = false;
  //         let updatedRow = row;
  //         // 코드 우선순위: 파일의 productCodeMap > 전역 productCodeMap > codes 자동 매칭
  //         let codeVal = fileProductCodeMap[name] || productCodeMap[name];
  //         const found = codes.find((c: any) => c.name === name);
  //         if (!codeVal && found?.code) codeVal = found.code;
  //         if (mappingIdx >= 0 && codeVal && row[mappingIdx] !== codeVal) {
  //           if (!rowChanged) {
  //             updatedRow = [...row];
  //             rowChanged = true;
  //           }
  //           updatedRow[mappingIdx] = codeVal;
  //           fileChanged = true;
  //         }
  //         if (found) {
  //           if (typeIdx >= 0 && found.type && row[typeIdx] !== found.type) {
  //             if (!rowChanged) {
  //               updatedRow = [...row];
  //               rowChanged = true;
  //             }
  //             updatedRow[typeIdx] = found.type;
  //             fileChanged = true;
  //           }
  //           if (
  //             postTypeIdx >= 0 &&
  //             found.postType &&
  //             row[postTypeIdx] !== found.postType
  //           ) {
  //             if (!rowChanged) {
  //               updatedRow = [...row];
  //               rowChanged = true;
  //             }
  //             updatedRow[postTypeIdx] = found.postType;
  //             fileChanged = true;
  //           }
  //         }
  //         // productCodeMap에 비어있고 자동매칭된 코드가 있으면 map에도 채워둠
  //         if (!fileProductCodeMap[name] && found?.code) {
  //           fileProductCodeMap[name] = found.code;
  //         }
  //         return updatedRow;
  //       });
  //       if (fileChanged) {
  //         hasChanges = true;
  //         const updatedFile = {
  //           ...file,
  //           tableData: updatedTableData,
  //           productCodeMap: fileProductCodeMap,
  //         };
  //         // sessionStorage 업데이트
  //         try {
  //           sessionStorage.setItem(
  //             `uploadedFile_${file.id}`,
  //             JSON.stringify(updatedFile)
  //           );
  //         } catch (error) {
  //           console.error("sessionStorage 업데이트 실패:", error);
  //         }
  //         return updatedFile;
  //       }
  //       return file;
  //     });
  //     if (hasChanges) {
  //       setUploadedFiles(updatedFiles);
  //     }
  //   }, 500); // 파일 업로드 및 codes 로드 완료 후 실행
  //   return () => {
  //     clearTimeout(timeoutId);
  //   };
  // }, [uploadedFiles, codes, productCodeMap, setUploadedFiles]);
  // // 모달이 열릴 때 일부 데이터만 리셋 (파일 목록은 유지)
  // useEffect(() => {
  //   if (isModalOpen) {
  //     setTableData([]);
  //     setFileName("");
  //     setProductCodeMap({});
  //     setHeaderIndex(null);
  //     setRecommendIdx(null);
  //     setRecommendList([]);
  //     codesOriginRef.current = [];
  //   }
  // }, [
  //   isModalOpen,
  //   setTableData,
  //   setFileName,
  //   setProductCodeMap,
  //   setHeaderIndex,
  //   setRecommendIdx,
  //   setRecommendList,
  // ]);
  // // 상품 목록 fetch (DB에서)
  // useEffect(() => {
  //   if (!isModalOpen) return;
  //   const loadProducts = async () => {
  //     const {fetchProducts} = await import("@/utils/api");
  //     const result = await fetchProducts();
  //     if (result.success) {
  //       setCodes(result.data || []);
  //     }
  //   };
  //   loadProducts();
  // }, [isModalOpen, setCodes]);
  // const {handleDrop, handleDragOver, handleDragLeave} = useDragAndDrop({
  //   setDragActive,
  //   handleFileChange,
  // });
  // // const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
  // //   e.preventDefault();
  // //   setDragActive(false);
  // // };
  // // const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
  // //   e.preventDefault();
  // //   setDragActive(true);
  // // };
  // // const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
  // //   e.preventDefault();
  // //   setDragActive(false);
  // // };
  // const handleFileDelete = (fileId: string) => {
  //   removeUploadedFile(fileId);
  //   sessionStorage.removeItem(`uploadedFile_${fileId}`);
  // };
  // const handleResetData = () => {
  //   setTableData([]);
  //   setFileName("");
  //   setProductCodeMap({});
  //   setHeaderIndex(null);
  // };
  // const handleCloseModal = () => {
  //   setIsModalOpen(false);
  //   setTableData([]);
  //   setFileName("");
  //   setProductCodeMap({});
  //   // 파일 목록 및 관련 데이터 초기화
  //   setUploadedFiles([]);
  //   setHeaderIndex(null);
  //   setRecommendIdx(null);
  //   setRecommendList([]);
  //   codesOriginRef.current = [];
  //   // sessionStorage에서 업로드된 파일 데이터 제거
  //   uploadedFiles.forEach((file) => {
  //     sessionStorage.removeItem(`uploadedFile_${file.id}`);
  //   });
  //   // 확인된 파일 목록 초기화
  //   Array.from(confirmedFiles).forEach((fileId) => {
  //     unconfirmFile(fileId);
  //   });
  // };
  // const hasInvalidFiles = uploadedFiles.some(
  //   (file) => fileValidationStatus[file.id] === false
  // );
  // return (
  //   <div className="w-full h-full flex flex-col items-start justify-start p-4">
  //     {/* 업로드 로딩 오버레이 */}
  //     <LoadingOverlay
  //       isOpen={isLoading}
  //       title={title}
  //       message={message}
  //       subMessage={subMessage}
  //     />
  //     <div className="w-full h-full flex flex-col items-center justify-start bg-white p-8 rounded-lg shadow-md">
  //       <FileUploadArea
  //         dragActive={dragActive}
  //         fileInputRef={fileInputRef}
  //         onDrop={handleDrop}
  //         onDragOver={handleDragOver}
  //         onDragLeave={handleDragLeave}
  //         onFileChange={handleFileChange}
  //       />
  //       <UploadedFilesList
  //         uploadedFiles={uploadedFiles}
  //         fileValidationStatus={fileValidationStatus}
  //         onFileClick={openFileInNewWindow}
  //         onFileDelete={handleFileDelete}
  //         onResetData={handleResetData}
  //       />
  //       <DirectInputModal
  //         open={directInputModal.open}
  //         fields={directInputModal.fields}
  //         values={directInputModal.values}
  //         fieldNameMap={fieldNameMap}
  //         onClose={closeDirectInputModal}
  //         onSave={saveDirectInputModal}
  //         onValueChange={setDirectInputValue}
  //       />
  //       {uploadedFiles.length === 0 && (
  //         <DataTable
  //           tableData={tableData}
  //           fileName={fileName}
  //           headerIndex={headerIndex}
  //           productCodeMap={productCodeMap}
  //           codesOriginRef={codesOriginRef}
  //           codes={codes}
  //           recommendIdx={recommendIdx}
  //           recommendList={recommendList}
  //           onInputCode={handleInputCode}
  //           onRecommendClick={handleRecommendClick}
  //           onSelectSuggest={(selectedName, selectedCode, selectedItem) => {
  //             // 먼저 productCodeMap 업데이트
  //             const updatedProductCodeMap = {
  //               ...productCodeMap,
  //               [selectedName]: selectedCode,
  //             };
  //             setProductCodeMap(updatedProductCodeMap);
  //             // 매핑코드, 내외주, 택배사 실시간 업데이트
  //             if (tableData.length > 0 && headerIndex) {
  //               const headerRow = tableData[0];
  //               const mappingIdx = headerRow.findIndex(
  //                 (h: any) => h === "매핑코드"
  //               );
  //               const typeIdx = headerRow.findIndex((h: any) => h === "내외주");
  //               const postTypeIdx = headerRow.findIndex(
  //                 (h: any) => h === "택배사"
  //               );
  //               if (mappingIdx !== -1 || typeIdx !== -1 || postTypeIdx !== -1) {
  //                 // 선택한 항목의 데이터 사용 (없으면 codes에서 찾기)
  //                 const itemData =
  //                   selectedItem ||
  //                   codes.find(
  //                     (c: any) =>
  //                       c.name === selectedName && c.code === selectedCode
  //                   );
  //                 const updatedTable = tableData.map((row, idx) => {
  //                   if (idx === 0) return row;
  //                   const rowName = row[headerIndex.nameIdx!];
  //                   // 같은 상품명을 가진 모든 행 업데이트
  //                   if (
  //                     rowName &&
  //                     String(rowName).trim() === selectedName.trim()
  //                   ) {
  //                     const newRow = [...row];
  //                     if (mappingIdx !== -1 && selectedCode) {
  //                       newRow[mappingIdx] = selectedCode;
  //                     }
  //                     if (typeIdx !== -1 && itemData?.type) {
  //                       newRow[typeIdx] = itemData.type;
  //                     }
  //                     if (postTypeIdx !== -1 && itemData?.postType) {
  //                       newRow[postTypeIdx] = itemData.postType;
  //                     }
  //                     return newRow;
  //                   }
  //                   return row;
  //                 });
  //                 setTableData(updatedTable);
  //               }
  //             }
  //             // 모달 닫기
  //             handleSelectSuggest(selectedName, selectedCode);
  //           }}
  //           onDirectInput={openDirectInputModal}
  //           onCloseRecommend={() => setRecommendIdx(null)}
  //         />
  //       )}
  //       <div className="relative bottom-0 w-full h-[80px] flex flex-col items-end gap-[8px] mt-4">
  //         <div className="flex flex-row items-center justify-end gap-[16px] text-white font-semibold">
  //           <button
  //             onSubmit={async () => {
  //               const success = await handleSaveWithConfirmedFiles();
  //               if (success) {
  //                 handleCloseModal();
  //               }
  //             }}
  //             disabled={hasInvalidFiles}
  //             className={`px-[32px] py-[10px] rounded-md transition-colors ${
  //               hasInvalidFiles
  //                 ? "bg-gray-400 cursor-not-allowed"
  //                 : "bg-[#1ca2fb] hover:bg-[#1ca2fba0]"
  //             }`}
  //           >
  //             Upload
  //           </button>
  //         </div>
  //       </div>
  //     </div>
  //   </div>
  // );
}
