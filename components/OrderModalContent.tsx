import React, {useMemo, useState} from "react";
import FileUploadArea from "@/components/FileUploadArea";
import UploadedFilesList from "@/components/UploadedFilesList";
import DirectInputModal from "@/components/DirectInputModal";
import DataTable from "@/components/DataTable";
import {
  IoTime,
  IoCheckmarkCircle,
  IoCloseCircle,
  IoCloudUpload,
} from "react-icons/io5";
import {useUploadStore} from "@/stores/uploadStore";
import {fieldNameMap} from "@/constants/fieldMappings";

interface OrderModalContentProps {
  modalMode: "excel" | "delivery" | null;
  dragActive: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  deliveryFileInputRef: React.RefObject<HTMLInputElement | null>;
  handleDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  handleDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  handleDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleDeliveryFileChange: (
    event: React.ChangeEvent<HTMLInputElement>
  ) => void;
  handleDeliveryDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  handleDeliveryDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  handleResetData: () => void;
  handleFileDelete: (fileId: string) => void;
  openFileInNewWindow: (fileId: string) => void;
  fileValidationStatus: {
    [fileId: string]: {isValid: boolean; errors: string[]};
  };
  directInputModal: any;
  setDirectInputValue: (field: string, value: string) => void;
  closeDirectInputModal: () => void;
  saveDirectInputModal: () => void;
  openDirectInputModal: (targetName: string, rowIdx: number | null) => void;

  // Excel mode props
  tableData: any[][];
  fileName: string;
  headerIndex: any;
  productCodeMap: {[key: string]: string};
  codesOriginRef: React.MutableRefObject<any[]>;
  codes: any[];
  recommendIdx: number | null;
  recommendList: any[];
  handleInputCode: (name: string, code: string) => void;
  handleRecommendClick: (rowIdx: number, value: string) => void;
  handleSelectSuggest: (
    selectedName: string,
    selectedCode: string,
    selectedItem?: any
  ) => void;
  onCloseRecommend: () => void;

  // Delivery mode props
  isUploading: boolean;
  uploadProgress: number;
  currentOrderNumber: string;
  deliveryResults: any[];
  finalResult: any;
  deliveryError: string;
}

export default function OrderModalContent({
  modalMode,
  dragActive,
  fileInputRef,
  deliveryFileInputRef,
  handleDrop,
  handleDragOver,
  handleDragLeave,
  handleFileChange,
  handleDeliveryFileChange,
  handleDeliveryDrop,
  handleDeliveryDragOver,
  handleResetData,
  handleFileDelete,
  openFileInNewWindow,
  fileValidationStatus,
  directInputModal,
  setDirectInputValue,
  closeDirectInputModal,
  saveDirectInputModal,
  openDirectInputModal,
  tableData,
  fileName,
  headerIndex,
  productCodeMap,
  codesOriginRef,
  codes,
  recommendIdx,
  recommendList,
  handleInputCode,
  handleRecommendClick,
  handleSelectSuggest,
  onCloseRecommend,
  isUploading,
  uploadProgress,
  currentOrderNumber,
  deliveryResults,
  finalResult,
  deliveryError,
}: OrderModalContentProps) {
  const {uploadedFiles} = useUploadStore();
  const [isHovered, setIsHovered] = useState(false);
  const [isClicked, setIsClicked] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // 운송장 업로드 실시간 통계 계산
  const deliveryStats = useMemo(() => {
    const resultItems = deliveryResults.filter(
      (result) => result.type === "result"
    );
    const totalCount = resultItems.length;
    const successCount = resultItems.filter((result) => result.success).length;
    const failCount = resultItems.filter((result) => !result.success).length;

    return {totalCount, successCount, failCount};
  }, [deliveryResults]);

  return (
    <>
      {/* 공통 컴포넌트들 */}
      <DirectInputModal
        open={directInputModal.open}
        fields={directInputModal.fields}
        values={directInputModal.values}
        fieldNameMap={fieldNameMap}
        onClose={closeDirectInputModal}
        onSave={saveDirectInputModal}
        onValueChange={setDirectInputValue}
      />

      {/* 엑셀 업로드 모드 */}
      {modalMode === "excel" && (
        <>
          <FileUploadArea
            dragActive={dragActive}
            fileInputRef={fileInputRef}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onFileChange={handleFileChange}
            multiple={true}
            title="파일을 드래그하거나 클릭하여 선택"
            description="엑셀(.xlsx, .xls) 또는 CSV(.csv) 파일만 가능합니다 (여러 파일 선택 가능)"
          />

          <UploadedFilesList
            uploadedFiles={uploadedFiles}
            fileValidationStatus={fileValidationStatus}
            onFileClick={openFileInNewWindow}
            onFileDelete={handleFileDelete}
            onResetData={handleResetData}
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
                // 나머지 로직은 부모 컴포넌트에서 처리
                handleSelectSuggest(selectedName, selectedCode, selectedItem);
              }}
              onCloseRecommend={onCloseRecommend}
            />
          )}
        </>
      )}

      {/* 운송장 업로드 모드 */}
      {modalMode === "delivery" && (
        <div className="space-y-6">
          {/* 파일 업로드 영역 - 모달 전체가 클릭 가능 */}
          {!isUploading && !finalResult && (
            <div
              className={`w-full border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-all duration-200 ${
                isDragOver
                  ? "border-blue-600 bg-blue-100 shadow-lg scale-[1.02]"
                  : dragActive
                  ? "border-blue-500 bg-blue-50"
                  : isClicked
                  ? "border-blue-600 bg-blue-100 scale-[0.98]"
                  : isHovered
                  ? "border-blue-400 bg-blue-50"
                  : "border-gray-300 bg-gray-100"
              }`}
              style={{
                minHeight: "calc(90vh - 200px)",
                cursor: "pointer",
              }}
              onDrop={(e) => {
                handleDeliveryDrop(e);
                setIsDragOver(false);
              }}
              onDragOver={(e) => {
                handleDeliveryDragOver(e);
                setIsDragOver(true);
              }}
              onDragLeave={(e) => {
                handleDragLeave(e);
                setIsHovered(false);
                setIsDragOver(false);
              }}
              onDragEnter={() => setIsDragOver(true)}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => {
                setIsHovered(false);
                setIsClicked(false);
              }}
              onMouseDown={() => setIsClicked(true)}
              onMouseUp={() => setIsClicked(false)}
              onClick={() => {
                deliveryFileInputRef?.current?.click();
                setIsClicked(false);
              }}
            >
              <input
                type="file"
                accept=".xlsx, .xls"
                ref={deliveryFileInputRef}
                onChange={handleDeliveryFileChange}
                className="hidden"
              />
              <IoCloudUpload
                className={`mx-auto mb-4 transition-all duration-200 ${
                  isDragOver
                    ? "w-20 h-20 text-blue-600 animate-bounce"
                    : isHovered
                    ? "w-18 h-18 text-blue-500"
                    : "w-16 h-16 text-gray-400"
                }`}
              />
              <div
                className={`text-xl mb-2 font-semibold transition-colors duration-200 ${
                  isDragOver
                    ? "text-blue-700"
                    : isHovered
                    ? "text-blue-600"
                    : "text-gray-600"
                }`}
              >
                {isDragOver
                  ? "파일을 여기에 놓으세요!"
                  : "운송장 엑셀 파일을 업로드하세요"}
              </div>
              <div
                className={`text-sm transition-colors duration-200 ${
                  isDragOver
                    ? "text-blue-600"
                    : isHovered
                    ? "text-blue-500"
                    : "text-gray-400"
                }`}
              >
                주문번호, 운송장번호, 택배사 헤더가 포함된 엑셀 파일(.xlsx,
                .xls)
              </div>
              <div
                className={`text-xs mt-2 transition-colors duration-200 ${
                  isDragOver
                    ? "text-blue-600 font-semibold"
                    : isHovered
                    ? "text-blue-500"
                    : "text-gray-400"
                }`}
              >
                {isDragOver
                  ? "마우스를 놓으면 파일이 업로드됩니다"
                  : "파일을 드래그하거나 클릭하여 선택하세요"}
              </div>
            </div>
          )}

          {/* 처리 중 상태 */}
          {(isUploading || finalResult) && (
            <div className="space-y-6">
              <div className="text-center">
                {isUploading && (
                  <>
                    <div className="w-full bg-gray-200 rounded-full h-4 mb-4">
                      <div
                        className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                        style={{width: `${uploadProgress}%`}}
                      ></div>
                    </div>
                    <p className="text-lg font-medium">
                      운송장 정보를 처리하고 있습니다...
                    </p>
                    <p className="text-sm text-gray-600 mt-2">
                      {Math.round(uploadProgress)}% 완료
                    </p>
                    {currentOrderNumber && (
                      <p className="text-sm text-blue-600 mt-2">
                        현재 처리중: {currentOrderNumber}
                      </p>
                    )}
                  </>
                )}

                {finalResult && !isUploading && (
                  <div className="text-2xl font-bold text-green-600 mb-4">
                    처리가 완료되었습니다!
                  </div>
                )}

                {/* 실시간 통계 표시 */}
                <div className="mt-4 grid grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-lg font-bold text-blue-600">
                      {finalResult
                        ? finalResult.totalCount
                        : deliveryStats.totalCount}
                    </div>
                    <div className="text-xs text-gray-600">총 건수</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-600">
                      {finalResult
                        ? finalResult.successCount
                        : deliveryStats.successCount}
                    </div>
                    <div className="text-xs text-gray-600">성공</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-red-600">
                      {finalResult
                        ? finalResult.failCount
                        : deliveryStats.failCount}
                    </div>
                    <div className="text-xs text-gray-600">실패</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-yellow-600">
                      {finalResult ? finalResult.duplicateCount || 0 : 0}
                    </div>
                    <div className="text-xs text-gray-600">중복</div>
                  </div>
                </div>

                {/* {finalResult && (
                  <div className="mt-4 bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-700">
                      {finalResult.message}
                    </p>
                  </div>
                )} */}
              </div>

              {/* 실시간 결과 목록 */}
              <div className="max-h-96 overflow-y-auto rounded-lg">
                <div className="p-4 bg-gray-100 border-b border-gray-100 font-bold">
                  처리 결과
                </div>
                <div className="divide-y">
                  {deliveryResults.map((result, index) => (
                    <div
                      key={index}
                      className="p-4 flex items-center justify-between border-gray-300"
                    >
                      <div className="flex items-center space-x-3">
                        {result.type === "processing" && (
                          <IoTime className="w-5 h-5 text-blue-500" />
                        )}
                        {result.type === "result" && result.success && (
                          <IoCheckmarkCircle className="w-5 h-5 text-green-500" />
                        )}
                        {result.type === "result" && !result.success && (
                          <IoCloseCircle className="w-5 h-5 text-red-500" />
                        )}
                        <div>
                          <p className="font-medium">
                            {result.orderNumber || result.message}
                          </p>
                          {result.type === "result" && result.success && (
                            <p className="text-sm text-gray-600">
                              {result.carrier} / {result.trackingNumber}
                            </p>
                          )}
                          {result.type === "result" && !result.success && (
                            <p className="text-sm text-red-600">
                              {result.error}
                            </p>
                          )}
                        </div>
                      </div>
                      {result.rowNumber && (
                        <span className="text-sm text-gray-500">
                          {result.rowNumber}행
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 에러 표시 */}
          {deliveryError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center">
                <IoCloseCircle className="w-5 h-5 text-red-500 mr-2" />
                <p className="text-red-700">{deliveryError}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
