"use client";

import {useEffect} from "react";
import {useUploadStore} from "@/stores/uploadStore";
import ModalTable from "@/components/ModalTable";
import FileUploadArea from "@/components/FileUploadArea";
import UploadedFilesList from "@/components/UploadedFilesList";
import SavedDataTable from "@/components/SavedDataTable";
import DataFilters from "@/components/DataFilters";
import DirectInputModal from "@/components/DirectInputModal";
import DataTable from "@/components/DataTable";
import {useUploadData} from "@/hooks/useUploadData";
import {useFileValidation} from "@/hooks/useFileValidation";
import {useFileMessageHandler} from "@/hooks/useFileMessageHandler";
import {useAutoMapping} from "@/hooks/useAutoMapping";
import {useFileSave} from "@/hooks/useFileSave";
import {useDragAndDrop} from "@/hooks/useDragAndDrop";
import {fieldNameMap} from "@/constants/fieldMappings";

export default function UploadPage() {
  const {
    tableData,
    setTableData,
    isModalOpen,
    setIsModalOpen,
    dragActive,
    setDragActive,
    fileInputRef,
    setFileInputRef,
    fileName,
    setFileName,
    codes,
    setCodes,
    productCodeMap,
    setProductCodeMap,
    headerIndex,
    setHeaderIndex,
    recommendIdx,
    setRecommendIdx,
    recommendList,
    setRecommendList,
    handleInputCode,
    handleRecommendClick,
    handleSelectSuggest,
    directInputModal,
    setDirectInputValue,
    closeDirectInputModal,
    saveDirectInputModal,
    openDirectInputModal,
    uploadedFiles,
    setUploadedFiles,
    openFileInNewWindow,
    confirmedFiles,
    confirmFile,
    unconfirmFile,
    removeUploadedFile,
    handleFileChange,
  } = useUploadStore();

  // 저장된 데이터 관련 훅
  const {
    filters,
    selectedType,
    setSelectedType,
    selectedPostType,
    setSelectedPostType,
    selectedVendor,
    setSelectedVendor,
    selectedOrderStatus,
    setSelectedOrderStatus,
    searchField,
    setSearchField,
    searchValue,
    setSearchValue,
    uploadTimeFrom,
    setUploadTimeFrom,
    uploadTimeTo,
    setUploadTimeTo,
    itemsPerPage,
    setItemsPerPage,
    appliedType,
    appliedPostType,
    appliedVendor,
    appliedOrderStatus,
    appliedSearchField,
    appliedSearchValue,
    appliedUploadTimeFrom,
    appliedUploadTimeTo,
    appliedItemsPerPage,
    setAppliedType,
    setAppliedPostType,
    setAppliedVendor,
    setAppliedOrderStatus,
    setAppliedSearchField,
    setAppliedSearchValue,
    setAppliedUploadTimeFrom,
    setAppliedUploadTimeTo,
    applySearchFilter,
    resetFilters,
    loading,
    currentPage,
    setCurrentPage,
    totalPages,
    totalCount,
    headers,
    paginatedRows,
    tableRows,
    fetchSavedData,
  } = useUploadData();

  // 필터 제거 함수
  const handleRemoveFilter = (filterType: string) => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(
      today.getMonth() + 1
    ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    switch (filterType) {
      case "type":
        setSelectedType("");
        setAppliedType("");
        break;
      case "postType":
        setSelectedPostType("");
        setAppliedPostType("");
        break;
      case "vendor":
        setSelectedVendor("");
        setAppliedVendor("");
        break;
      case "orderStatus":
        setSelectedOrderStatus("공급중");
        setAppliedOrderStatus("공급중");
        break;
      case "search":
        setSearchField("");
        setSearchValue("");
        setAppliedSearchField("");
        setAppliedSearchValue("");
        break;
      case "dateRange":
        setUploadTimeFrom(todayStr);
        setUploadTimeTo(todayStr);
        setAppliedUploadTimeFrom(todayStr);
        setAppliedUploadTimeTo(todayStr);
        break;
    }
  };

  // 파일 검증 관련 훅
  const {fileValidationStatus, updateValidationStatus} = useFileValidation(
    uploadedFiles,
    productCodeMap
  );

  // 검증이 통과한 파일들을 자동으로 확인 처리
  useEffect(() => {
    if (uploadedFiles.length === 0) return;

    // 약간의 지연을 두어 검증 완료 후 실행
    const timeoutId = setTimeout(() => {
      uploadedFiles.forEach((file) => {
        const isValid = fileValidationStatus[file.id] !== false; // 기본값은 true
        const isConfirmed = confirmedFiles.has(file.id);

        // 검증이 통과했고 아직 확인되지 않은 파일만 자동 확인
        if (isValid && !isConfirmed) {
          // sessionStorage에서 최신 파일 데이터 가져오기
          const storedFile = sessionStorage.getItem(`uploadedFile_${file.id}`);
          let fileToConfirm = file;

          if (storedFile) {
            try {
              fileToConfirm = JSON.parse(storedFile);
            } catch (error) {
              console.error("파일 데이터 파싱 실패:", error);
            }
          }

          // sessionStorage에 최신 상태 저장 (확인 처리와 동일한 로직)
          try {
            sessionStorage.setItem(
              `uploadedFile_${file.id}`,
              JSON.stringify(fileToConfirm)
            );
          } catch (error) {
            console.error("sessionStorage 업데이트 실패:", error);
          }

          // 자동 확인 처리
          confirmFile(file.id);
        }
      });
    }, 500); // 검증 완료 후 약간의 지연

    return () => {
      clearTimeout(timeoutId);
    };
  }, [fileValidationStatus, uploadedFiles, confirmedFiles, confirmFile]);

  // 메시지 핸들러 훅
  useFileMessageHandler({
    uploadedFiles,
    setUploadedFiles,
    confirmFile,
    updateValidationStatus,
  });

  // 자동 매핑 훅
  const {codesOriginRef} = useAutoMapping({
    tableData,
    codes,
    productCodeMap,
    headerIndex,
    setTableData,
    setProductCodeMap,
    setHeaderIndex,
  });

  // 각 업로드된 파일에 자동 매핑 적용
  useEffect(() => {
    if (uploadedFiles.length === 0 || codes.length === 0) return;

    // 약간의 지연을 두어 파일 업로드 완료 후 실행
    const timeoutId = setTimeout(() => {
      let hasChanges = false;
      const updatedFiles = uploadedFiles.map((file) => {
        if (!file.tableData || !file.tableData.length) return file;
        if (!file.headerIndex || typeof file.headerIndex.nameIdx !== "number")
          return file;

        const headerRow = file.tableData[0];
        const nameIdx = file.headerIndex.nameIdx;
        const mappingIdx = headerRow.findIndex((h: any) => h === "매핑코드");
        const typeIdx = headerRow.findIndex((h: any) => h === "내외주");
        const postTypeIdx = headerRow.findIndex((h: any) => h === "택배사");

        if (mappingIdx === -1 && typeIdx === -1 && postTypeIdx === -1)
          return file;

        let fileChanged = false;
        const fileProductCodeMap = {...file.productCodeMap};

        const updatedTableData = file.tableData.map((row, idx) => {
          if (idx === 0) return row;

          const nameVal = row[nameIdx];
          if (!nameVal || typeof nameVal !== "string") return row;
          const name = nameVal.trim();
          if (!name) return row;

          let rowChanged = false;
          let updatedRow = row;

          // 코드 우선순위: 파일의 productCodeMap > 전역 productCodeMap > codes 자동 매칭
          let codeVal = fileProductCodeMap[name] || productCodeMap[name];
          const found = codes.find((c: any) => c.name === name);
          if (!codeVal && found?.code) codeVal = found.code;

          if (mappingIdx >= 0 && codeVal && row[mappingIdx] !== codeVal) {
            if (!rowChanged) {
              updatedRow = [...row];
              rowChanged = true;
            }
            updatedRow[mappingIdx] = codeVal;
            fileChanged = true;
          }

          if (found) {
            if (typeIdx >= 0 && found.type && row[typeIdx] !== found.type) {
              if (!rowChanged) {
                updatedRow = [...row];
                rowChanged = true;
              }
              updatedRow[typeIdx] = found.type;
              fileChanged = true;
            }
            if (
              postTypeIdx >= 0 &&
              found.postType &&
              row[postTypeIdx] !== found.postType
            ) {
              if (!rowChanged) {
                updatedRow = [...row];
                rowChanged = true;
              }
              updatedRow[postTypeIdx] = found.postType;
              fileChanged = true;
            }
          }

          // productCodeMap에 비어있고 자동매칭된 코드가 있으면 map에도 채워둠
          if (!fileProductCodeMap[name] && found?.code) {
            fileProductCodeMap[name] = found.code;
          }

          return updatedRow;
        });

        if (fileChanged) {
          hasChanges = true;
          const updatedFile = {
            ...file,
            tableData: updatedTableData,
            productCodeMap: fileProductCodeMap,
          };

          // sessionStorage 업데이트
          try {
            sessionStorage.setItem(
              `uploadedFile_${file.id}`,
              JSON.stringify(updatedFile)
            );
          } catch (error) {
            console.error("sessionStorage 업데이트 실패:", error);
          }

          return updatedFile;
        }

        return file;
      });

      if (hasChanges) {
        setUploadedFiles(updatedFiles);
      }
    }, 500); // 파일 업로드 및 codes 로드 완료 후 실행

    return () => {
      clearTimeout(timeoutId);
    };
  }, [uploadedFiles, codes, productCodeMap, setUploadedFiles]);

  // 모달이 열릴 때 일부 데이터만 리셋 (파일 목록은 유지)
  useEffect(() => {
    if (isModalOpen) {
      setTableData([]);
      setFileName("");
      setProductCodeMap({});
      setHeaderIndex(null);
      setRecommendIdx(null);
      setRecommendList([]);
      codesOriginRef.current = [];
    }
  }, [
    isModalOpen,
    setTableData,
    setFileName,
    setProductCodeMap,
    setHeaderIndex,
    setRecommendIdx,
    setRecommendList,
  ]);

  // 상품 목록 fetch (DB에서)
  useEffect(() => {
    if (!isModalOpen) return;
    const loadProducts = async () => {
      const {fetchProducts} = await import("@/utils/api");
      const result = await fetchProducts();
      if (result.success) {
        setCodes(result.data || []);
      }
    };
    loadProducts();
  }, [isModalOpen, setCodes]);

  // 드래그 앤 드롭 훅
  const {handleDrop, handleDragOver, handleDragLeave} = useDragAndDrop({
    setDragActive,
    handleFileChange,
  });

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setTableData([]);
    setFileName("");
    setProductCodeMap({});
    // 파일 목록 및 관련 데이터 초기화
    setUploadedFiles([]);
    setHeaderIndex(null);
    setRecommendIdx(null);
    setRecommendList([]);
    codesOriginRef.current = [];
    // sessionStorage에서 업로드된 파일 데이터 제거
    uploadedFiles.forEach((file) => {
      sessionStorage.removeItem(`uploadedFile_${file.id}`);
    });
    // 확인된 파일 목록 초기화
    Array.from(confirmedFiles).forEach((fileId) => {
      unconfirmFile(fileId);
    });
  };

  // 파일 저장 훅
  const resetData = () => {
    setTableData([]);
    setFileName("");
    setProductCodeMap({});
    setUploadedFiles([]);
    setHeaderIndex(null);
    setRecommendIdx(null);
    setRecommendList([]);
    codesOriginRef.current = [];
  };

  const {handleSaveWithConfirmedFiles} = useFileSave({
    confirmedFiles,
    uploadedFiles,
    codes,
    fetchSavedData,
    resetData,
    unconfirmFile,
  });

  const handleFileDelete = (fileId: string) => {
    removeUploadedFile(fileId);
    sessionStorage.removeItem(`uploadedFile_${fileId}`);
  };

  const handleResetData = () => {
    setTableData([]);
    setFileName("");
    setProductCodeMap({});
    setHeaderIndex(null);
  };

  // 유효하지 않은 파일이 있는지 체크 (빨간 배경이 있는 파일)
  const hasInvalidFiles = uploadedFiles.some(
    (file) => fileValidationStatus[file.id] === false
  );

  return (
    <div className="w-full h-full flex flex-col items-start justify-start pt-4 px-4">
      <div className="w-full bg-[#ffffff] rounded-lg px-8 shadow-md pb-12">
        {/* 저장된 데이터 테이블 */}
        <div className="w-full mt-6">
          <div className="mb-4 flex gap-4 items-center justify-between">
            <h2 className="text-xl font-bold">저장된 데이터</h2>

            <div className="flex gap-2 items-center mb-0">
              <button
                className="px-5 py-2 bg-blue-600 text-white text-sm font-bold rounded hover:bg-blue-800"
                onClick={() => setIsModalOpen(true)}
              >
                엑셀 업로드
              </button>

              <button
                className="px-5 py-2 bg-gray-500 text-white text-sm rounded hover:bg-gray-600"
                onClick={fetchSavedData}
                disabled={loading}
              >
                새로고침
              </button>
            </div>
          </div>

          <DataFilters
            filters={filters}
            selectedType={selectedType}
            selectedPostType={selectedPostType}
            selectedVendor={selectedVendor}
            searchField={searchField}
            searchValue={searchValue}
            uploadTimeFrom={uploadTimeFrom}
            uploadTimeTo={uploadTimeTo}
            itemsPerPage={itemsPerPage}
            onTypeChange={setSelectedType}
            onPostTypeChange={setSelectedPostType}
            onVendorChange={setSelectedVendor}
            selectedOrderStatus={selectedOrderStatus}
            onOrderStatusChange={setSelectedOrderStatus}
            onSearchFieldChange={setSearchField}
            onSearchValueChange={setSearchValue}
            onUploadTimeFromChange={setUploadTimeFrom}
            onUploadTimeToChange={setUploadTimeTo}
            onItemsPerPageChange={setItemsPerPage}
            onApplySearchFilter={applySearchFilter}
            onResetFilters={resetFilters}
          />

          <SavedDataTable
            loading={loading}
            tableRows={tableRows}
            headers={headers}
            paginatedRows={paginatedRows}
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={totalCount}
            onPageChange={setCurrentPage}
            onDataUpdate={fetchSavedData}
            selectedType={appliedType}
            selectedPostType={appliedPostType}
            selectedVendor={appliedVendor}
            selectedOrderStatus={appliedOrderStatus}
            appliedSearchField={appliedSearchField}
            appliedSearchValue={appliedSearchValue}
            uploadTimeFrom={appliedUploadTimeFrom}
            uploadTimeTo={appliedUploadTimeTo}
            onRemoveFilter={handleRemoveFilter}
          />
        </div>
      </div>

      <ModalTable
        open={isModalOpen}
        onClose={handleCloseModal}
        onSubmit={async () => {
          const success = await handleSaveWithConfirmedFiles();
          if (success) {
            handleCloseModal();
          }
        }}
        disabled={hasInvalidFiles}
      >
        <FileUploadArea
          dragActive={dragActive}
          fileInputRef={fileInputRef}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onFileChange={handleFileChange}
        />

        <UploadedFilesList
          uploadedFiles={uploadedFiles}
          fileValidationStatus={fileValidationStatus}
          onFileClick={openFileInNewWindow}
          onFileDelete={handleFileDelete}
          onResetData={handleResetData}
        />

        <DirectInputModal
          open={directInputModal.open}
          fields={directInputModal.fields}
          values={directInputModal.values}
          fieldNameMap={fieldNameMap}
          onClose={closeDirectInputModal}
          onSave={saveDirectInputModal}
          onValueChange={setDirectInputValue}
        />

        {/* 테이블 데이터 표시 */}
        {uploadedFiles.length === 0 && (
          <DataTable
            tableData={tableData}
            fileName={fileName}
            headerIndex={headerIndex}
            productCodeMap={productCodeMap}
            codesOriginRef={codesOriginRef}
            codes={codes}
            recommendIdx={recommendIdx}
            recommendList={recommendList}
            onInputCode={handleInputCode}
            onRecommendClick={handleRecommendClick}
            onSelectSuggest={(selectedName, selectedCode, selectedItem) => {
              // 먼저 productCodeMap 업데이트
              const updatedProductCodeMap = {
                ...productCodeMap,
                [selectedName]: selectedCode,
              };
              setProductCodeMap(updatedProductCodeMap);

              // 매핑코드, 내외주, 택배사 실시간 업데이트
              if (tableData.length > 0 && headerIndex) {
                const headerRow = tableData[0];
                const mappingIdx = headerRow.findIndex(
                  (h: any) => h === "매핑코드"
                );
                const typeIdx = headerRow.findIndex((h: any) => h === "내외주");
                const postTypeIdx = headerRow.findIndex(
                  (h: any) => h === "택배사"
                );

                if (mappingIdx !== -1 || typeIdx !== -1 || postTypeIdx !== -1) {
                  // 선택한 항목의 데이터 사용 (없으면 codes에서 찾기)
                  const itemData =
                    selectedItem ||
                    codes.find(
                      (c: any) =>
                        c.name === selectedName && c.code === selectedCode
                    );

                  const updatedTable = tableData.map((row, idx) => {
                    if (idx === 0) return row;
                    const rowName = row[headerIndex.nameIdx!];
                    // 같은 상품명을 가진 모든 행 업데이트
                    if (
                      rowName &&
                      String(rowName).trim() === selectedName.trim()
                    ) {
                      const newRow = [...row];
                      if (mappingIdx !== -1 && selectedCode) {
                        newRow[mappingIdx] = selectedCode;
                      }
                      if (typeIdx !== -1 && itemData?.type) {
                        newRow[typeIdx] = itemData.type;
                      }
                      if (postTypeIdx !== -1 && itemData?.postType) {
                        newRow[postTypeIdx] = itemData.postType;
                      }
                      return newRow;
                    }
                    return row;
                  });
                  setTableData(updatedTable);
                }
              }

              // 모달 닫기
              handleSelectSuggest(selectedName, selectedCode);
            }}
            onDirectInput={openDirectInputModal}
            onCloseRecommend={() => setRecommendIdx(null)}
          />
        )}
      </ModalTable>
    </div>
  );
}
