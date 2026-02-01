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
    event: React.ChangeEvent<HTMLInputElement>,
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
    selectedItem?: any,
  ) => void;
  onCloseRecommend: () => void;

  // Delivery mode props
  isUploading: boolean;
  uploadProgress: number;
  currentUploadingFile: string | null;
  fileResults: any[];
  removeFileResult: (fileName: string) => void;
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
  currentUploadingFile,
  fileResults,
  removeFileResult,
}: OrderModalContentProps) {
  const {uploadedFiles} = useUploadStore();
  const [isHovered, setIsHovered] = useState(false);
  const [isClicked, setIsClicked] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

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
          {/* {uploadedFiles.length === 0 && (
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
          )} */}
        </>
      )}

      {/* 운송장 업로드 모드 */}
      {modalMode === "delivery" && (
        <div className="space-y-6">
          {/* 파일 업로드 영역 - 항상 표시 */}
          <div
            className={`w-full border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-all duration-200 py-12 ${
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
              multiple
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
              주문번호, 운송장번호, 택배사 헤더가 포함된 엑셀 파일(.xlsx, .xls)
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
                : "파일을 드래그하거나 클릭하여 선택하세요 (여러 파일 선택 가능)"}
            </div>
          </div>

          {/* 파일별 결과 표시 */}
          {fileResults.length > 0 && (
            <div className="space-y-4">
              {fileResults.map((fileResult) => {
                // 파일별 통계 계산
                const resultItems = fileResult.results.filter(
                  (result: any) => result.type === "result",
                );
                const fileStats = {
                  totalCount: resultItems.length,
                  successCount: resultItems.filter(
                    (result: any) => result.success,
                  ).length,
                  failCount: resultItems.filter(
                    (result: any) => !result.success,
                  ).length,
                };

                return (
                  <div
                    key={fileResult.fileName}
                    className="border border-gray-300 rounded-lg overflow-hidden"
                  >
                    {/* 파일명 헤더 */}
                    <div className="bg-gray-100 px-4 py-3 flex items-center justify-between border-b border-gray-300">
                      <h3 className="font-bold text-lg text-gray-800">
                        {fileResult.fileName}
                      </h3>
                      <button
                        onClick={() => removeFileResult(fileResult.fileName)}
                        className="text-gray-500 hover:text-red-600 transition-colors"
                        title="결과 제거"
                      >
                        <IoCloseCircle className="w-5 h-5" />
                      </button>
                    </div>

                    {/* 처리 중 상태 */}
                    {fileResult.isUploading && (
                      <div className="p-4">
                        <div className="w-full bg-gray-200 rounded-full h-4 mb-2">
                          <div
                            className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                            style={{
                              width: `${fileResult.uploadProgress}%`,
                            }}
                          ></div>
                        </div>
                        <p className="text-sm text-gray-600 text-center">
                          {Math.round(fileResult.uploadProgress)}% 완료
                        </p>
                        {fileResult.currentOrderNumber && (
                          <p className="text-xs text-blue-600 mt-1 text-center">
                            현재 처리중: {fileResult.currentOrderNumber}
                          </p>
                        )}
                      </div>
                    )}

                    {/* 최종 결과 */}
                    {fileResult.finalResult && !fileResult.isUploading && (
                      <div className="p-4 space-y-4">
                        <div className="text-center">
                          <div className="text-lg font-bold text-green-600 mb-3">
                            처리가 완료되었습니다!
                          </div>

                          {/* 통계 표시 */}
                          <div className="grid grid-cols-4 gap-4">
                            <div className="text-center">
                              <div className="text-lg font-bold text-blue-600">
                                {fileResult.finalResult.totalCount}
                              </div>
                              <div className="text-xs text-gray-600">
                                총 건수
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-lg font-bold text-green-600">
                                {fileResult.finalResult.successCount}
                              </div>
                              <div className="text-xs text-gray-600">성공</div>
                            </div>
                            <div className="text-center">
                              <div className="text-lg font-bold text-red-600">
                                {fileResult.finalResult.failCount}
                              </div>
                              <div className="text-xs text-gray-600">실패</div>
                            </div>
                            <div className="text-center">
                              <div className="text-lg font-bold text-yellow-600">
                                {fileResult.finalResult.duplicateCount || 0}
                              </div>
                              <div className="text-xs text-gray-600">중복</div>
                            </div>
                          </div>
                        </div>

                        {/* 결과 목록 */}
                        {fileResult.results.length > 0 && (
                          <div className="max-h-96 overflow-y-auto rounded-lg border border-gray-200">
                            <div className="p-3 bg-gray-50 border-b border-gray-200 font-bold text-sm">
                              처리 결과
                            </div>
                            <div className="divide-y">
                              {fileResult.results.map(
                                (result: any, index: number) => (
                                  <div
                                    key={index}
                                    className="p-3 flex items-center justify-between hover:bg-gray-50"
                                  >
                                    <div className="flex items-center space-x-3">
                                      {result.type === "processing" && (
                                        <IoTime className="w-5 h-5 text-blue-500" />
                                      )}
                                      {result.type === "result" &&
                                        result.success && (
                                          <IoCheckmarkCircle className="w-5 h-5 text-green-500" />
                                        )}
                                      {result.type === "result" &&
                                        !result.success && (
                                          <IoCloseCircle className="w-5 h-5 text-red-500" />
                                        )}
                                      <div>
                                        {result.type === "init" ? (
                                          <p className="text-sm text-gray-600">
                                            {result.message}
                                          </p>
                                        ) : (
                                          <>
                                            <p className="font-medium text-sm">
                                              {result.orderNumber ||
                                                result.message}
                                            </p>
                                            {result.type === "result" &&
                                              result.success && (
                                                <p className="text-xs text-gray-600">
                                                  {result.carrier} /{" "}
                                                  {result.trackingNumber}
                                                </p>
                                              )}
                                            {result.type === "result" &&
                                              !result.success && (
                                                <p className="text-xs text-red-600">
                                                  {result.error}
                                                </p>
                                              )}
                                          </>
                                        )}
                                      </div>
                                    </div>
                                    {result.rowNumber && (
                                      <span className="text-xs text-gray-500">
                                        {result.rowNumber}행
                                      </span>
                                    )}
                                  </div>
                                ),
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 에러 표시 */}
                    {fileResult.error && (
                      <div className="p-4 bg-red-50 border-t border-red-200">
                        <div className="flex items-center">
                          <IoCloseCircle className="w-5 h-5 text-red-500 mr-2" />
                          <p className="text-sm text-red-700">
                            {fileResult.error}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}
