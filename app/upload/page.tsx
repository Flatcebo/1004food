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
    appliedSearchField,
    appliedSearchValue,
    appliedUploadTimeFrom,
    appliedUploadTimeTo,
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
    headers,
    paginatedRows,
    tableRows,
    fetchSavedData,
  } = useUploadData();

  // 필터 제거 함수
  const handleRemoveFilter = (filterType: string) => {
    switch (filterType) {
      case "type":
        setSelectedType("");
        // 상태 변경 후 useEffect가 자동으로 fetchSavedData 호출
        break;
      case "postType":
        setSelectedPostType("");
        break;
      case "vendor":
        setSelectedVendor("");
        break;
      case "orderStatus":
        setSelectedOrderStatus("공급중");
        break;
      case "search":
        setSearchField("");
        setSearchValue("");
        // 검색 필터 초기화 - 빈 값으로 적용
        setAppliedSearchField("");
        setAppliedSearchValue("");
        // appliedSearchField/appliedSearchValue 변경 시 useEffect가 자동 호출
        break;
      case "dateRange":
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(
          today.getMonth() + 1
        ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        setUploadTimeFrom(todayStr);
        setUploadTimeTo(todayStr);
        // 날짜 필터 초기화 - 오늘 날짜로 적용
        setAppliedUploadTimeFrom(todayStr);
        setAppliedUploadTimeTo(todayStr);
        // appliedUploadTimeFrom/appliedUploadTimeTo 변경 시 useEffect가 자동 호출
        break;
    }
    // useEffect가 상태 변경을 감지하여 자동으로 fetchSavedData 호출
  };

  // 파일 검증 관련 훅
  const {fileValidationStatus, updateValidationStatus} =
    useFileValidation(uploadedFiles);

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
    fetch("/api/products/list")
      .then((res) => res.json())
      .then((result) => {
        if (result.success) {
          setCodes(result.data || []);
        }
      })
      .catch((error) => {
        console.error("상품 목록 조회 실패:", error);
      });
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
              {/* <button
                className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                onClick={async () => {
                  try {
                    const response = await fetch("/api/upload/init", {
                      method: "POST",
                    });
                    const result = await response.json();
                    if (result.success) {
                      alert("스키마가 초기화되었습니다.");
                    } else {
                      alert(`스키마 초기화 실패: ${result.error}`);
                    }
                  } catch (error: any) {
                    alert(`스키마 초기화 중 오류: ${error.message}`);
                  }
                }}
              >
                DB 스키마 초기화
              </button> */}
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
            onTypeChange={setSelectedType}
            onPostTypeChange={setSelectedPostType}
            onVendorChange={setSelectedVendor}
            selectedOrderStatus={selectedOrderStatus}
            onOrderStatusChange={setSelectedOrderStatus}
            onSearchFieldChange={setSearchField}
            onSearchValueChange={setSearchValue}
            onUploadTimeFromChange={setUploadTimeFrom}
            onUploadTimeToChange={setUploadTimeTo}
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
            onPageChange={setCurrentPage}
            onDataUpdate={fetchSavedData}
            selectedType={selectedType}
            selectedPostType={selectedPostType}
            selectedVendor={selectedVendor}
            selectedOrderStatus={selectedOrderStatus}
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
