"use client";

import {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
  Suspense,
} from "react";
import {useSearchParams} from "next/navigation";
import {useUploadStore} from "@/stores/uploadStore";
import {useLoadingStore} from "@/stores/loadingStore";
import {useAuthStore} from "@/stores/authStore";
import ModalTable from "@/components/ModalTable";
import OrderModalContent from "@/components/OrderModalContent";
import SavedDataTable from "@/components/SavedDataTable";
import DataFilters from "@/components/DataFilters";
import LoadingOverlay from "@/components/LoadingOverlay";
import DeliveryDownloadModal from "@/components/DeliveryDownloadModal";
import {useUploadData} from "@/hooks/useUploadData";
import {useFileValidation} from "@/hooks/useFileValidation";
import {useFileMessageHandler} from "@/hooks/useFileMessageHandler";
import {useAutoMapping} from "@/hooks/useAutoMapping";
import {useFileSave} from "@/hooks/useFileSave";
import {useDragAndDrop} from "@/hooks/useDragAndDrop";
import {useDeliveryUpload} from "@/hooks/useDeliveryUpload";
import {fieldNameMap} from "@/constants/fieldMappings";
import {generateAutoDeliveryMessage} from "@/utils/vendorMessageUtils";
import {
  IoReloadCircle,
  IoCloudUpload,
  IoCheckmarkCircle,
  IoCloseCircle,
  IoTime,
  IoChevronDown,
  IoCreate,
  IoDownload,
} from "react-icons/io5";

export default function Page() {
  return (
    <Suspense fallback={<div>로딩 중...</div>}>
      <OrderPageContent />
    </Suspense>
  );
}

function OrderPageContent() {
  const [isDeliveryInputMode, setIsDeliveryInputMode] = useState(false);
  const [isDeliveryUploadModalOpen, setIsDeliveryUploadModalOpen] =
    useState(false);
  const [modalMode, setModalMode] = useState<"excel" | "delivery" | null>(null);
  const [isDeliveryDownloadModalOpen, setIsDeliveryDownloadModalOpen] =
    useState(false);
  const [isDeliveryDropdownOpen, setIsDeliveryDropdownOpen] = useState(false);
  const deliveryDropdownRef = useRef<HTMLDivElement>(null);

  // 운송장 업로드 훅 사용
  const {
    isUploading,
    uploadProgress,
    currentOrderNumber,
    deliveryResults,
    finalResult,
    deliveryError,
    deliveryFileInputRef,
    handleDeliveryFileChange,
    handleDeliveryDrop,
    handleDeliveryDragOver,
    resetDeliveryUploadState,
  } = useDeliveryUpload();

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
    loadFilesFromServer,
  } = useUploadStore();

  // 로딩 상태
  const {isLoading, title, message, subMessage, startLoading} =
    useLoadingStore();

  // 저장된 데이터 관련 훅
  const {
    filters,
    selectedType,
    setSelectedType,
    selectedPostType,
    setSelectedPostType,
    selectedCompany,
    setSelectedCompany,
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
    appliedCompany,
    appliedVendor,
    appliedOrderStatus,
    appliedSearchField,
    appliedSearchValue,
    appliedUploadTimeFrom,
    appliedUploadTimeTo,
    appliedItemsPerPage,
    setAppliedType,
    setAppliedPostType,
    setAppliedCompany,
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

  // URL 쿼리 파라미터 읽기
  const searchParams = useSearchParams();

  // URL 파라미터가 이미 처리되었는지 추적하는 ref
  const urlParamsProcessedRef = useRef(false);

  // URL 쿼리 파라미터에서 검색 필터 및 기간 필터 설정 (페이지 로드 시 한 번만 실행)
  useEffect(() => {
    // 이미 처리된 경우 스킵
    if (urlParamsProcessedRef.current) return;

    const searchFieldParam = searchParams.get("searchField");
    const searchValueParam = searchParams.get("searchValue");
    const uploadTimeFromParam = searchParams.get("uploadTimeFrom");
    const uploadTimeToParam = searchParams.get("uploadTimeTo");
    const orderStatusParam = searchParams.get("orderStatus");

    // URL 파라미터가 하나라도 있으면 처리
    const hasUrlParams =
      (searchFieldParam && searchValueParam) ||
      (uploadTimeFromParam && uploadTimeToParam) ||
      orderStatusParam !== null;

    if (!hasUrlParams) {
      // URL 파라미터가 없으면 처리 완료로 표시하고 종료
      urlParamsProcessedRef.current = true;
      return;
    }

    // 검색 필터 설정
    if (searchFieldParam && searchValueParam) {
      // 검색 필드와 값 설정
      setSearchField(searchFieldParam);
      setSearchValue(searchValueParam);

      // 검색 필터 적용
      if (setAppliedSearchField && setAppliedSearchValue) {
        setAppliedSearchField(searchFieldParam);
        setAppliedSearchValue(searchValueParam);
      }
    }

    // 기간 필터 설정
    if (uploadTimeFromParam && uploadTimeToParam) {
      setUploadTimeFrom(uploadTimeFromParam);
      setUploadTimeTo(uploadTimeToParam);

      if (setAppliedUploadTimeFrom && setAppliedUploadTimeTo) {
        setAppliedUploadTimeFrom(uploadTimeFromParam);
        setAppliedUploadTimeTo(uploadTimeToParam);
      }
    }

    // 주문상태 필터 설정 (URL 파라미터가 있으면 설정, 빈 문자열이면 "전체"로 설정)
    if (orderStatusParam !== null) {
      setSelectedOrderStatus(orderStatusParam);
      if (setAppliedOrderStatus) {
        setAppliedOrderStatus(orderStatusParam);
      }
    }

    // 처리 완료 표시
    urlParamsProcessedRef.current = true;

    // 약간의 지연 후 검색 필터 적용 (상태 업데이트 후)
    setTimeout(() => {
      applySearchFilter();
    }, 100);
  }, [
    searchParams,
    setSearchField,
    setSearchValue,
    setUploadTimeFrom,
    setUploadTimeTo,
    setSelectedOrderStatus,
    setAppliedSearchField,
    setAppliedSearchValue,
    setAppliedUploadTimeFrom,
    setAppliedUploadTimeTo,
    setAppliedOrderStatus,
    applySearchFilter,
  ]);

  // 필터 제거 함수
  const handleRemoveFilter = (filterType: string) => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(
      today.getMonth() + 1
    ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    switch (filterType) {
      case "type":
        setSelectedType("");
        if (setAppliedType) setAppliedType("");
        break;
      case "postType":
        setSelectedPostType("");
        if (setAppliedPostType) setAppliedPostType("");
        break;
      case "company":
        setSelectedCompany([]);
        if (setAppliedCompany) setAppliedCompany([]);
        break;
      case "vendor":
        setSelectedVendor([]);
        if (setAppliedVendor) setAppliedVendor([]);
        break;
      case "orderStatus":
        setSelectedOrderStatus("공급중");
        if (setAppliedOrderStatus) setAppliedOrderStatus("공급중");
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
  const {fileValidationStatus, updateValidationStatus, updateValidation} =
    useFileValidation(uploadedFiles, productCodeMap);

  // 검증 상태를 boolean으로 변환하는 헬퍼 함수
  const getValidationStatus = (fileId: string): boolean => {
    return fileValidationStatus[fileId]?.isValid ?? true;
  };

  // 검증이 통과한 파일들을 자동으로 확인 처리
  useEffect(() => {
    if (uploadedFiles.length === 0) return;

    // 약간의 지연을 두어 검증 완료 후 실행
    const timeoutId = setTimeout(() => {
      uploadedFiles.forEach((file) => {
        const isValid = getValidationStatus(file.id);
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
    loadFilesFromServer,
  });

  // 현재 선택된 파일 ID 찾기
  const currentFileId =
    uploadedFiles.find((file) => file.fileName === fileName)?.id || "";

  // 자동 매핑 훅
  const {codesOriginRef} = useAutoMapping({
    tableData,
    codes,
    productCodeMap,
    headerIndex,
    setTableData,
    setProductCodeMap,
    setHeaderIndex,
    fileId: currentFileId,
  });

  // 각 업로드된 파일에 자동 매핑 적용
  useEffect(() => {
    if (uploadedFiles.length === 0 || codes.length === 0) {
      // codes가 아직 로드되지 않았으면 로드 시도
      if (uploadedFiles.length > 0 && codes.length === 0) {
        const loadProducts = async () => {
          const {fetchProducts} = await import("@/utils/api");
          const result = await fetchProducts();
          if (result.success) {
            setCodes(result.data || []);
          }
        };
        loadProducts();
      }
      return;
    }

    console.log("🔄 자동 매핑 시작:", {
      filesCount: uploadedFiles.length,
      codesCount: codes.length,
    });

    // codes가 로드되면 즉시 자동 매핑 실행
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
      const fileProductIdMap = {...(file.productIdMap || {})};

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
        // 택배사가 있는 상품 우선 선택
        const productsWithPostType = codes.filter(
          (c: any) =>
            c.name === name && c.postType && String(c.postType).trim() !== ""
        );
        const productsWithoutPostType = codes.filter(
          (c: any) =>
            c.name === name && (!c.postType || String(c.postType).trim() === "")
        );
        const found =
          productsWithPostType.length > 0
            ? productsWithPostType[0]
            : productsWithoutPostType[0];
        if (!codeVal && found?.code) {
          codeVal = found.code;
          // 자동 매핑된 코드를 로그로 출력 (첫 번째 매칭만)
          if (idx === 1 && !fileProductCodeMap[name] && !productCodeMap[name]) {
            console.log(`✅ 자동 매핑: "${name}" → "${codeVal}"`);
          }
        }

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

        // productIdMap에 비어있고 자동매칭된 상품이 있으면 ID도 저장
        if (!fileProductIdMap[name] && found?.id) {
          fileProductIdMap[name] = found.id;
        }

        return updatedRow;
      });

      if (fileChanged) {
        hasChanges = true;

        // 배송메시지 자동 생성 적용
        const originalMessagesRef: {[rowIdx: number]: string} = {};
        const autoMessageTableData = generateAutoDeliveryMessage(
          updatedTableData,
          originalMessagesRef
        );

        const updatedFile = {
          ...file,
          tableData: autoMessageTableData,
          productCodeMap: fileProductCodeMap,
          productIdMap: fileProductIdMap,
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
      console.log("✅ 자동 매핑 완료, 파일 업데이트 및 서버 저장 시작");
      setUploadedFiles(updatedFiles);

      // 자동 매핑 완료 후 서버에 저장 (약간의 지연을 두어 상태 업데이트 완료 후 실행)
      setTimeout(async () => {
        const {saveFilesToServer} = useUploadStore.getState();
        await saveFilesToServer();
      }, 200);
    } else {
      console.log("ℹ️ 자동 매핑 변경사항 없음");
    }
  }, [uploadedFiles, codes, productCodeMap, setUploadedFiles]);

  // 모달이 열릴 때 서버에서 임시 파일 불러오기
  // 페이지 로드 시 서버에서 파일 리스트 가져오기
  useEffect(() => {
    loadFilesFromServer();
  }, [loadFilesFromServer]);

  useEffect(() => {
    if (isModalOpen) {
      setTableData([]);
      setFileName("");
      setProductCodeMap({});
      setHeaderIndex(null);
      setRecommendIdx(null);
      setRecommendList([]);
      codesOriginRef.current = [];

      // 서버에서 임시 저장된 파일 불러오기
      loadFilesFromServer()
        .then(() => {
          // 파일 로드 완료 후 검증 다시 실행 (서버에서 가져온 vendorName 반영)
          // 상태 업데이트가 완료될 시간을 확보하기 위해 더 긴 지연
          setTimeout(() => {
            console.log("🔄 모달 열림 후 검증 재실행");
            updateValidation();
          }, 500);
        })
        .catch((error) => {
          console.error("파일 로드 실패:", error);
        });
    }
  }, [
    isModalOpen,
    setTableData,
    setFileName,
    setProductCodeMap,
    setHeaderIndex,
    setRecommendIdx,
    setRecommendList,
    loadFilesFromServer,
    updateValidation,
  ]);

  // 상품 목록 fetch (DB에서)
  // 모달이 열릴 때 또는 파일이 업로드될 때 codes 로드
  useEffect(() => {
    // codes가 이미 로드되어 있으면 다시 로드하지 않음
    if (codes.length > 0) return;

    // 모달이 열리지 않았고 파일도 없으면 로드하지 않음
    if (!isModalOpen && uploadedFiles.length === 0) return;

    const loadProducts = async () => {
      const {fetchProducts} = await import("@/utils/api");
      const result = await fetchProducts();
      if (result.success) {
        setCodes(result.data || []);
      }
    };
    loadProducts();
  }, [isModalOpen, uploadedFiles.length, codes.length, setCodes]);

  // 드래그 앤 드롭 훅
  const {handleDrop, handleDragOver, handleDragLeave} = useDragAndDrop({
    setDragActive,
    handleFileChange,
  });

  // 엑셀 업로드 관련 상태 초기화
  const resetExcelUploadState = () => {
    setIsModalOpen(false);
    setTableData([]);
    setFileName("");
    setProductCodeMap({});
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

  const handleCloseModal = () => {
    if (modalMode === "excel") {
      resetExcelUploadState();
      // 서버에서 임시 저장된 파일 불러오기
      loadFilesFromServer();
    } else if (modalMode === "delivery") {
      resetDeliveryUploadState();
    }
    setModalMode(null);
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

  const handleFileDelete = async (fileId: string) => {
    // 서버에서 먼저 삭제
    try {
      // company-id 헤더 포함
      const headers: HeadersInit = {};

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

      const response = await fetch(`/api/upload/temp/delete?fileId=${fileId}`, {
        method: "DELETE",
        headers,
      });
      const result = await response.json();

      if (result.success) {
        // 서버 삭제 성공 후 로컬 상태 업데이트
        removeUploadedFile(fileId);
        unconfirmFile(fileId); // confirmedFiles에서도 제거
        sessionStorage.removeItem(`uploadedFile_${fileId}`);
      } else {
        console.error("서버에서 파일 삭제 실패:", result.error);
        // 서버 삭제 실패해도 로컬에서는 삭제
        removeUploadedFile(fileId);
        unconfirmFile(fileId);
        sessionStorage.removeItem(`uploadedFile_${fileId}`);
      }
    } catch (error) {
      console.error("서버에서 파일 삭제 실패:", error);
      // 에러 발생해도 로컬에서는 삭제
      removeUploadedFile(fileId);
      unconfirmFile(fileId);
      sessionStorage.removeItem(`uploadedFile_${fileId}`);
    }
  };

  const handleResetData = () => {
    setTableData([]);
    setFileName("");
    setProductCodeMap({});
    setHeaderIndex(null);
  };

  // 체크박스가 체크된 파일들 중에서 검증 실패가 있는지 체크
  const hasInvalidFiles = useMemo(() => {
    const checkedFileIds = Array.from(confirmedFiles);
    if (checkedFileIds.length === 0) {
      // 체크박스가 하나도 체크되지 않았으면 disabled 처리
      return true;
    }
    // 체크된 파일들 중에서 검증 실패가 있는지 확인
    return checkedFileIds.some((fileId) => !getValidationStatus(fileId));
  }, [confirmedFiles, fileValidationStatus]);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        deliveryDropdownRef.current &&
        !deliveryDropdownRef.current.contains(event.target as Node)
      ) {
        setIsDeliveryDropdownOpen(false);
      }
    };

    if (isDeliveryDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDeliveryDropdownOpen]);

  return (
    <div className="w-full h-full flex flex-col items-start justify-start px-4">
      {/* 업로드 로딩 오버레이 */}
      <LoadingOverlay
        isOpen={isLoading}
        title={title}
        message={message}
        subMessage={subMessage}
      />

      <div className="w-full pb-80">
        {/* 저장된 데이터 테이블 */}
        <div className="w-full mt-6 bg-[#ffffff] rounded-lg px-8 py-6 shadow-md">
          <div className="mb-4 flex gap-4 items-center justify-between">
            <h2 className="text-xl font-bold">저장된 데이터</h2>

            <div className="flex gap-2 items-center mb-0">
              <button
                className="px-5 py-2 bg-blue-600 text-white text-sm font-bold rounded hover:bg-blue-800"
                onClick={() => {
                  setModalMode("excel");
                }}
              >
                발주서 업로드
              </button>

              {/* 운송장 드롭다운 버튼 */}
              <div className="relative" ref={deliveryDropdownRef}>
                <button
                  className="px-5 py-2 bg-amber-700 text-white text-sm font-bold rounded hover:bg-amber-800 flex items-center gap-2"
                  onClick={() => {
                    setIsDeliveryDropdownOpen(!isDeliveryDropdownOpen);
                  }}
                >
                  운송장
                  <IoChevronDown
                    className={`w-4 h-4 transition-transform ${
                      isDeliveryDropdownOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {/* 드롭다운 메뉴 */}
                {isDeliveryDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden">
                    <button
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 bg-white hover:bg-gray-100 border-b border-gray-200 flex items-center gap-2"
                      onClick={() => {
                        setModalMode("delivery");
                        setIsDeliveryDropdownOpen(false);
                      }}
                    >
                      <IoCloudUpload className="w-4 h-4" />
                      운송장 업로드
                    </button>
                    <button
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 bg-white hover:bg-gray-100 border-b border-gray-200 flex items-center gap-2"
                      onClick={() => {
                        setIsDeliveryInputMode(!isDeliveryInputMode);
                        setIsDeliveryDropdownOpen(false);
                      }}
                    >
                      <IoCreate className="w-4 h-4" />
                      {isDeliveryInputMode ? "운송장 입력 취소" : "운송장 입력"}
                    </button>
                    <button
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 bg-white hover:bg-gray-100 flex items-center gap-2"
                      onClick={() => {
                        setIsDeliveryDownloadModalOpen(true);
                        setIsDeliveryDropdownOpen(false);
                      }}
                    >
                      <IoDownload className="w-4 h-4" />
                      운송장 다운로드
                    </button>
                  </div>
                )}
              </div>

              <button
                className="w-[60px] h-[36px] px-0 py-0 text-white text-sm rounded 
                bg-[#333333] hover:bg-[#7e7e7e] flex items-center justify-center"
                onClick={fetchSavedData}
                disabled={loading}
              >
                <IoReloadCircle
                  className={`w-[30px] h-[30px] rounded-full ${
                    loading ? "animate-spin" : ""
                  }`}
                />
              </button>
            </div>
          </div>

          <DataFilters
            filters={filters}
            selectedType={selectedType}
            selectedPostType={selectedPostType}
            selectedCompany={selectedCompany}
            selectedVendor={selectedVendor}
            searchField={searchField}
            searchValue={searchValue}
            uploadTimeFrom={uploadTimeFrom}
            uploadTimeTo={uploadTimeTo}
            itemsPerPage={itemsPerPage}
            onTypeChange={setSelectedType}
            onPostTypeChange={setSelectedPostType}
            onCompanyChange={setSelectedCompany}
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
            selectedCompany={appliedCompany}
            selectedVendor={appliedVendor}
            selectedOrderStatus={appliedOrderStatus}
            appliedType={appliedType}
            appliedPostType={appliedPostType}
            appliedCompany={appliedCompany}
            appliedVendor={appliedVendor}
            appliedOrderStatus={appliedOrderStatus}
            appliedSearchField={appliedSearchField}
            appliedSearchValue={appliedSearchValue}
            appliedUploadTimeFrom={appliedUploadTimeFrom}
            appliedUploadTimeTo={appliedUploadTimeTo}
            uploadTimeFrom={appliedUploadTimeFrom}
            uploadTimeTo={appliedUploadTimeTo}
            onRemoveFilter={handleRemoveFilter}
            isDeliveryInputMode={isDeliveryInputMode}
          />
        </div>
      </div>

      <ModalTable
        open={modalMode !== null}
        onClose={handleCloseModal}
        onSubmit={async () => {
          if (modalMode === "excel") {
            const success = await handleSaveWithConfirmedFiles();
            if (success) {
              handleCloseModal();
            }
          }
        }}
        disabled={modalMode === "excel" && hasInvalidFiles}
        hideSubmitButton={modalMode === "delivery"}
      >
        <OrderModalContent
          modalMode={modalMode}
          dragActive={dragActive}
          fileInputRef={fileInputRef}
          deliveryFileInputRef={deliveryFileInputRef}
          handleDrop={handleDrop}
          handleDragOver={handleDragOver}
          handleDragLeave={handleDragLeave}
          handleFileChange={handleFileChange}
          handleDeliveryFileChange={handleDeliveryFileChange}
          handleDeliveryDrop={handleDeliveryDrop}
          handleDeliveryDragOver={handleDeliveryDragOver}
          handleResetData={handleResetData}
          handleFileDelete={handleFileDelete}
          openFileInNewWindow={openFileInNewWindow}
          fileValidationStatus={fileValidationStatus}
          directInputModal={directInputModal}
          setDirectInputValue={setDirectInputValue}
          closeDirectInputModal={closeDirectInputModal}
          saveDirectInputModal={saveDirectInputModal}
          openDirectInputModal={openDirectInputModal}
          tableData={tableData}
          fileName={fileName}
          headerIndex={headerIndex}
          productCodeMap={productCodeMap}
          codesOriginRef={codesOriginRef}
          codes={codes}
          recommendIdx={recommendIdx}
          recommendList={recommendList}
          handleInputCode={handleInputCode}
          handleRecommendClick={handleRecommendClick}
          handleSelectSuggest={handleSelectSuggest}
          onCloseRecommend={() => setRecommendIdx(null)}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
          currentOrderNumber={currentOrderNumber}
          deliveryResults={deliveryResults}
          finalResult={finalResult}
          deliveryError={deliveryError}
        />
      </ModalTable>

      {/* 운송장 다운로드 모달 */}
      <DeliveryDownloadModal
        open={isDeliveryDownloadModalOpen}
        onClose={() => setIsDeliveryDownloadModalOpen(false)}
      />
    </div>
  );
}
