"use client";

import {
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
  Suspense,
} from "react";
import {useSearchParams} from "next/navigation";
import {useUploadStore} from "@/stores/uploadStore";
import {useAuthStore} from "@/stores/authStore";
import RecommendModal from "@/components/RecommendModal";
import DirectInputModal from "@/components/DirectInputModal";
import CodeEditWindow from "@/components/CodeEditWindow";
import AutocompleteDropdown from "@/components/AutocompleteDropdown";
import {fieldNameMap} from "@/constants/fieldMappings";
import {PRODUCT_FIELD_ORDER} from "@/constants/productFields";
import {useAutoMapping} from "@/hooks/useAutoMapping";
import {generateAutoDeliveryMessage} from "@/utils/vendorMessageUtils";

function FileViewContent() {
  const searchParams = useSearchParams();
  const fileId = searchParams.get("id");
  const {
    uploadedFiles,
    setUploadedFiles,
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
    getSuggestions,
    openDirectInputModal,
    directInputModal,
    setDirectInputValue,
    closeDirectInputModal,
    saveDirectInputModal,
    confirmFile,
    unconfirmFile,
    confirmedFiles,
  } = useUploadStore();

  // 사용자 정보 (grade 확인용)
  const user = useAuthStore((state) => state.user);

  const [file, setFile] = useState<any>(null);
  const [tableData, setTableData] = useState<any[][]>([]);
  const [fileName, setFileName] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [vendorNameOptions, setVendorNameOptions] = useState<string[]>([]);
  const [confirmedVendorName, setConfirmedVendorName] = useState<string>(""); // 드롭다운에서 선택한 업체명만 저장
  const [confirmedMallId, setConfirmedMallId] = useState<number | null>(null); // 드롭다운에서 선택한 mall id 저장
  const [mallMap, setMallMap] = useState<{[name: string]: number}>({}); // mall name -> id 매핑
  const codesOriginRef = useRef<any[]>([]);

  // 원본 배송메시지 저장 (rowIdx -> 원본 메시지, 파일 로드 시점의 메시지)
  const originalMessagesRef = useRef<{[rowIdx: number]: string}>({});
  // 순수 원본 배송메시지 저장 (rowIdx -> 순수 원본 메시지, 업체명 제거된 메시지)
  const pureOriginalMessagesRef = useRef<{[rowIdx: number]: string}>({});
  // 원본 상품명 및 수량 저장 (rowIdx -> {productName, quantity})
  const originalProductDataRef = useRef<{[rowIdx: number]: {productName: string; quantity: string}}>({});
  // 수량 변환 상태 (변환되었는지 여부)
  const [isQuantityConverted, setIsQuantityConverted] = useState(false);
  // 드래그 시작 시점의 선택 상태 저장
  const dragStartSelectionRef = useRef<boolean>(false);
  const [codeEditWindow, setCodeEditWindow] = useState<{
    open: boolean;
    rowIdx: number;
    productName: string;
  } | null>(null);
  // 클라이언트에서만 관리하는 내외주/택배사 맵 (useAutoMapping이 덮어쓰지 않도록)
  const [productTypeMap, setProductTypeMap] = useState<{
    [name: string]: string;
  }>({});
  const [productPostTypeMap, setProductPostTypeMap] = useState<{
    [name: string]: string;
  }>({});
  // 사용자가 수동으로 선택한 상품 ID 맵 (상품명 -> 선택한 상품 ID)
  // 같은 매핑코드를 가진 여러 상품 중에서 사용자가 선택한 정확한 상품을 추적하기 위함
  const [productIdMap, setProductIdMap] = useState<{
    [name: string]: string | number;
  }>({});
  // Edit 모드 상태
  const [isEditMode, setIsEditMode] = useState(false);
  // 체크박스 선택 상태
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  // 드래그 선택 상태
  const [dragStartRow, setDragStartRow] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<{x: number; y: number} | null>(null);
  // 일괄 적용 인풋 상태
  const [bulkProductName, setBulkProductName] = useState("");
  const [bulkQuantity, setBulkQuantity] = useState("");
  // 신규 생성 모달에서 상품명 편집 가능 여부
  const [isNewProductModal, setIsNewProductModal] = useState(false);

  // 상품 수정 모달 상태
  const [productEditModal, setProductEditModal] = useState({
    open: false,
    fields: [] as string[],
    values: {} as {[key: string]: string},
    productCode: "" as string,
  });
  const [savingProduct, setSavingProduct] = useState(false);

  // 테이블 정렬 함수 (상품명 오름차순, 동일 시 수취인명/이름 오름차순)
  const sortTableData = (data: any[][]): any[][] => {
    if (
      !data.length ||
      !headerIndex ||
      typeof headerIndex.nameIdx !== "number" ||
      headerIndex.nameIdx === -1
    ) {
      return data;
    }

    const headerRow = data[0];
    const productNameIdx = headerIndex.nameIdx;
    const receiverIdx = headerRow.findIndex(
      (h: any) =>
        h &&
        typeof h === "string" &&
        (h.includes("수취인명") || h.includes("이름"))
    );

    const sortedBody = [...data.slice(1)].sort((a, b) => {
      const prodA = a[productNameIdx] || "";
      const prodB = b[productNameIdx] || "";
      const prodCompare = String(prodA).localeCompare(String(prodB), "ko-KR");
      if (prodCompare !== 0) return prodCompare;
      if (receiverIdx !== -1) {
        const recA = a[receiverIdx] || "";
        const recB = b[receiverIdx] || "";
        return String(recA).localeCompare(String(recB), "ko-KR");
      }
      return 0;
    });

    return [headerRow, ...sortedBody];
  };

  // 수량 내림차순 정렬 함수 (수량 내림차순 > 상품명 오름차순 > 수취인명 오름차순)
  const sortTableDataByQuantity = (data: any[][]): any[][] => {
    if (!data.length || !headerIndex) {
      return data;
    }

    const headerRow = data[0];
    const qtyIdx = headerRow.findIndex((h: any) => h === "수량");
    const productNameIdx = headerIndex.nameIdx;
    const receiverIdx = headerRow.findIndex(
      (h: any) =>
        h &&
        typeof h === "string" &&
        (h.includes("수취인명") || h.includes("이름"))
    );

    if (qtyIdx === -1) {
      return data;
    }

    const sortedBody = [...data.slice(1)].sort((a, b) => {
      // 1순위: 수량 내림차순
      const qtyA = Number(a[qtyIdx]) || 0;
      const qtyB = Number(b[qtyIdx]) || 0;
      const qtyCompare = qtyB - qtyA;
      if (qtyCompare !== 0) return qtyCompare;

      // 2순위: 상품명 오름차순
      if (typeof productNameIdx === "number" && productNameIdx !== -1) {
        const prodA = a[productNameIdx] || "";
        const prodB = b[productNameIdx] || "";
        const prodCompare = String(prodA).localeCompare(String(prodB), "ko-KR");
        if (prodCompare !== 0) return prodCompare;
      }

      // 3순위: 수취인명 오름차순
      if (receiverIdx !== -1) {
        const recA = a[receiverIdx] || "";
        const recB = b[receiverIdx] || "";
        return String(recA).localeCompare(String(recB), "ko-KR");
      }

      return 0;
    });

    return [headerRow, ...sortedBody];
  };

  // 편집 토글 시 정렬 적용
  const handleToggleEditMode = () => {
    const next = !isEditMode;
    const applySortedData = (sortedData: any[][]) => {
      if (sortedData === tableData) return;
      setTableData(sortedData);
      if (fileId) {
        const updatedFile = {
          ...file,
          tableData: sortedData,
          rowCount: sortedData.length - 1,
          productCodeMap: {...productCodeMap},
        };
        setFile(updatedFile);
        sessionStorage.setItem(
          `uploadedFile_${fileId}`,
          JSON.stringify(updatedFile)
        );
        const updatedFiles = uploadedFiles.map((f) =>
          f.id === fileId ? updatedFile : f
        );
        setUploadedFiles(updatedFiles);
      }
    };

    if (!isEditMode && next) {
      // 편집 진입 시 수량 오름차순 정렬
      const sortedData = sortTableDataByQuantity(tableData);
      applySortedData(sortedData);
      // 체크박스 선택 초기화
      setSelectedRows(new Set());
    } else if (isEditMode && !next) {
      // 편집 종료 시 상품명 정렬
      const sortedData = sortTableData(tableData);
      applySortedData(sortedData);
      // 체크박스 선택 초기화
      setSelectedRows(new Set());
      setBulkProductName("");
      setBulkQuantity("");
      // 수량 변환 상태는 유지 (사용자가 원하면 다시 변환/복원 가능)
    }
    setIsEditMode(next);
  };

  // 전체 체크박스 토글
  const handleSelectAll = () => {
    if (selectedRows.size === tableData.length - 1) {
      setSelectedRows(new Set());
    } else {
      const allRows = new Set<number>();
      for (let i = 1; i < tableData.length; i++) {
        allRows.add(i);
      }
      setSelectedRows(allRows);
    }
  };

  // 개별 체크박스 토글
  const handleRowSelect = (rowIndex: number) => {
    const newSelectedRows = new Set(selectedRows);
    if (newSelectedRows.has(rowIndex)) {
      newSelectedRows.delete(rowIndex);
    } else {
      newSelectedRows.add(rowIndex);
    }
    setSelectedRows(newSelectedRows);
  };

  // 드래그 시작
  const handleDragStart = (rowIndex: number, e: React.MouseEvent) => {
    // 체크박스 클릭이 아닌 드래그인 경우에만 처리
    if (e.button !== 0) return; // 왼쪽 마우스 버튼만
    
    // 체크박스 직접 클릭이 아닌 경우에만 드래그 시작
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' && target.getAttribute('type') === 'checkbox') {
      // 체크박스 직접 클릭은 일반 클릭으로 처리
      return;
    }
    
    // 드래그 시작 위치 저장
    setDragStartPos({x: e.clientX, y: e.clientY});
    setIsDragging(true);
    setDragStartRow(rowIndex);
    
    // 드래그 시작 시점의 선택 상태 저장 (토글 전 상태)
    dragStartSelectionRef.current = selectedRows.has(rowIndex);
    
    // 현재 행 선택 상태 토글
    const newSelectedRows = new Set(selectedRows);
    if (newSelectedRows.has(rowIndex)) {
      newSelectedRows.delete(rowIndex);
    } else {
      newSelectedRows.add(rowIndex);
    }
    setSelectedRows(newSelectedRows);
    
    e.preventDefault();
  };

  // 드래그 중
  const handleDragOver = (rowIndex: number, e: React.MouseEvent) => {
    if (!isDragging || dragStartRow === null || !dragStartPos) return;
    
    // 드래그 거리 확인 (너무 작은 이동은 무시)
    const dragDistance = Math.abs(e.clientY - dragStartPos.y);
    if (dragDistance < 5) return; // 5px 미만은 클릭으로 간주
    
    e.preventDefault();
    
    // 시작 행부터 현재 행까지 범위 선택
    const start = Math.min(dragStartRow, rowIndex);
    const end = Math.max(dragStartRow, rowIndex);
    
    const newSelectedRows = new Set(selectedRows);
    // 드래그 시작 시점의 선택 상태를 기준으로 범위 선택/해제
    const startWasSelected = dragStartSelectionRef.current;
    
    for (let i = start; i <= end; i++) {
      if (startWasSelected) {
        // 시작 행이 선택되어 있었으면 범위 선택
        newSelectedRows.add(i);
      } else {
        // 시작 행이 선택되지 않았었으면 범위 해제
        newSelectedRows.delete(i);
      }
    }
    
    setSelectedRows(newSelectedRows);
  };

  // 드래그 종료
  const handleDragEnd = () => {
    setIsDragging(false);
    setDragStartRow(null);
    setDragStartPos(null);
    dragStartSelectionRef.current = false;
  };

  // 마우스가 체크박스 영역을 벗어날 때도 드래그 종료 처리
  useEffect(() => {
    const handleMouseUp = () => {
      if (isDragging) {
        handleDragEnd();
      }
    };

    const handleMouseLeave = () => {
      if (isDragging) {
        handleDragEnd();
      }
    };

    if (isDragging) {
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('mouseleave', handleMouseLeave);
      
      return () => {
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('mouseleave', handleMouseLeave);
      };
    }
  }, [isDragging]);

  // 일괄 적용 함수
  const handleBulkApply = (e: React.MouseEvent<HTMLButtonElement>) => {
    // e.stopPropagation();
    if (selectedRows.size === 0) {
      alert("적용할 행을 선택해주세요.");
      return;
    }

    if (!bulkProductName && !bulkQuantity) {
      alert("상품명 또는 수량을 입력해주세요.");
      return;
    }

    const headerRow = tableData[0];
    const productNameIdx = headerIndex?.nameIdx || -1;
    const qtyIdx = headerRow.findIndex((h: any) => h === "수량");
    const mappingIdx = headerRow.findIndex((h: any) => h === "매핑코드");
    const typeIdx = headerRow.findIndex((h: any) => h === "내외주");
    const postTypeIdx = headerRow.findIndex((h: any) => h === "택배사");

    const newTableData = [...tableData];
    const newProductCodeMap = {...productCodeMap};

    selectedRows.forEach((rowIndex) => {
      // 수량 적용
      if (bulkQuantity && qtyIdx !== -1) {
        newTableData[rowIndex][qtyIdx] = bulkQuantity;
      }

      // 상품명 적용 및 매핑코드, 내외주, 택배사 자동 업데이트
      if (bulkProductName && productNameIdx !== -1) {
        const trimmedValue = bulkProductName.trim();
        newTableData[rowIndex][productNameIdx] = trimmedValue;

        // codes에서 매칭되는 상품 찾기 (상품명이 정확히 일치하는 경우만)
        const matchedProduct = codes.find(
          (c: any) => c.name && String(c.name).trim() === trimmedValue
        );

        console.log("matchedProduct >>>>>>>>>>>>>>>>>>>>>>>", matchedProduct);

        if (matchedProduct) {
          // 매칭되는 상품이 있을 때: 데이터 자동 입력
          // 매핑코드 업데이트
          if (mappingIdx !== -1) {
            newTableData[rowIndex][mappingIdx] = matchedProduct.code || "";
          }

          // 내외주 업데이트
          if (typeIdx !== -1) {
            newTableData[rowIndex][typeIdx] = matchedProduct.type || "";
          }

          // 택배사 업데이트
          if (postTypeIdx !== -1) {
            newTableData[rowIndex][postTypeIdx] = matchedProduct.postType || "";
          }

          // productCodeMap에도 저장
          newProductCodeMap[trimmedValue] = matchedProduct.code || "";

          console.log(
            "newProductCodeMap >>>>>>>>>>>>>>>>>>>>>>>",
            newProductCodeMap
          );
        } else {
          // 매칭되는 상품이 없을 때: 모두 공란으로 처리
          if (mappingIdx !== -1) {
            newTableData[rowIndex][mappingIdx] = "";
          }
          if (typeIdx !== -1) {
            newTableData[rowIndex][typeIdx] = "";
          }
          if (postTypeIdx !== -1) {
            newTableData[rowIndex][postTypeIdx] = "";
          }

          // Map에서도 제거
          if (trimmedValue) {
            delete newProductCodeMap[trimmedValue];
          }
        }
      }
    });

    setTableData(newTableData);
    setProductCodeMap(newProductCodeMap);

    // 파일 데이터도 업데이트 (로컬만)
    if (fileId) {
      const updatedFile = {
        ...file,
        tableData: newTableData,
        rowCount: newTableData.length - 1,
        productCodeMap: newProductCodeMap,
      };
      setFile(updatedFile);
      sessionStorage.setItem(
        `uploadedFile_${fileId}`,
        JSON.stringify(updatedFile)
      );
      const updatedFiles = uploadedFiles.map((f) =>
        f.id === fileId ? updatedFile : f
      );
      setUploadedFiles(updatedFiles);
    }

    // 초기화
    setBulkProductName("");
    setBulkQuantity("");
    // setSelectedRows(new Set());
    alert(`${selectedRows.size}개 행에 일괄 적용되었습니다.`);
  };

  // 선택된 행 삭제 함수
  const handleBulkDelete = () => {
    if (selectedRows.size === 0) {
      alert("삭제할 행을 선택해주세요.");
      return;
    }

    const deleteCount = selectedRows.size;
    // if (!confirm(`선택한 ${deleteCount}개 행을 삭제하시겠습니까?`)) {
    //   return;
    // }

    // 선택된 행을 제외한 새로운 테이블 데이터 생성
    const newTableData = tableData.filter(
      (row, index) => index === 0 || !selectedRows.has(index)
    );

    setTableData(newTableData);

    // 파일 데이터도 업데이트 (로컬만)
    if (fileId) {
      const updatedFile = {
        ...file,
        tableData: newTableData,
        rowCount: newTableData.length - 1,
        productCodeMap: {...productCodeMap},
      };
      setFile(updatedFile);
      sessionStorage.setItem(
        `uploadedFile_${fileId}`,
        JSON.stringify(updatedFile)
      );
      const updatedFiles = uploadedFiles.map((f) =>
        f.id === fileId ? updatedFile : f
      );
      setUploadedFiles(updatedFiles);
    }

    // 초기화
    setSelectedRows(new Set());
    // alert(`${deleteCount}개 행이 삭제되었습니다.`);
  };

  // 행 복제 함수
  const handleDuplicateRow = (rowIndex: number) => {
    if (rowIndex < 1) return; // 헤더는 복제 불가

    const newTableData = [...tableData];
    const rowToDuplicate = [...newTableData[rowIndex]];

    // 복제된 행을 원본 행 바로 아래에 삽입
    newTableData.splice(rowIndex + 1, 0, rowToDuplicate);

    setTableData(newTableData);

    // 파일 데이터도 업데이트 (로컬만)
    if (fileId) {
      const updatedFile = {
        ...file,
        tableData: newTableData,
        rowCount: newTableData.length - 1,
        productCodeMap: {...productCodeMap},
      };
      setFile(updatedFile);
      sessionStorage.setItem(
        `uploadedFile_${fileId}`,
        JSON.stringify(updatedFile)
      );
      const updatedFiles = uploadedFiles.map((f) =>
        f.id === fileId ? updatedFile : f
      );
      setUploadedFiles(updatedFiles);
    }
  };

  // 셀 값 변경 함수
  const handleCellChange = (
    rowIndex: number,
    colIndex: number,
    value: string
  ) => {
    const newTableData = [...tableData];

    // 배송메시지 컬럼 인덱스 찾기
    const headerRow = newTableData[0];
    const messageIdx = headerRow.findIndex(
      (h: any) =>
        h &&
        typeof h === "string" &&
        (h === "배송메시지" ||
          h === "배송메세지" ||
          h === "배송요청" ||
          h === "요청사항" ||
          h === "배송요청사항")
    );

    // 배송메시지 컬럼은 변경하지 않음 (자동 생성된 메시지 보호)
    // 주문자명 컬럼 변경 시에도 배송메시지를 업데이트하지 않도록 보호
    if (colIndex !== messageIdx) {
      newTableData[rowIndex][colIndex] = value;

      // 주문자명 컬럼이 변경된 경우, 배송메시지를 재생성하지 않도록 보호
      if (messageIdx !== -1 && newTableData[rowIndex][messageIdx]) {
        const currentMessage = String(newTableData[rowIndex][messageIdx]);
        // 이미 #로 시작하는 메시지는 유지 (재생성 방지)
        if (currentMessage.startsWith("#")) {
          // 메시지를 그대로 유지
        }
      }
    }

    // 상품명 컬럼이 변경된 경우 매핑코드, 내외주, 택배사도 자동 업데이트
    if (headerIndex && colIndex === headerIndex.nameIdx) {
      const trimmedValue = value.trim();

      // codes에서 매칭되는 상품 찾기 (상품명이 정확히 일치하는 경우만)
      const matchedProduct = codes.find(
        (c: any) => c.name && String(c.name).trim() === trimmedValue
      );

      const headerRow = newTableData[0];
      const mappingIdx = headerRow.findIndex((h: any) => h === "매핑코드");
      const typeIdx = headerRow.findIndex((h: any) => h === "내외주");
      const postTypeIdx = headerRow.findIndex((h: any) => h === "택배사");

      if (matchedProduct) {
        // 매칭되는 상품이 있을 때: 데이터 자동 입력
        // 매핑코드 업데이트
        if (mappingIdx !== -1) {
          newTableData[rowIndex][mappingIdx] = matchedProduct.code || "";
        }

        // 내외주 업데이트
        if (typeIdx !== -1) {
          newTableData[rowIndex][typeIdx] = matchedProduct.type || "";
          // productTypeMap에도 저장
          if (matchedProduct.type) {
            const newTypeMap = {
              ...productTypeMap,
              [trimmedValue]: matchedProduct.type,
            };
            setProductTypeMap(newTypeMap);
          }
        }

        // 택배사 업데이트
        if (postTypeIdx !== -1) {
          newTableData[rowIndex][postTypeIdx] = matchedProduct.postType || "";
          // productPostTypeMap에도 저장
          if (matchedProduct.postType) {
            const newPostTypeMap = {
              ...productPostTypeMap,
              [trimmedValue]: matchedProduct.postType,
            };
            setProductPostTypeMap(newPostTypeMap);
          }
        }

        // productCodeMap에도 저장
        const newCodeMap = {
          ...productCodeMap,
          [trimmedValue]: matchedProduct.code || "",
        };
        setProductCodeMap(newCodeMap);
      } else {
        // 매칭되는 상품이 없을 때: 모두 공란으로 처리
        if (mappingIdx !== -1) {
          newTableData[rowIndex][mappingIdx] = "";
        }
        if (typeIdx !== -1) {
          newTableData[rowIndex][typeIdx] = "";
        }
        if (postTypeIdx !== -1) {
          newTableData[rowIndex][postTypeIdx] = "";
        }

        // Map에서도 제거
        if (trimmedValue) {
          const newTypeMap = {...productTypeMap};
          delete newTypeMap[trimmedValue];
          setProductTypeMap(newTypeMap);

          const newPostTypeMap = {...productPostTypeMap};
          delete newPostTypeMap[trimmedValue];
          setProductPostTypeMap(newPostTypeMap);

          const newCodeMap = {...productCodeMap};
          delete newCodeMap[trimmedValue];
          setProductCodeMap(newCodeMap);
        }
      }
    }

    setTableData(newTableData);

    // 파일 데이터도 업데이트 (로컬만)
    if (fileId) {
      const updatedFile = {
        ...file,
        tableData: newTableData,
        rowCount: newTableData.length - 1,
        productCodeMap: {...productCodeMap},
      };
      setFile(updatedFile);
      sessionStorage.setItem(
        `uploadedFile_${fileId}`,
        JSON.stringify(updatedFile)
      );
      const updatedFiles = uploadedFiles.map((f) =>
        f.id === fileId ? updatedFile : f
      );
      setUploadedFiles(updatedFiles);
    }
  };

  // 업체명만 업데이트하는 함수 (배송메시지는 원본 메시지로 복원)
  // 이 함수는 드롭다운에서 선택했을 때만 호출됨
  const updateVendorName = (newVendorName: string) => {
    const headerRow = tableData[0];
    const vendorIdx = headerRow.findIndex(
      (h: any) => h && typeof h === "string" && h === "업체명"
    );

    if (vendorIdx === -1) return;

    // 배송메시지 컬럼 인덱스 확인 (업체명 변경 시 배송메시지를 원본으로 복원)
    const messageIdx = headerRow.findIndex(
      (h: any) =>
        h &&
        typeof h === "string" &&
        (h === "배송메시지" ||
          h === "배송메세지" ||
          h === "배송요청" ||
          h === "요청사항" ||
          h === "배송요청사항")
    );

    const vendorStr = newVendorName.trim();
    const updatedTable = tableData.map((row, idx) => {
      if (idx === 0) return row;
      const newRow = [...row];
      // 업체명 컬럼만 업데이트
      newRow[vendorIdx] = vendorStr;
      // 배송메시지 컬럼은 원본 메시지로 복원 (업체명 변경 시 변하지 않도록 보호)
      if (messageIdx !== -1) {
        const originalMessage = originalMessagesRef.current[idx];
        if (originalMessage !== undefined) {
          newRow[messageIdx] = originalMessage;
        } else {
          newRow[messageIdx] = row[messageIdx];
        }
      }
      return newRow;
    });

    setTableData(updatedTable);

    // 파일 데이터도 업데이트 (로컬만)
    if (fileId) {
      const updatedFile = {
        ...file,
        tableData: updatedTable,
        rowCount: updatedTable.length - 1,
        productCodeMap: {...productCodeMap},
      };
      setFile(updatedFile);
      sessionStorage.setItem(
        `uploadedFile_${fileId}`,
        JSON.stringify(updatedFile)
      );
      const updatedFiles = uploadedFiles.map((f) =>
        f.id === fileId ? updatedFile : f
      );
      setUploadedFiles(updatedFiles);
    }
  };

  // 드롭다운에서 업체명 선택 시 호출되는 함수
  const handleVendorNameSelect = (selectedVendorName: string) => {
    setConfirmedVendorName(selectedVendorName);
    setVendorName(selectedVendorName);
    // 선택한 업체명에 해당하는 mall_id 찾기
    const mallId = mallMap[selectedVendorName] || null;
    setConfirmedMallId(mallId);
    if (mallId) {
      console.log(
        `✅ 업체명 "${selectedVendorName}" 선택됨, mall_id=${mallId}`
      );
    } else {
      console.warn(
        `⚠️ 업체명 "${selectedVendorName}"에 해당하는 mall_id를 찾을 수 없습니다.`
      );
    }
    updateVendorName(selectedVendorName);
  };

  // 인풋 값 변경 시 (드롭다운 선택이 아닌 직접 입력)
  const handleVendorNameInputChange = (inputValue: string) => {
    setVendorName(inputValue);
    // 드롭다운에서 선택하지 않았으면 테이블에 적용하지 않음
  };

  // 매핑코드와 업체명이 모두 입력되었는지 확인
  const isAllMappingCodesFilled = useMemo(() => {
    if (
      !tableData.length ||
      !headerIndex ||
      typeof headerIndex.nameIdx !== "number"
    ) {
      return false;
    }

    const headerRow = tableData[0];
    const nameIdx = headerIndex.nameIdx;
    const vendorIdx = headerRow.findIndex(
      (h: any) => h === "업체명" || h === "업체"
    );
    const mappingIdx = headerRow.findIndex((h: any) => h === "매핑코드");
    const dataRows = tableData.slice(1);

    // 모든 행의 상품명에 대해 매핑코드와 업체명이 있는지 확인
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const name = row[nameIdx];

      if (!name || typeof name !== "string" || name.trim() === "") {
        continue; // 상품명이 없으면 건너뛰기
      }

      const trimmedName = name.trim();

      // 매핑코드 확인 (4가지 소스)
      const codeFromMap = productCodeMap[trimmedName];
      const codeFromTable =
        mappingIdx !== -1 ? String(row[mappingIdx] || "").trim() : "";
      const codeFromCodes = codes.find(
        (c: any) => c.name === trimmedName
      )?.code;
      const codeFromOrigin = codesOriginRef.current.find(
        (c) => c.name === trimmedName
      )?.code;

      const hasMappingCode = !!(
        codeFromMap ||
        (codeFromTable && codeFromTable !== "") ||
        codeFromCodes ||
        codeFromOrigin
      );

      // 업체명 확인
      const vendorName =
        vendorIdx !== -1 ? String(row[vendorIdx] || "").trim() : "";

      // 매핑코드나 업체명이 하나라도 없으면 false 반환
      if (!hasMappingCode || (vendorIdx !== -1 && !vendorName)) {
        return false;
      }
    }

    return true; // 모든 상품명에 매핑코드와 업체명이 있음
  }, [tableData, headerIndex, productCodeMap, codes]);

  const isConfirmed = fileId ? confirmedFiles.has(fileId) : false;

  // 매핑코드 클릭 핸들러 (상품 수정 모달 열기)
  const handleMappingCodeClick = useCallback(
    async (mappingCode: string, uploadedProductName?: string) => {
      if (!mappingCode || !mappingCode.trim()) {
        return;
      }

      try {
        // 먼저 codes 배열에서 매핑코드로 상품 찾기
        const productFromCodes = codes.find(
          (p: any) => String(p.code || "").trim() === String(mappingCode).trim()
        );

        // codes 배열에서 찾은 상품의 ID가 있으면 ID로 조회, 없으면 매핑코드로 조회
        if (productFromCodes && productFromCodes.id) {
          const {fetchProducts} = await import("@/utils/api");
          const result = await fetchProducts();

          if (result.success && result.data) {
            // ID로 상품 찾기
            const product = result.data.find(
              (p: any) => p.id === productFromCodes.id
            );

            if (product) {
              // Product 데이터를 DirectInputModal 형식으로 변환
              const values: {[key: string]: string} = {};
              const fieldOrder = [...PRODUCT_FIELD_ORDER];

              fieldOrder.forEach((field) => {
                // postType 필드는 postType 또는 post_type 둘 다 확인
                let value = (product as any)[field];
                if (
                  field === "postType" &&
                  (value === null || value === undefined || value === "")
                ) {
                  value = (product as any).post_type;
                }

                if (value !== null && value !== undefined && value !== "") {
                  values[field] = String(value).trim();
                } else {
                  values[field] = "";
                }
              });

              // 상품명 우선순위: 업로드한 데이터의 상품명 > 상품 정보의 상품명
              if (uploadedProductName && uploadedProductName.trim()) {
                values.name = uploadedProductName.trim();
              }

              setProductEditModal({
                open: true,
                fields: fieldOrder,
                values,
                productCode: String(mappingCode).trim(),
              });
            } else {
              alert(
                `상품 ID "${productFromCodes.id}"에 해당하는 상품을 찾을 수 없습니다.`
              );
            }
          } else {
            throw new Error(result.error || "상품 정보를 가져올 수 없습니다.");
          }
        } else {
          // codes 배열에서 ID를 찾을 수 없으면 기존 방식대로 매핑코드로 조회
          const {fetchProducts} = await import("@/utils/api");
          const result = await fetchProducts();

          if (result.success && result.data) {
            // 택배사가 있는 상품 우선 선택
            const productsWithPostType = result.data.filter(
              (p: any) =>
                String(p.code || "").trim() === String(mappingCode).trim() &&
                p.postType &&
                String(p.postType).trim() !== ""
            );
            const productsWithoutPostType = result.data.filter(
              (p: any) =>
                String(p.code || "").trim() === String(mappingCode).trim() &&
                (!p.postType || String(p.postType).trim() === "")
            );
            const product =
              productsWithPostType.length > 0
                ? productsWithPostType[0]
                : productsWithoutPostType[0];

            if (product) {
              // Product 데이터를 DirectInputModal 형식으로 변환
              const values: {[key: string]: string} = {};
              const fieldOrder = [...PRODUCT_FIELD_ORDER];

              fieldOrder.forEach((field) => {
                // postType 필드는 postType 또는 post_type 둘 다 확인
                let value = (product as any)[field];
                if (
                  field === "postType" &&
                  (value === null || value === undefined || value === "")
                ) {
                  value = (product as any).post_type;
                }

                if (value !== null && value !== undefined && value !== "") {
                  values[field] = String(value).trim();
                } else {
                  values[field] = "";
                }
              });

              // 상품명 우선순위: 업로드한 데이터의 상품명 > 상품 정보의 상품명
              if (uploadedProductName && uploadedProductName.trim()) {
                values.name = uploadedProductName.trim();
              }

              setProductEditModal({
                open: true,
                fields: fieldOrder,
                values,
                productCode: String(mappingCode).trim(),
              });
            } else {
              alert(
                `매핑코드 "${mappingCode}"에 해당하는 상품을 찾을 수 없습니다.`
              );
            }
          } else {
            throw new Error(result.error || "상품 정보를 가져올 수 없습니다.");
          }
        }
      } catch (error) {
        console.error("상품 정보 조회 실패:", error);
        alert("상품 정보를 가져오는 중 오류가 발생했습니다.");
      }
    },
    [codes]
  );

  // 상품 수정 모달 닫기
  const handleCloseProductEditModal = useCallback(() => {
    setProductEditModal({
      open: false,
      fields: [],
      values: {},
      productCode: "",
    });
  }, []);

  // 상품 수정 모달 값 변경
  const handleProductEditValueChange = useCallback(
    (key: string, value: string) => {
      setProductEditModal((prev) => ({
        ...prev,
        values: {...prev.values, [key]: value},
      }));
    },
    []
  );

  // 상품 수정 저장
  const handleSaveProductEdit = useCallback(async () => {
    const {transformProductData} = await import("@/utils/product");
    const {createProduct, fetchProducts, batchUpdateProducts} = await import(
      "@/utils/api"
    );
    const values = productEditModal.values;

    // 필수값: name, code는 필수
    if (!values.name || !values.code) {
      alert("상품명과 매핑코드는 필수입니다.");
      return;
    }

    setSavingProduct(true);
    try {
      // 먼저 상품 목록을 가져와서 상품명, 사방넷명, 매핑코드가 모두 일치하는 상품 찾기
      const productsResult = await fetchProducts();
      if (!productsResult.success || !productsResult.data) {
        throw new Error("상품 목록을 가져올 수 없습니다.");
      }

      const productName = String(values.name).trim();
      const sabangName = values.sabangName
        ? String(values.sabangName).trim()
        : null;
      const code = String(values.code).trim();

      // 상품명, 사방넷명, 매핑코드가 모두 일치하는 상품 찾기
      const matchingProduct = productsResult.data.find((p: any) => {
        const pName = String(p.name || "").trim();
        const pSabangName = p.sabangName ? String(p.sabangName).trim() : null;
        const pCode = String(p.code || "").trim();

        return (
          pName === productName && pSabangName === sabangName && pCode === code
        );
      });

      const requestBody = transformProductData(values);
      let result;

      if (matchingProduct) {
        // 일치하는 상품이 있으면 업데이트
        result = await batchUpdateProducts([matchingProduct.id], requestBody);
        if (result.success) {
          alert("상품이 성공적으로 수정되었습니다.");
        } else {
          throw new Error(result.error || "수정 실패");
        }
      } else {
        // 일치하는 상품이 없으면 새로 생성
        result = await createProduct(requestBody);
        if (result.success) {
          alert("상품이 성공적으로 등록되었습니다.");
        } else {
          throw new Error(result.error || "저장 실패");
        }
      }

      if (result.success) {
        handleCloseProductEditModal();

        // codes 새로고침
        const refreshResult = await fetchProducts();
        if (refreshResult.success && refreshResult.data) {
          setCodes(refreshResult.data);
        }
      }
    } catch (error) {
      console.error("저장 실패:", error);
      const errorMessage = error instanceof Error ? error.message : "저장 실패";
      alert(`저장 실패: ${errorMessage}`);
    } finally {
      setSavingProduct(false);
    }
  }, [productEditModal.values, handleCloseProductEditModal, setCodes]);

  const handleConfirm = async () => {
    if (fileId && isAllMappingCodesFilled) {
      // 현재 tableData를 그대로 사용 (모든 수정사항이 이미 반영되어 있음)
      // console.log("확인 버튼 클릭 - 저장할 데이터:", {
      //   fileId,
      //   rowCount: tableData.length - 1,
      //   tableData: tableData,
      //   headerIndex,
      //   productCodeMap,
      // });

      // 파일 데이터 준비 (모든 필수 필드 포함)
      const updatedFile = {
        id: file.id,
        fileName: file.fileName,
        rowCount: tableData.length - 1, // 현재 테이블의 실제 행 수
        tableData: [...tableData], // 현재 테이블 데이터의 깊은 복사
        headerIndex: {...headerIndex},
        productCodeMap: {...productCodeMap},
        productIdMap: {...productIdMap}, // 사용자가 선택한 상품 ID 맵도 함께 저장
        vendorName:
          confirmedVendorName.trim() || vendorName.trim() || undefined, // 업체명 포함 (드롭다운에서 선택한 값 우선)
        mallId: confirmedMallId || undefined, // mall_id 포함
        createdAt:
          file.createdAt || file.uploadTime || new Date().toISOString(), // createdAt 유지
      };

      console.log("💾 파일 저장 데이터:", {
        fileName: updatedFile.fileName,
        vendorName: updatedFile.vendorName,
        mallId: updatedFile.mallId,
        confirmedMallId: confirmedMallId,
        confirmedVendorName: confirmedVendorName,
      });

      // console.log("업데이트할 파일 데이터:", {
      //   fileName: updatedFile.fileName,
      //   rowCount: updatedFile.rowCount,
      //   productCodeMapSize: Object.keys(updatedFile.productCodeMap).length,
      //   hasTableData: !!updatedFile.tableData,
      //   tableDataLength: updatedFile.tableData.length,
      // });

      // sessionStorage 업데이트 (먼저 수행)
      try {
        sessionStorage.setItem(
          `uploadedFile_${fileId}`,
          JSON.stringify(updatedFile)
        );
        console.log("sessionStorage 업데이트 성공");
      } catch (error) {
        console.error("sessionStorage 업데이트 실패:", error);
        alert("로컬 저장에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      // store의 uploadedFiles도 업데이트
      const updatedFiles = uploadedFiles.map((f) =>
        f.id === fileId ? updatedFile : f
      );
      setUploadedFiles(updatedFiles);
      console.log("store 업데이트 성공");

      // 서버에 업데이트 (한 번에)
      try {
        const requestData = {
          fileId: fileId,
          tableData: [...tableData], // 현재 테이블 데이터의 깊은 복사
          headerIndex: {...headerIndex},
          productCodeMap: {...productCodeMap},
          productIdMap: {...productIdMap}, // 사용자가 선택한 상품 ID 맵도 함께 전송
          vendorName: confirmedVendorName.trim() || vendorName.trim() || null, // 업체명 포함 (드롭다운에서 선택한 값 우선)
          mallId: confirmedMallId, // 선택한 mall_id 포함
          isConfirmed: true,
        };

        // console.log("📤 서버 업데이트 요청 데이터:", {
        //   fileId: requestData.fileId,
        //   vendorName: requestData.vendorName,
        //   mallId: requestData.mallId,
        //   confirmedMallId: confirmedMallId,
        //   confirmedVendorName: confirmedVendorName,
        // });

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

        const response = await fetch("/api/upload/temp/update", {
          method: "PUT",
          headers,
          body: JSON.stringify(requestData),
        });

        const result = await response.json();
        if (!result.success) {
          console.error("❌ 서버 업데이트 실패:", result.error);
          alert("서버 저장에 실패했습니다. 다시 시도해주세요.");
          return;
        }
        console.log("서버 업데이트 성공", {
          vendorName: confirmedVendorName.trim() || vendorName.trim() || null,
          result: result.data,
        });
      } catch (error) {
        console.error("❌ 서버 업데이트 실패:", error);
        alert("서버 저장에 실패했습니다. 다시 시도해주세요.");
        return;
      }

      confirmFile(fileId);

      // 부모 창에 메시지 전송 (서버 업데이트 완료 후 약간의 지연을 두어 DB 반영 시간 확보)
      if (window.opener) {
        console.log("부모 창에 메시지 전송:", updatedFile.fileName, {
          vendorName: updatedFile.vendorName,
        });
        // 메시지 전송 (vendorName 포함)
        window.opener.postMessage(
          {
            type: "FILE_CONFIRMED",
            fileId: fileId,
            fileData: updatedFile,
            vendorName: confirmedVendorName.trim() || vendorName.trim() || null, // 업체명 명시적으로 전달 (드롭다운에서 선택한 값 우선)
          },
          window.location.origin
        );

        // 메시지가 전송될 시간을 주고 새창 닫기
        setTimeout(() => {
          window.close();
        }, 200); // 지연 시간을 늘려서 서버 업데이트 반영 시간 확보
      } else {
        // opener가 없으면 바로 닫기
        window.close();
      }
    }
  };

  const handleCancel = () => {
    if (fileId) {
      unconfirmFile(fileId);
    }
    window.close();
  };

  // 수량 변환 함수: "|n세트" 패턴을 제거하고 수량으로 변환 (또는 원상태로 복원)
  const handleQuantityConversion = useCallback(() => {
    if (
      !tableData.length ||
      !headerIndex ||
      typeof headerIndex.nameIdx !== "number"
    ) {
      alert("주문 데이터가 없습니다.");
      return;
    }

    const headerRow = tableData[0];
    const productNameIdx = headerIndex.nameIdx;
    const qtyIdx = headerRow.findIndex((h: any) => h === "수량");

    if (qtyIdx === -1) {
      alert("수량 컬럼을 찾을 수 없습니다.");
      return;
    }

    // 변환할 행 선택 (체크박스가 있으면 선택된 행, 없으면 전체)
    const rowsToConvert = selectedRows.size > 0
      ? Array.from(selectedRows)
      : Array.from({length: tableData.length - 1}, (_, i) => i + 1);

    if (rowsToConvert.length === 0) {
      alert("변환할 행을 선택해주세요.");
      return;
    }

    const newTableData = [...tableData];
    let hasChanges = false;

    if (!isQuantityConverted) {
      // 변환: "|n세트" 제거하고 수량으로 변환
      rowsToConvert.forEach((rowIndex) => {
        const row = newTableData[rowIndex];
        const productName = String(row[productNameIdx] || "").trim();
        const currentQuantity = String(row[qtyIdx] || "1").trim();

        // "|n세트" 패턴 찾기
        const setMatch = productName.match(/^(.+)\|(\d+)세트$/);
        if (setMatch) {
          const [, baseName, setCount] = setMatch;
          const setCountNum = Number(setCount);

          // 원본 데이터 저장 (아직 저장되지 않은 경우만)
          if (!originalProductDataRef.current[rowIndex]) {
            originalProductDataRef.current[rowIndex] = {
              productName: productName,
              quantity: currentQuantity,
            };
          }

          // 상품명에서 "|n세트" 제거
          newTableData[rowIndex][productNameIdx] = baseName;
          // 수량에 세트 수 입력
          newTableData[rowIndex][qtyIdx] = String(setCountNum);
          hasChanges = true;
        }
      });

      if (hasChanges) {
        setIsQuantityConverted(true);
        setTableData(newTableData);
        // 파일 업데이트
        if (fileId) {
          const updatedFile = {
            ...file,
            tableData: newTableData,
          };
          setFile(updatedFile);
          try {
            sessionStorage.setItem(
              `uploadedFile_${fileId}`,
              JSON.stringify(updatedFile)
            );
          } catch (error) {
            console.error("sessionStorage 저장 실패:", error);
          }
          const updatedFiles = uploadedFiles.map((f) =>
            f.id === fileId ? updatedFile : f
          );
          setUploadedFiles(updatedFiles);
        }
        alert("수량 변환이 완료되었습니다.");
      } else {
        alert("변환할 수 있는 항목이 없습니다. (|n세트 형식이 없음)");
      }
    } else {
      // 원상태로 복원
      rowsToConvert.forEach((rowIndex) => {
        const originalData = originalProductDataRef.current[rowIndex];
        if (originalData) {
          newTableData[rowIndex][productNameIdx] = originalData.productName;
          newTableData[rowIndex][qtyIdx] = originalData.quantity;
          hasChanges = true;
          // 복원 후 원본 데이터 삭제
          delete originalProductDataRef.current[rowIndex];
        }
      });

      if (hasChanges) {
        // 모든 행이 복원되었는지 확인
        const remainingConvertedRows = rowsToConvert.filter(
          (rowIndex) => originalProductDataRef.current[rowIndex]
        );
        if (remainingConvertedRows.length === 0) {
          setIsQuantityConverted(false);
        }
        setTableData(newTableData);
        // 파일 업데이트
        if (fileId) {
          const updatedFile = {
            ...file,
            tableData: newTableData,
          };
          setFile(updatedFile);
          try {
            sessionStorage.setItem(
              `uploadedFile_${fileId}`,
              JSON.stringify(updatedFile)
            );
          } catch (error) {
            console.error("sessionStorage 저장 실패:", error);
          }
          const updatedFiles = uploadedFiles.map((f) =>
            f.id === fileId ? updatedFile : f
          );
          setUploadedFiles(updatedFiles);
        }
        alert("원상태로 복원되었습니다.");
      } else {
        alert("복원할 데이터가 없습니다.");
      }
    }
  }, [
    tableData,
    headerIndex,
    selectedRows,
    isQuantityConverted,
    fileId,
    file,
    uploadedFiles,
    setUploadedFiles,
  ]);

  // 주문 복사 기능: 상품명을 수량별로 정리하여 클립보드에 복사
  const handleCopyOrderSummary = useCallback(() => {
    if (
      !tableData.length ||
      !headerIndex ||
      typeof headerIndex.nameIdx !== "number"
    ) {
      alert("주문 데이터가 없습니다.");
      return;
    }

    // 사방넷명으로 복사할지 확인
    const useSabangName = confirm("사방넷명으로 복사하시겠습니까?");
    
    const headerRow = tableData[0];
    const productNameIdx = headerIndex.nameIdx;
    const qtyIdx = headerRow.findIndex((h: any) => h === "수량");
    const mappingIdx = headerRow.findIndex((h: any) => h === "매핑코드");

    // 상품명별 또는 사방넷명별 수량 집계
    const productCounts: {[key: string]: number} = {};
    let totalCount = 0;

    // 헤더를 제외한 모든 행 처리
    for (let i = 1; i < tableData.length; i++) {
      const row = tableData[i];
      const productName = String(row[productNameIdx] || "").trim();
      const quantity = qtyIdx !== -1 ? Number(row[qtyIdx]) || 1 : 1;

      if (productName) {
        let displayName = productName;
        
        // 사방넷명으로 복사하는 경우
        if (useSabangName) {
          // 매핑코드로 상품 찾기
          const mappingCode = mappingIdx !== -1 ? String(row[mappingIdx] || "").trim() : "";
          
          // productIdMap에서 상품 ID 찾기
          const productId = productIdMap[productName];
          
          let matchedProduct = null;
          
          // 1순위: productIdMap으로 찾기
          if (productId !== undefined && productId !== null) {
            matchedProduct = codes.find((c: any) => c.id === productId);
          }
          
          // 2순위: 상품명으로 찾기
          if (!matchedProduct) {
            matchedProduct = codes.find(
              (c: any) => c.name && String(c.name).trim() === productName
            );
          }
          
          // 3순위: 매핑코드로 찾기
          if (!matchedProduct && mappingCode) {
            matchedProduct = codes.find(
              (c: any) => c.code && String(c.code).trim() === mappingCode
            );
          }
          
          // 사방넷명이 있으면 사용, 없으면 상품명 사용
          if (matchedProduct?.sabangName && String(matchedProduct.sabangName).trim()) {
            displayName = String(matchedProduct.sabangName).trim();
          }
        }
        
        if (displayName) {
          productCounts[displayName] =
            (productCounts[displayName] || 0) + quantity;
          totalCount += quantity;
        }
      }
    }

    // 현재 날짜 (월/일 형식)
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const dateStr = `${month}/${day}`;

    // 상품명을 정렬하여 텍스트 생성
    const sortedProducts = Object.keys(productCounts).sort((a, b) =>
      a.localeCompare(b, "ko-KR")
    );

    // 텍스트 생성: "상품명 - n" 형식으로 줄바꿈 처리
    const productLines = sortedProducts.map(
      (productName) => `${productName} - ${productCounts[productName]}`
    );

    // 최종 텍스트: 최상단에 월/일, 중간에 상품 목록, 최하단에 총 n건
    const finalText = [
      dateStr,
      "\n",
      ...productLines,
      "\n",
      `총 ${totalCount}건`,
    ].join("\n");

    // 클립보드에 복사
    navigator.clipboard
      .writeText(finalText)
      .then(() => {
        alert("주문 정보가 클립보드에 복사되었습니다.");
      })
      .catch((error) => {
        console.error("클립보드 복사 실패:", error);
        alert("클립보드 복사에 실패했습니다.");
      });
  }, [tableData, headerIndex, codes, productIdMap]);

  useEffect(() => {
    // 상품 목록 fetch (DB에서)
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

    fetch("/api/products/list", {headers})
      .then((res) => res.json())
      .then((result) => {
        if (result.success) {
          setCodes(result.data || []);
        }
      })
      .catch((error) => {
        console.error("상품 목록 조회 실패:", error);
      });

    // 업체명 목록 fetch (mall 테이블에서)
    fetch("/api/mall?limit=1000", {headers})
      .then((res) => res.json())
      .then((result) => {
        if (result.success && result.data) {
          // mall 테이블의 name 필드를 업체명으로 사용
          const mallNames: string[] = result.data
            .map((mall: any) => String(mall.name || ""))
            .filter((name: string) => name.trim() !== "");
          // 중복 제거하여 정렬
          const uniqueNames: string[] = Array.from(new Set(mallNames)).sort();
          setVendorNameOptions(uniqueNames);

          // mall name -> id 매핑 생성
          const nameToIdMap: {[name: string]: number} = {};
          result.data.forEach((mall: any) => {
            if (mall.name && mall.id) {
              nameToIdMap[String(mall.name)] = mall.id;
            }
          });
          setMallMap(nameToIdMap);
        }
      })
      .catch((error) => {
        console.error("업체명 목록 조회 실패:", error);
      });
  }, [setCodes]);

  useEffect(() => {
    if (codes.length && codesOriginRef.current.length === 0) {
      codesOriginRef.current = [...codes];
    }
  }, [codes]);

  // mallMap이 로드된 후 파일의 vendorName을 기반으로 mallId 복원
  useEffect(() => {
    if (
      Object.keys(mallMap).length > 0 &&
      confirmedVendorName &&
      !confirmedMallId
    ) {
      const mallId = mallMap[confirmedVendorName];
      if (mallId) {
        setConfirmedMallId(mallId);
        console.log(
          `✅ mallMap 로드 후 mallId 복원: vendorName="${confirmedVendorName}", mallId=${mallId}`
        );
      }
    }
  }, [mallMap, confirmedVendorName, confirmedMallId]);

  useEffect(() => {
    if (!fileId) return;

    const loadFileData = async () => {
      // 먼저 sessionStorage에서 파일 데이터 가져오기 시도
      const storedFile = sessionStorage.getItem(`uploadedFile_${fileId}`);
      let parsedFile = null;

      if (storedFile) {
        try {
          parsedFile = JSON.parse(storedFile);
        } catch (error) {
          console.error("파일 데이터 파싱 실패:", error);
        }
      }

      // sessionStorage에 없으면 store에서 찾기
      if (!parsedFile) {
        const foundFile = uploadedFiles.find((f) => f.id === fileId);
        if (foundFile) {
          parsedFile = foundFile;
        }
      }

      // store에도 없으면 서버에서 직접 불러오기
      if (!parsedFile) {
        const sessionId = sessionStorage.getItem("uploadSessionId");
        if (sessionId) {
          try {
            const response = await fetch(
              `/api/upload/temp/list?sessionId=${sessionId}`
            );
            const result = await response.json();
            if (result.success && result.data) {
              const serverFile = result.data.find((f: any) => f.id === fileId);
              if (serverFile) {
                parsedFile = serverFile;
                // sessionStorage와 store에 저장
                sessionStorage.setItem(
                  `uploadedFile_${fileId}`,
                  JSON.stringify(serverFile)
                );
                setUploadedFiles(result.data);
              }
            }
          } catch (error) {
            console.error("서버에서 파일 불러오기 실패:", error);
          }
        }
      }

      // 파일 데이터 설정
      if (parsedFile) {
        setFile(parsedFile);
        setFileName(parsedFile.fileName);
        setHeaderIndex(parsedFile.headerIndex);

        // productCodeMap 초기화 및 기존 데이터 동기화
        let initialProductCodeMap = parsedFile.productCodeMap || {};

        // 테이블의 기존 매핑코드 데이터를 productCodeMap에 동기화
        if (
          parsedFile.tableData &&
          parsedFile.tableData.length > 1 &&
          parsedFile.headerIndex
        ) {
          const headerRow = parsedFile.tableData[0];
          const nameIdx = parsedFile.headerIndex.nameIdx;
          const mappingIdx = headerRow.findIndex((h: any) => h === "매핑코드");

          if (
            typeof nameIdx === "number" &&
            nameIdx !== -1 &&
            mappingIdx !== -1
          ) {
            parsedFile.tableData.slice(1).forEach((row: any[]) => {
              const productName = row[nameIdx];
              const mappingCode = row[mappingIdx];

              if (
                productName &&
                typeof productName === "string" &&
                mappingCode &&
                typeof mappingCode === "string"
              ) {
                const trimmedName = productName.trim();
                const trimmedCode = mappingCode.trim();
                if (
                  trimmedName &&
                  trimmedCode &&
                  !initialProductCodeMap[trimmedName]
                ) {
                  initialProductCodeMap[trimmedName] = trimmedCode;
                }
              }
            });
          }
        }

        setProductCodeMap(initialProductCodeMap);

        // productIdMap 초기화 (파일에서 불러온 데이터가 있으면 사용)
        let initialProductIdMap: {[name: string]: string | number} = {};
        if (parsedFile.productIdMap) {
          initialProductIdMap = {...parsedFile.productIdMap};
        }
        setProductIdMap(initialProductIdMap);

        // 원본 배송메시지 저장 및 자동 배송메시지 생성
        if (parsedFile.tableData && parsedFile.tableData.length > 1) {
          const headerRow = parsedFile.tableData[0];
          const messageIdx = headerRow.findIndex(
            (h: any) =>
              h &&
              typeof h === "string" &&
              (h === "배송메시지" ||
                h === "배송메세지" ||
                h === "배송요청" ||
                h === "요청사항" ||
                h === "배송요청사항")
          );

          if (messageIdx !== -1) {
            // 각 행의 원본 배송메시지 저장 (파일 로드 시점의 메시지를 그대로 저장)
            parsedFile.tableData.forEach((row: any[], idx: number) => {
              if (idx > 0) {
                const message = row[messageIdx];
                if (message !== null && message !== undefined) {
                  const messageStr = String(message).trim();
                  // 파일 로드 시점의 메시지를 그대로 원본으로 저장
                  originalMessagesRef.current[idx] = messageStr;
                } else {
                  originalMessagesRef.current[idx] = "";
                }
              }
            });
          }

          // 배송메시지 자동 생성 적용 (온라인 유저만 ★주문번호 추가)
          let updatedTableData = generateAutoDeliveryMessage(
            parsedFile.tableData,
            originalMessagesRef.current,
            user?.grade
          );

          // productCodeMap에 있는 매핑코드를 tableData의 매핑코드 컬럼에 반영
          // 내외주, 택배사도 함께 업데이트
          if (
            parsedFile.headerIndex &&
            typeof parsedFile.headerIndex.nameIdx === "number"
          ) {
            const nameIdx = parsedFile.headerIndex.nameIdx;
            const mappingIdx = headerRow.findIndex(
              (h: any) => h === "매핑코드"
            );
            const typeIdx = headerRow.findIndex((h: any) => h === "내외주");
            const postTypeIdx = headerRow.findIndex((h: any) => h === "택배사");

            // codes에서 상품 정보 찾기
            const codesToUse =
              codes.length > 0 ? codes : codesOriginRef.current;

            updatedTableData = updatedTableData.map(
              (row: any[], idx: number) => {
                if (idx === 0) return row; // 헤더는 그대로

                const productName = row[nameIdx];
                if (!productName || typeof productName !== "string") return row;

                const trimmedName = productName.trim();
                if (!trimmedName) return row;

                // productCodeMap에서 매핑코드 찾기
                const mappingCode = initialProductCodeMap[trimmedName];

                // codes에서 상품 정보 찾기
                // 우선순위: 1) 사용자가 선택한 상품 ID로 찾기, 2) 상품명이 정확히 일치하는 경우만 자동 매칭
                let matchedProduct = null;
                // 파일에서 불러온 productIdMap 우선 사용 (파일 로드 시점의 productIdMap)
                const selectedProductId = initialProductIdMap[trimmedName];
                if (selectedProductId !== undefined) {
                  // 사용자가 선택한 상품 ID가 있으면 그것으로 정확히 찾기 (무조건 사용자가 선택한 상품만 사용)
                  matchedProduct = codesToUse.find(
                    (c: any) => c.id === selectedProductId
                  );
                } else {
                  // 사용자가 선택하지 않은 경우에만 상품명이 정확히 일치할 때만 자동 매칭
                  matchedProduct = codesToUse.find(
                    (c: any) => c.name === trimmedName
                  );
                  // 자동 매칭된 상품이 있으면 productIdMap에 저장
                  if (matchedProduct?.id) {
                    initialProductIdMap[trimmedName] = matchedProduct.id;
                  }
                }
                // 매핑코드로 자동 매칭하는 것은 하지 않음 (사용자가 선택한 상품만 사용)

                let rowChanged = false;
                const newRow = [...row];

                // 매핑코드 컬럼 업데이트
                // 사용자가 선택한 상품이 있거나 상품명이 정확히 일치하는 경우에만 매핑코드 사용
                if (mappingIdx !== -1) {
                  const currentMappingCode = String(
                    newRow[mappingIdx] || ""
                  ).trim();
                  let newMappingCode = null;

                  if (matchedProduct) {
                    // 사용자가 선택한 상품이거나 상품명이 정확히 일치하는 경우에만 매핑코드 사용
                    newMappingCode = matchedProduct.code;
                  }
                  // productCodeMap에만 있고 상품명이 일치하지 않는 경우는 무시 (자동 매칭 안 함)

                  if (newMappingCode && currentMappingCode !== newMappingCode) {
                    newRow[mappingIdx] = newMappingCode;
                    rowChanged = true;
                  }
                }

                // 내외주 컬럼 업데이트
                if (typeIdx !== -1 && matchedProduct?.type) {
                  const typeValue = matchedProduct.type;
                  if (newRow[typeIdx] !== typeValue) {
                    newRow[typeIdx] = typeValue;
                    rowChanged = true;
                  }
                }

                // 택배사 컬럼 업데이트
                if (postTypeIdx !== -1 && matchedProduct?.postType) {
                  const postTypeValue = matchedProduct.postType;
                  if (newRow[postTypeIdx] !== postTypeValue) {
                    newRow[postTypeIdx] = postTypeValue;
                    rowChanged = true;
                  }
                }

                return rowChanged ? newRow : row;
              }
            );
          }

          // productIdMap 업데이트 (자동 매칭된 상품 ID 포함)
          if (Object.keys(initialProductIdMap).length > 0) {
            setProductIdMap(initialProductIdMap);
          }

          setTableData(updatedTableData);

          // 업체명은 드롭다운에서 선택해야만 적용되도록 변경
          // 엑셀 파일에서 자동으로 읽어서 설정하지 않음
        } else {
          setTableData(parsedFile.tableData);

          // vendorName과 mallId 복원
          if (parsedFile.vendorName) {
            setVendorName(parsedFile.vendorName);
            setConfirmedVendorName(parsedFile.vendorName);
          }
          // mallId 복원 (우선순위: parsedFile.mallId > mallMap에서 찾기)
          // 주의: mallMap이 아직 로드되지 않았을 수 있으므로 useEffect에서도 처리
          if (parsedFile.mallId) {
            setConfirmedMallId(parsedFile.mallId);
            console.log(
              `✅ 파일 로드 시 mallId 복원: parsedFile.mallId=${parsedFile.mallId}`
            );
          } else if (
            parsedFile.vendorName &&
            Object.keys(mallMap).length > 0 &&
            mallMap[parsedFile.vendorName]
          ) {
            const foundMallId = mallMap[parsedFile.vendorName];
            setConfirmedMallId(foundMallId);
            console.log(
              `✅ 파일 로드 시 mallMap에서 mallId 찾음: vendorName="${parsedFile.vendorName}", mallId=${foundMallId}`
            );
          } else if (parsedFile.vendorName) {
            console.log(
              `⚠️ 파일 로드 시 mallId를 찾을 수 없음: vendorName="${
                parsedFile.vendorName
              }", mallMap 크기=${Object.keys(mallMap).length}`
            );
          }
        }

        console.log(
          "Loaded file from:",
          storedFile
            ? "sessionStorage"
            : uploadedFiles.find((f) => f.id === fileId)
            ? "store"
            : "server"
        );
      }
    };

    loadFileData();
  }, [
    fileId,
    uploadedFiles,
    setHeaderIndex,
    setProductCodeMap,
    setUploadedFiles,
  ]);

  // 자동 매핑 훅 제거 - view 페이지에서는 수동 편집만 허용
  // useAutoMapping을 사용하면 사용자가 수동으로 선택한 매핑코드를 덮어씀
  // codesOriginRef는 직접 초기화
  useEffect(() => {
    if (codes.length > 0 && codesOriginRef.current.length === 0) {
      codesOriginRef.current = [...codes];
    } else if (codes.length > 0) {
      // codes가 업데이트되면 codesOriginRef도 업데이트
      codesOriginRef.current = [...codes];
    }
  }, [codes]);

  // codes가 변경될 때 tableData의 매핑코드, 내외주, 택배사 업데이트 (빈 값만 채움)
  const codesRef = useRef(codes);
  useEffect(() => {
    codesRef.current = codes;
  }, [codes]);

  useEffect(() => {
    if (
      codes.length > 0 &&
      codesRef.current.length > 0 &&
      tableData.length > 1 &&
      headerIndex &&
      typeof headerIndex.nameIdx === "number" &&
      fileId
    ) {
      const headerRow = tableData[0];
      const nameIdx = headerIndex.nameIdx;
      const mappingIdx = headerRow.findIndex((h: any) => h === "매핑코드");
      const typeIdx = headerRow.findIndex((h: any) => h === "내외주");
      const postTypeIdx = headerRow.findIndex((h: any) => h === "택배사");

      let needsTableUpdate = false;
      const updatedTableData = tableData.map((row: any[], idx: number) => {
        if (idx === 0) return row; // 헤더는 그대로

        const productName = row[nameIdx];
        if (!productName || typeof productName !== "string") return row;

        const trimmedName = productName.trim();
        if (!trimmedName) return row;

        // productCodeMap에서 매핑코드 찾기
        const mappingCode = productCodeMap[trimmedName];

        // codes에서 상품 정보 찾기
        // 우선순위: 1) 사용자가 선택한 상품 ID로 찾기, 2) 상품명이 정확히 일치하는 경우만 자동 매칭
        let matchedProduct: any = null;
        const selectedProductId = productIdMap[trimmedName];
        if (selectedProductId !== undefined) {
          // 사용자가 선택한 상품 ID가 있으면 그것으로 정확히 찾기 (무조건 사용자가 선택한 상품만 사용)
          matchedProduct = codesRef.current.find(
            (c: any) => c.id === selectedProductId
          );
        } else {
          // 사용자가 선택하지 않은 경우에만 상품명이 정확히 일치할 때만 자동 매칭
          matchedProduct = codesRef.current.find(
            (c: any) => c.name === trimmedName
          );
          // 자동 매칭된 상품이 있으면 productIdMap에 저장
          if (matchedProduct?.id) {
            setProductIdMap((prev) => ({
              ...prev,
              [trimmedName]: (matchedProduct as any).id,
            }));
          }
        }
        // 매핑코드로 자동 매칭하는 것은 하지 않음 (사용자가 선택한 상품만 사용)

        let rowChanged = false;
        const newRow = [...row];

        // 매핑코드 컬럼 업데이트
        // 사용자가 선택한 상품이 있거나 상품명이 정확히 일치하는 경우에만 매핑코드 사용
        if (mappingIdx !== -1) {
          const currentMappingCode = String(newRow[mappingIdx] || "").trim();
          let newMappingCode = null;

          if (matchedProduct) {
            // 사용자가 선택한 상품이거나 상품명이 정확히 일치하는 경우에만 매핑코드 사용
            newMappingCode = matchedProduct.code;
          }
          // productCodeMap에만 있고 상품명이 일치하지 않는 경우는 무시 (자동 매칭 안 함)

          if (newMappingCode && !currentMappingCode) {
            newRow[mappingIdx] = newMappingCode;
            rowChanged = true;
            needsTableUpdate = true;
          }
        }

        // 내외주 컬럼 업데이트 (matchedProduct가 있고 테이블에 없는 경우만)
        if (typeIdx !== -1 && matchedProduct?.type) {
          const currentType = String(newRow[typeIdx] || "").trim();
          if (!currentType && matchedProduct.type) {
            newRow[typeIdx] = matchedProduct.type;
            rowChanged = true;
            needsTableUpdate = true;
          }
        }

        // 택배사 컬럼 업데이트 (matchedProduct가 있고 테이블에 없는 경우만)
        if (postTypeIdx !== -1 && matchedProduct?.postType) {
          const currentPostType = String(newRow[postTypeIdx] || "").trim();
          if (!currentPostType && matchedProduct.postType) {
            newRow[postTypeIdx] = matchedProduct.postType;
            rowChanged = true;
            needsTableUpdate = true;
          }
        }

        return rowChanged ? newRow : row;
      });

      if (needsTableUpdate) {
        setTableData(updatedTableData);

        // 파일 데이터도 업데이트
        const updatedFile = {
          ...file,
          tableData: updatedTableData,
          productCodeMap: {...productCodeMap},
          productIdMap: {...productIdMap}, // 사용자가 선택한 상품 ID 맵도 함께 저장
        };
        setFile(updatedFile);
        sessionStorage.setItem(
          `uploadedFile_${fileId}`,
          JSON.stringify(updatedFile)
        );
        const updatedFiles = uploadedFiles.map((f) =>
          f.id === fileId ? updatedFile : f
        );
        setUploadedFiles(updatedFiles);
      }
    }
  }, [
    codes.length,
    tableData.length,
    headerIndex,
    productCodeMap,
    productIdMap, // 사용자가 선택한 상품 ID 맵도 dependency에 추가
    fileId,
    file,
    uploadedFiles,
    setUploadedFiles,
  ]);

  // 파일 로드 후 자동 매칭된 상품들을 productCodeMap에 추가하고 tableData에 반영
  useEffect(() => {
    if (
      tableData.length > 1 &&
      codesOriginRef.current.length > 0 &&
      headerIndex &&
      typeof headerIndex.nameIdx === "number"
    ) {
      const headerRow = tableData[0];
      const nameIdx = headerIndex.nameIdx;
      const mappingIdx = headerRow.findIndex((h: any) => h === "매핑코드");
      const typeIdx = headerRow.findIndex((h: any) => h === "내외주");
      const postTypeIdx = headerRow.findIndex((h: any) => h === "택배사");

      let needsUpdate = false;
      let needsTableUpdate = false;
      const updatedProductCodeMap = {...productCodeMap};
      const updatedTableData = tableData.map((row: any[], idx: number) => {
        if (idx === 0) return row; // 헤더는 그대로

        const productName = row[nameIdx];
        if (!productName || typeof productName !== "string") return row;

        const trimmedName = productName.trim();
        if (!trimmedName) return row;

        // 이미 productCodeMap에 없고, 테이블에 매핑코드가 없으며, codes에서 찾을 수 있는 경우 추가
        if (!updatedProductCodeMap[trimmedName]) {
          const tableMappingCode =
            mappingIdx !== -1 ? String(row[mappingIdx] || "").trim() : "";
          if (!tableMappingCode) {
            const matchedProduct = codesOriginRef.current.find(
              (c) => c.name && String(c.name).trim() === trimmedName
            );
            if (matchedProduct?.code) {
              updatedProductCodeMap[trimmedName] = matchedProduct.code;
              needsUpdate = true;
            }
          }
        }

        // productCodeMap에 있는 매핑코드를 tableData에 반영
        const mappingCode =
          updatedProductCodeMap[trimmedName] || productCodeMap[trimmedName];
        // 우선순위: 1) 사용자가 선택한 상품 ID로 찾기, 2) 상품명이 정확히 일치하는 경우만 자동 매칭
        let matchedProduct: any = null;
        const selectedProductId = productIdMap[trimmedName];
        if (selectedProductId !== undefined) {
          // 사용자가 선택한 상품 ID가 있으면 그것으로 정확히 찾기 (무조건 사용자가 선택한 상품만 사용)
          matchedProduct = codesOriginRef.current.find(
            (c: any) => c.id === selectedProductId
          );
        } else {
          // 사용자가 선택하지 않은 경우에만 상품명이 정확히 일치할 때만 자동 매칭
          matchedProduct = codesOriginRef.current.find(
            (c: any) => c.name === trimmedName
          );
          // 자동 매칭된 상품이 있으면 productIdMap에 저장
          if (matchedProduct?.id) {
            setProductIdMap((prev) => ({
              ...prev,
              [trimmedName]: (matchedProduct as any).id,
            }));
          }
        }
        // 매핑코드로 자동 매칭하는 것은 하지 않음 (사용자가 선택한 상품만 사용)

        let rowChanged = false;
        const newRow = [...row];

        // 매핑코드 컬럼 업데이트
        // 사용자가 선택한 상품이 있거나 상품명이 정확히 일치하는 경우에만 매핑코드 사용
        if (mappingIdx !== -1) {
          const currentMappingCode = String(newRow[mappingIdx] || "").trim();
          let newMappingCode = null;

          if (matchedProduct) {
            // 사용자가 선택한 상품이거나 상품명이 정확히 일치하는 경우에만 매핑코드 사용
            newMappingCode = matchedProduct.code;
          }
          // productCodeMap에만 있고 상품명이 일치하지 않는 경우는 무시 (자동 매칭 안 함)

          if (newMappingCode && currentMappingCode !== newMappingCode) {
            newRow[mappingIdx] = newMappingCode;
            rowChanged = true;
            needsTableUpdate = true;
          }
        }

        // 내외주 컬럼 업데이트
        if (typeIdx !== -1 && matchedProduct?.type) {
          const typeValue = matchedProduct.type;
          if (newRow[typeIdx] !== typeValue) {
            newRow[typeIdx] = typeValue;
            rowChanged = true;
            needsTableUpdate = true;
          }
        }

        // 택배사 컬럼 업데이트
        if (postTypeIdx !== -1 && matchedProduct?.postType) {
          const postTypeValue = matchedProduct.postType;
          if (newRow[postTypeIdx] !== postTypeValue) {
            newRow[postTypeIdx] = postTypeValue;
            rowChanged = true;
            needsTableUpdate = true;
          }
        }

        return rowChanged ? newRow : row;
      });

      if (needsUpdate || needsTableUpdate) {
        if (needsUpdate) {
          setProductCodeMap(updatedProductCodeMap);
        }
        if (needsTableUpdate) {
          setTableData(updatedTableData);
        }

        // 파일 데이터도 업데이트
        if (fileId) {
          const updatedFile = {
            ...file,
            tableData: needsTableUpdate ? updatedTableData : file.tableData,
            productCodeMap: needsUpdate
              ? updatedProductCodeMap
              : file.productCodeMap,
          };
          setFile(updatedFile);
          sessionStorage.setItem(
            `uploadedFile_${fileId}`,
            JSON.stringify(updatedFile)
          );
          const updatedFiles = uploadedFiles.map((f) =>
            f.id === fileId ? updatedFile : f
          );
          setUploadedFiles(updatedFiles);
        }
      }
    }
  }, [
    tableData,
    codesOriginRef.current.length,
    headerIndex,
    productCodeMap,
    fileId,
    file,
    uploadedFiles,
    setUploadedFiles,
  ]);

  if (!file || !tableData.length) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <div>파일을 찾을 수 없습니다.</div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen p-4 overflow-auto bg-white pb-24">
      {tableData.length > 0 && headerIndex && headerIndex.nameIdx !== -1 && (
        <>
          <div className="font-bold text-lg mt-4 mb-2 text-black text-left w-full flex flex-row justify-between items-center">
            <span>{fileName}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyOrderSummary}
                className="px-4 py-1 rounded text-sm font-semibold transition-colors bg-purple-500 hover:bg-purple-600 text-white"
              >
                주문 복사
              </button>
              {isEditMode && (
                <button
                  onClick={handleQuantityConversion}
                  className={`px-4 py-1 rounded text-sm font-semibold transition-colors ${
                    isQuantityConverted
                      ? "bg-orange-500 hover:bg-orange-600 text-white"
                      : "bg-green-500 hover:bg-green-600 text-white"
                  }`}
                >
                  {isQuantityConverted ? "수량 변환 취소" : "수량 변환"}
                </button>
              )}
              <button
                onClick={handleToggleEditMode}
                className={`px-4 py-1 rounded text-sm font-semibold transition-colors ${
                  isEditMode
                    ? "bg-[#04a670] hover:bg-[#04a670]/60 text-white"
                    : "bg-blue-500 hover:bg-blue-600 text-white"
                }`}
              >
                {isEditMode ? "편집 완료" : "편집"}
              </button>
              <AutocompleteDropdown
                value={vendorName}
                onChange={handleVendorNameInputChange}
                onSelect={handleVendorNameSelect}
                options={vendorNameOptions}
                placeholder="업체명 입력 또는 선택"
                className="min-w-[150px]"
              />
              <span>{tableData.length - 1}건</span>
            </div>
          </div>
          {isEditMode && (
            <div className="sticky -top-4 z-10 mt-2 mb-2 p-4 bg-blue-50 border border-blue-200 rounded">
              <div className="flex items-center gap-4">
                <input
                  type="text"
                  placeholder="상품명"
                  value={bulkProductName}
                  onChange={(e) => setBulkProductName(e.target.value)}
                  className="border border-gray-300 px-3 py-1 rounded text-sm"
                  style={{minWidth: "200px"}}
                />
                <input
                  type="text"
                  placeholder="수량"
                  value={bulkQuantity}
                  onChange={(e) => setBulkQuantity(e.target.value)}
                  className="border border-gray-300 px-3 py-1 rounded text-sm"
                  style={{minWidth: "100px"}}
                />
                <button
                  onClick={handleBulkApply}
                  className="px-4 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm font-semibold"
                >
                  {selectedRows.size > 0
                    ? `${selectedRows.size}건 적용`
                    : "일괄 적용"}
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="px-4 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-sm font-semibold"
                >
                  {selectedRows.size > 0
                    ? `${selectedRows.size}건 삭제`
                    : "선택 삭제"}
                </button>
                <button
                  onClick={() => {
                    // 신규 생성 모달임을 표시
                    setIsNewProductModal(true);
                    // 상품명이 입력되어 있으면 기본값으로 사용
                    if (bulkProductName && bulkProductName.trim()) {
                      openDirectInputModal(bulkProductName.trim(), null);
                    } else {
                      // 상품명이 없으면 빈 값으로 모달 열기
                      openDirectInputModal("", null);
                    }
                  }}
                  className="px-4 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-sm font-semibold ml-auto"
                >
                  신규 생성
                </button>
              </div>
            </div>
          )}
          <div className="mt-2 w-full overflow-x-auto text-black mb-20">
            <table className="table-auto border border-collapse border-gray-400 w-full min-w-[800px]">
              <thead>
                <tr>
                  {isEditMode && (
                    <th 
                      className="border bg-gray-100 px-2 py-1 text-xs text-center cursor-pointer"
                      onClick={handleSelectAll}
                    >
                      <input
                        type="checkbox"
                        checked={
                          tableData.length > 1 &&
                          selectedRows.size === tableData.length - 1
                        }
                        onChange={(e) => {
                          e.stopPropagation();
                          handleSelectAll();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="cursor-pointer"
                      />
                    </th>
                  )}
                  {tableData[0].map((header, hidx) => {
                    return header === "상품명" ? (
                      <th
                        key={hidx}
                        className="border bg-gray-100 px-2 py-1 text-xs"
                      >
                        <div className="flex flex-col">
                          <span>상품명</span>
                          <span>확정상품명</span>
                        </div>
                      </th>
                    ) : header === "업체명" || header === "업체" ? (
                      <th
                        key={hidx}
                        className="border bg-gray-100 px-2 py-1 text-xs"
                      >
                        <div className="flex flex-col">
                          <span>업체명</span>
                          <span>매입처명</span>
                        </div>
                      </th>
                    ) : header === "내외주" ? (
                      <th
                        key={hidx}
                        className="border bg-gray-100 px-2 py-1 text-xs"
                      >
                        <div className="flex flex-col">
                          <span>내외주</span>
                          <span>택배사</span>
                        </div>
                      </th>
                    ) : header === "택배사" ? null : ( // 택배사 칼럼 숨기기
                      <th
                        key={hidx}
                        className="border bg-gray-100 px-2 py-1 text-xs"
                      >
                        {header}
                      </th>
                    );
                  })}
                  <th className="border bg-gray-100 px-2 py-1 text-xs text-center">
                    매핑코드
                  </th>
                  {isEditMode && (
                    <th className="border bg-gray-100 px-2 py-1 text-xs text-center">
                      복제
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  if (!headerIndex || typeof headerIndex.nameIdx !== "number")
                    return null;
                  const productNameIdx = headerIndex.nameIdx;
                  // 수취인명/이름 인덱스 찾기
                  const receiverIdx = tableData[0]?.findIndex(
                    (h: any) =>
                      h &&
                      typeof h === "string" &&
                      (h.includes("수취인명") || h.includes("이름"))
                  );

                  // 편집 모드가 아닐 때만 정렬, 편집 모드일 때는 원본 순서 유지
                  // 정렬 시 원본 인덱스를 함께 저장하여 고유 키 생성
                  const sorted = isEditMode
                    ? tableData
                        .slice(1)
                        .map((row, idx) => ({row, originalIdx: idx + 1}))
                    : tableData
                        .slice(1)
                        .map((row, idx) => ({row, originalIdx: idx + 1}))
                        .sort((a, b) => {
                          const prodA = a.row[productNameIdx] || "";
                          const prodB = b.row[productNameIdx] || "";
                          const prodCompare = String(prodA).localeCompare(
                            String(prodB),
                            "ko-KR"
                          );
                          if (prodCompare !== 0) return prodCompare;
                          // 상품명 동일하면 수취인명 or 이름 기준
                          if (receiverIdx !== -1) {
                            const recA = a.row[receiverIdx] || "";
                            const recB = b.row[receiverIdx] || "";
                            return String(recA).localeCompare(
                              String(recB),
                              "ko-KR"
                            );
                          }
                          return 0;
                        });
                  const headerRow = tableData[0];
                  const mappingIdx = headerRow.findIndex(
                    (h: any) => h === "매핑코드"
                  );
                  const typeIdx = headerRow.findIndex(
                    (h: any) => h === "내외주"
                  );
                  const postTypeIdx = headerRow.findIndex(
                    (h: any) => h === "택배사"
                  );
                  const vendorIdx = headerRow.findIndex(
                    (h: any) => h === "업체명" || h === "업체"
                  );
                  const qtyIdx = headerRow.findIndex((h: any) => h === "수량");
                  const receiverNameIdx = headerRow.findIndex(
                    (h: any) =>
                      h &&
                      typeof h === "string" &&
                      (h.includes("수취인명") || h === "이름")
                  );
                  const ordererNameIdx = headerRow.findIndex(
                    (h: any) =>
                      h &&
                      typeof h === "string" &&
                      (h === "주문자명" ||
                        h === "주문자" ||
                        h === "주문자 이름")
                  );
                  const addressIdx = headerRow.findIndex(
                    (h: any) => h && typeof h === "string" && h.includes("주소")
                  );
                  const duplicateReceiverSet = (() => {
                    const set = new Set<string>();
                    if (receiverNameIdx === -1) return set;
                    const counts: {[key: string]: number} = {};
                    tableData.slice(1).forEach((row) => {
                      const receiverValue = String(
                        row?.[receiverNameIdx] ?? ""
                      ).trim();
                      if (!receiverValue) return;
                      counts[receiverValue] = (counts[receiverValue] || 0) + 1;
                    });
                    Object.entries(counts).forEach(([key, count]) => {
                      if (count > 1) set.add(key);
                    });
                    return set;
                  })();
                  const duplicateAddressSet = (() => {
                    const set = new Set<string>();
                    if (addressIdx === -1) return set;
                    const counts: {[key: string]: number} = {};
                    tableData.slice(1).forEach((row) => {
                      const addressValue = String(
                        row?.[addressIdx] ?? ""
                      ).trim();
                      if (!addressValue) return;
                      counts[addressValue] = (counts[addressValue] || 0) + 1;
                    });
                    Object.entries(counts).forEach(([key, count]) => {
                      if (count > 1) set.add(key);
                    });
                    return set;
                  })();

                  return sorted.map((item, i) => {
                    const row = item.row;
                    const originalIdx = item.originalIdx;
                    let name = "";
                    if (typeof headerIndex?.nameIdx === "number") {
                      name = row[headerIndex.nameIdx] as string;
                    }
                    const receiverValue =
                      receiverNameIdx !== -1
                        ? String(row[receiverNameIdx] ?? "").trim()
                        : "";
                    const addressValue =
                      addressIdx !== -1
                        ? String(row[addressIdx] ?? "").trim()
                        : "";
                    const isReceiverDup =
                      receiverValue && duplicateReceiverSet.has(receiverValue);
                    const isAddressDup =
                      addressValue && duplicateAddressSet.has(addressValue);

                    // 매핑코드 값 가져오기 (우선순위: productIdMap으로 찾은 상품 > productCodeMap > 테이블 컬럼 > codes)
                    let mappingCode = "";
                    if (name) {
                      const trimmedName = String(name).trim();

                      // productIdMap을 사용해서 정확한 상품 찾기
                      const selectedProductId = productIdMap[trimmedName];
                      let matchedProduct = null;

                      if (selectedProductId !== undefined) {
                        // 사용자가 선택한 상품 ID가 있으면 그것으로 정확히 찾기
                        matchedProduct =
                          codes.find((c: any) => c.id === selectedProductId) ||
                          codesOriginRef.current.find(
                            (c: any) => c.id === selectedProductId
                          );
                      }

                      // 매핑코드 가져오기 (우선순위: productIdMap으로 찾은 상품 > productCodeMap > 테이블 컬럼 > codes)
                      if (matchedProduct?.code) {
                        mappingCode = matchedProduct.code;
                      } else {
                        mappingCode =
                          productCodeMap[trimmedName] ||
                          (mappingIdx !== -1 && row[mappingIdx]
                            ? String(row[mappingIdx])
                            : "") ||
                          codes.find(
                            (c: any) =>
                              c.name && String(c.name).trim() === trimmedName
                          )?.code ||
                          codesOriginRef.current.find(
                            (c) =>
                              c.name && String(c.name).trim() === trimmedName
                          )?.code ||
                          "";
                      }
                    }

                    // 실제 tableData에서의 행 인덱스 (원본 인덱스 사용)
                    const actualRowIndex = originalIdx;
                    // 선택된 행인지 확인
                    const isRowSelected = selectedRows.has(actualRowIndex);

                    return (
                      <tr
                        key={`row-${originalIdx}-${i}`}
                        className={isRowSelected ? "bg-blue-100" : ""}
                      >
                        {isEditMode && (
                          <td 
                            className="border px-2 py-1 border-gray-300 text-xs text-center cursor-pointer select-none"
                            onMouseDown={(e) => {
                              // 체크박스가 아닌 셀 영역에서만 드래그 시작
                              const target = e.target as HTMLElement;
                              if (target.tagName !== 'INPUT') {
                                handleDragStart(actualRowIndex, e);
                              }
                            }}
                            onMouseEnter={(e) => {
                              if (isDragging) {
                                handleDragOver(actualRowIndex, e);
                              }
                            }}
                            onMouseUp={handleDragEnd}
                            onMouseLeave={(e) => {
                              // 마우스가 셀을 벗어날 때도 드래그 처리
                              if (isDragging) {
                                handleDragOver(actualRowIndex, e);
                              }
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedRows.has(actualRowIndex)}
                              onChange={(e) => {
                                e.stopPropagation();
                                // 드래그 중이 아닐 때만 처리
                                if (!isDragging) {
                                  handleRowSelect(actualRowIndex);
                                }
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                // 드래그 중이 아닐 때만 처리
                                if (!isDragging) {
                                  handleRowSelect(actualRowIndex);
                                }
                              }}
                              className="cursor-pointer"
                            />
                          </td>
                        )}
                        {tableData[0].map((_, j) => {
                          // 택배사 칼럼은 숨기기
                          if (j === postTypeIdx) {
                            return null;
                          }

                          // 클라이언트 맵에 저장된 값이 있으면 우선 사용
                          let cellValue = row[j];
                          if (name) {
                            const trimmedName = String(name).trim();
                            if (j === typeIdx && productTypeMap[trimmedName]) {
                              cellValue = productTypeMap[trimmedName];
                            } else if (
                              j === postTypeIdx &&
                              productPostTypeMap[trimmedName]
                            ) {
                              cellValue = productPostTypeMap[trimmedName];
                            }
                          }

                          // 편집 모드이고 상품명, 수량, 수취인명, 주문자명 컬럼인 경우 input으로 표시
                          const isEditableColumn =
                            j === productNameIdx ||
                            j === qtyIdx ||
                            j === receiverNameIdx ||
                            j === ordererNameIdx;
                          const isDuplicateCell =
                            (isReceiverDup && j === receiverNameIdx) ||
                            (isAddressDup && j === addressIdx);

                          // 컬럼별 너비 설정
                          let minWidth = "60px";
                          if (j === productNameIdx) {
                            minWidth = isEditMode ? "360px" : "300px"; // 상품명은 넓게 (편집 모드일 때 60px 더 넓게)
                          } else if (j === qtyIdx) {
                            minWidth = "40px"; // 수량은 좁게
                          } else if (j === receiverNameIdx) {
                            minWidth = "70px"; // 수취인명은 좁게
                          } else if (j === addressIdx) {
                            minWidth = isEditMode ? "190px" : "250px"; // 주소는 넓게 (편집 모드일 때 60px 더 좁게)
                          }

                          const tdClass = `border px-2 py-1 border-gray-300 text-xs${
                            isDuplicateCell ? " bg-red-100" : ""
                          }`;

                          return (
                            <td key={j} className={tdClass} style={{minWidth}}>
                              {isEditMode && isEditableColumn ? (
                                // 편집 모드에서 상품명 컬럼인 경우 input과 사방넷명 함께 표시
                                j === productNameIdx ? (
                                  <div className="flex flex-col gap-1">
                                    <input
                                      type="text"
                                      value={
                                        cellValue !== undefined &&
                                        cellValue !== null
                                          ? cellValue
                                          : ""
                                      }
                                      onChange={(e) => {
                                        handleCellChange(
                                          originalIdx,
                                          j,
                                          e.target.value
                                        );
                                      }}
                                      className="w-full px-1 py-0.5 border border-gray-300 rounded text-xs"
                                    />
                                    {(() => {
                                      // 상품 찾기 (사용자가 선택한 상품 우선, 없으면 상품명으로만 자동 매칭)
                                      const productName =
                                        String(cellValue).trim();

                                      let product = null;
                                      const selectedProductId =
                                        productIdMap[productName];
                                      if (selectedProductId !== undefined) {
                                        // 사용자가 선택한 상품 ID가 있으면 그것으로 정확히 찾기 (무조건 사용자가 선택한 상품만 사용)
                                        // codes와 codesOriginRef.current 모두 확인
                                        product =
                                          codes.find(
                                            (c: any) =>
                                              c.id === selectedProductId
                                          ) ||
                                          codesOriginRef.current.find(
                                            (c: any) =>
                                              c.id === selectedProductId
                                          );
                                      } else if (productName) {
                                        // 사용자가 선택하지 않은 경우에만 상품명이 정확히 일치할 때만 자동 매칭
                                        // codes와 codesOriginRef.current 모두 확인
                                        product =
                                          codes.find(
                                            (c: any) => c.name === productName
                                          ) ||
                                          codesOriginRef.current.find(
                                            (c: any) => c.name === productName
                                          );
                                      }
                                      // 매핑코드로 자동 매칭하는 것은 하지 않음 (사용자가 선택한 상품만 사용)

                                      // sabangName이 있으면 표시
                                      if (
                                        product?.sabangName &&
                                        String(product.sabangName).trim() !== ""
                                      ) {
                                        return (
                                          <div className="text-blue-600 text-xs px-1">
                                            {product.sabangName}
                                          </div>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </div>
                                ) : (
                                  <input
                                    type="text"
                                    value={
                                      cellValue !== undefined &&
                                      cellValue !== null
                                        ? cellValue
                                        : ""
                                    }
                                    onChange={(e) => {
                                      const actualRowIndex =
                                        tableData.indexOf(row);
                                      handleCellChange(
                                        actualRowIndex,
                                        j,
                                        e.target.value
                                      );
                                    }}
                                    className="w-full px-1 py-0.5 border border-gray-300 rounded text-xs"
                                  />
                                )
                              ) : cellValue !== undefined &&
                                cellValue !== null ? (
                                // 상품명 컬럼인 경우 원본 상품명과 사방넷명을 줄바꿈하여 표시
                                j === productNameIdx ? (
                                  <div className="flex flex-col gap-1">
                                    <div>
                                      {(() => {
                                        const productNameStr = String(
                                          cellValue || ""
                                        );
                                        // "|n세트" 패턴 찾기
                                        const setMatch =
                                          productNameStr.match(
                                            /^(.+)\|(\d+)세트$/
                                          );
                                        if (setMatch) {
                                          const [, baseName, setCount] =
                                            setMatch;
                                          return (
                                            <>
                                              {baseName}
                                              <span className="font-bold text-red-600">
                                                |{setCount}세트
                                              </span>
                                            </>
                                          );
                                        }
                                        return productNameStr;
                                      })()}
                                    </div>
                                    {(() => {
                                      // 상품 찾기 (사용자가 선택한 상품 우선, 없으면 상품명으로만 자동 매칭)
                                      const productName =
                                        String(cellValue).trim();

                                      let product = null;
                                      const selectedProductId =
                                        productIdMap[productName];
                                      if (selectedProductId !== undefined) {
                                        // 사용자가 선택한 상품 ID가 있으면 그것으로 정확히 찾기 (무조건 사용자가 선택한 상품만 사용)
                                        // codes와 codesOriginRef.current 모두 확인
                                        product =
                                          codes.find(
                                            (c: any) =>
                                              c.id === selectedProductId
                                          ) ||
                                          codesOriginRef.current.find(
                                            (c: any) =>
                                              c.id === selectedProductId
                                          );
                                      } else if (productName) {
                                        // 사용자가 선택하지 않은 경우에만 상품명이 정확히 일치할 때만 자동 매칭
                                        // codes와 codesOriginRef.current 모두 확인
                                        product =
                                          codes.find(
                                            (c: any) => c.name === productName
                                          ) ||
                                          codesOriginRef.current.find(
                                            (c: any) => c.name === productName
                                          );
                                      }
                                      // 매핑코드로 자동 매칭하는 것은 하지 않음 (사용자가 선택한 상품만 사용)

                                      // sabangName이 있으면 표시
                                      if (
                                        product?.sabangName &&
                                        String(product.sabangName).trim() !== ""
                                      ) {
                                        return (
                                          <div className="text-blue-600 text-xs">
                                            {product.sabangName}
                                          </div>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </div>
                                ) : j === vendorIdx ? (
                                  // 업체명 컬럼인 경우 업체명과 매입처명을 줄바꿈하여 표시
                                  <div className="flex flex-col gap-1">
                                    <div>{cellValue}</div>
                                    {(() => {
                                      // 상품 찾기 (사용자가 선택한 상품 우선, 없으면 상품명으로만 자동 매칭)
                                      const productName = name
                                        ? String(name).trim()
                                        : "";

                                      let product = null;
                                      const selectedProductId =
                                        productIdMap[productName];
                                      if (selectedProductId !== undefined) {
                                        // 사용자가 선택한 상품 ID가 있으면 그것으로 정확히 찾기 (무조건 사용자가 선택한 상품만 사용)
                                        // codes와 codesOriginRef.current 모두 확인
                                        product =
                                          codes.find(
                                            (c: any) =>
                                              c.id === selectedProductId
                                          ) ||
                                          codesOriginRef.current.find(
                                            (c: any) =>
                                              c.id === selectedProductId
                                          );
                                      } else if (productName) {
                                        // 사용자가 선택하지 않은 경우에만 상품명이 정확히 일치할 때만 자동 매칭
                                        // codes와 codesOriginRef.current 모두 확인
                                        product =
                                          codes.find(
                                            (c: any) => c.name === productName
                                          ) ||
                                          codesOriginRef.current.find(
                                            (c: any) => c.name === productName
                                          );
                                      }
                                      // 매핑코드로 자동 매칭하는 것은 하지 않음 (사용자가 선택한 상품만 사용)

                                      // purchase(매입처명)이 있으면 표시
                                      if (
                                        product?.purchase &&
                                        String(product.purchase).trim() !== ""
                                      ) {
                                        return (
                                          <div className="text-blue-600 text-xs">
                                            {product.purchase}
                                          </div>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </div>
                                ) : j === typeIdx ? (
                                  // 내외주 컬럼인 경우 내외주와 택배사를 줄바꿈하여 표시
                                  <div className="flex flex-col gap-1">
                                    <div>{cellValue}</div>
                                    {(() => {
                                      // 현재 row의 택배사 값 가져오기
                                      const currentPostType =
                                        postTypeIdx !== -1 && row[postTypeIdx]
                                          ? String(row[postTypeIdx]).trim()
                                          : "";

                                      // 매핑코드로 상품 찾기
                                      const productName = name
                                        ? String(name).trim()
                                        : "";
                                      const mappingCode = productName
                                        ? productCodeMap[productName] ||
                                          (mappingIdx !== -1 && row[mappingIdx]
                                            ? String(row[mappingIdx])
                                            : "") ||
                                          codes.find(
                                            (c: any) => c.name === productName
                                          )?.code ||
                                          codesOriginRef.current.find(
                                            (c) => c.name === productName
                                          )?.code ||
                                          ""
                                        : "";

                                      let product = null;
                                      const selectedProductId =
                                        productIdMap[productName];
                                      if (selectedProductId !== undefined) {
                                        // 사용자가 선택한 상품 ID가 있으면 그것으로 정확히 찾기 (무조건 사용자가 선택한 상품만 사용)
                                        // codes와 codesOriginRef.current 모두 확인
                                        product =
                                          codes.find(
                                            (c: any) =>
                                              c.id === selectedProductId
                                          ) ||
                                          codesOriginRef.current.find(
                                            (c: any) =>
                                              c.id === selectedProductId
                                          );
                                      } else if (productName) {
                                        // 사용자가 선택하지 않은 경우에만 상품명이 정확히 일치할 때만 자동 매칭
                                        // codes와 codesOriginRef.current 모두 확인
                                        product =
                                          codes.find(
                                            (c: any) => c.name === productName
                                          ) ||
                                          codesOriginRef.current.find(
                                            (c: any) => c.name === productName
                                          );
                                      }
                                      // 매핑코드로 자동 매칭하는 것은 하지 않음 (사용자가 선택한 상품만 사용)

                                      // 택배사 표시: 매핑된 상품의 택배사 우선, 없으면 현재 row의 택배사 값
                                      const postTypeToShow =
                                        product?.postType &&
                                        String(product.postType).trim() !== ""
                                          ? product.postType
                                          : currentPostType;

                                      if (postTypeToShow) {
                                        return (
                                          <div className="text-blue-600 text-xs">
                                            {postTypeToShow}
                                          </div>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </div>
                                ) : (
                                  cellValue
                                )
                              ) : (
                                ""
                              )}
                            </td>
                          );
                        })}
                        <td className="border px-2 py-1 border-gray-300 text-xs text-center">
                          {name ? (
                            <div className="flex items-center justify-center gap-1">
                              {mappingCode && (
                                <span
                                  className="text-blue-600 underline cursor-pointer hover:text-blue-800"
                                  onClick={() =>
                                    handleMappingCodeClick(mappingCode, name)
                                  }
                                >
                                  {mappingCode}
                                </span>
                              )}
                              {/* 편집모드일 때는 항상 버튼 표시, 아닐 때는 매핑코드 없을 때만 표시 */}
                              {(isEditMode || !mappingCode) && (
                                <>
                                  <button
                                    className="w-[40px] p-1 rounded-sm text-[12px] hover:bg-blue-300 border border-[#9a9a9a85] bg-blue-400"
                                    type="button"
                                    onClick={() =>
                                      handleRecommendClick(i, name)
                                    }
                                    disabled={!name}
                                  >
                                    <span
                                      role="img"
                                      aria-label="추천"
                                      className="text-[#ffffff] font-bold"
                                    >
                                      추천
                                    </span>
                                  </button>
                                  <button
                                    className="w-[40px] p-1 rounded-sm text-[12px] hover:bg-[#eaeaea44] border border-[#9a9a9a85] bg-[#eaeaea]"
                                    type="button"
                                    onClick={() => {
                                      setCodeEditWindow({
                                        open: true,
                                        rowIdx: i,
                                        productName: name,
                                      });
                                    }}
                                    disabled={!name}
                                  >
                                    <span
                                      role="img"
                                      aria-label="검색"
                                      className="text-[#333] font-bold"
                                    >
                                      검색
                                    </span>
                                  </button>
                                </>
                              )}
                              {recommendIdx === i && (
                                <RecommendModal
                                  open={recommendIdx === i}
                                  recommendList={recommendList}
                                  name={name}
                                  rowIdx={i}
                                  onSelect={(
                                    selectedName,
                                    selectedCode,
                                    selectedItem,
                                    selectedId
                                  ) => {
                                    console.log(selectedId);

                                    // 원래 상품명 사용 (name prop에서 전달받은 값)
                                    const originalProductName =
                                      String(name).trim();

                                    // 먼저 productCodeMap 업데이트 (원래 상품명으로 매핑코드 저장)
                                    const updatedProductCodeMap = {
                                      ...productCodeMap,
                                      [originalProductName]: selectedCode,
                                    };
                                    setProductCodeMap(updatedProductCodeMap);

                                    // productIdMap 업데이트 (선택한 상품 ID 저장)
                                    if (
                                      selectedId !== undefined &&
                                      selectedId !== null
                                    ) {
                                      const updatedProductIdMap = {
                                        ...productIdMap,
                                        [originalProductName]: selectedId,
                                      };
                                      setProductIdMap(updatedProductIdMap);
                                    }

                                    // 선택한 항목의 데이터 사용 (없으면 codes에서 찾기, codesOriginRef도 확인)
                                    const itemData =
                                      selectedItem ||
                                      codes.find(
                                        (c: any) =>
                                          c.name === selectedName &&
                                          c.code === selectedCode
                                      ) ||
                                      codesOriginRef.current.find(
                                        (c: any) =>
                                          c.name === selectedName &&
                                          c.code === selectedCode
                                      ) ||
                                      (selectedId !== undefined &&
                                      selectedId !== null
                                        ? codes.find(
                                            (c: any) => c.id === selectedId
                                          ) ||
                                          codesOriginRef.current.find(
                                            (c: any) => c.id === selectedId
                                          )
                                        : null);

                                    // 선택한 상품이 codes에 없으면 추가 (실시간 업데이트를 위해)
                                    if (
                                      itemData &&
                                      !codes.find(
                                        (c: any) => c.id === itemData.id
                                      )
                                    ) {
                                      const updatedCodes = [...codes, itemData];
                                      setCodes(updatedCodes);
                                      // codesOriginRef도 즉시 업데이트하여 테이블 렌더링 시 반영되도록 함
                                      codesOriginRef.current = updatedCodes;
                                    } else if (itemData) {
                                      // codes에 이미 있더라도 codesOriginRef에 확실히 포함되도록 함
                                      if (
                                        !codesOriginRef.current.find(
                                          (c: any) => c.id === itemData.id
                                        )
                                      ) {
                                        codesOriginRef.current = [
                                          ...codesOriginRef.current,
                                          itemData,
                                        ];
                                      }
                                    }

                                    // 클라이언트 맵에 저장 (useAutoMapping이 덮어쓰지 않도록)
                                    if (itemData?.type) {
                                      setProductTypeMap((prev) => ({
                                        ...prev,
                                        [originalProductName]: itemData.type,
                                      }));
                                    }

                                    if (itemData?.postType) {
                                      setProductPostTypeMap((prev) => ({
                                        ...prev,
                                        [originalProductName]:
                                          itemData.postType,
                                      }));
                                    }

                                    // 매핑코드, 내외주, 택배사 실시간 업데이트
                                    const headerRow = tableData[0];
                                    const mappingIdx = headerRow.findIndex(
                                      (h: any) => h === "매핑코드"
                                    );
                                    const typeIdx = headerRow.findIndex(
                                      (h: any) => h === "내외주"
                                    );
                                    const postTypeIdx = headerRow.findIndex(
                                      (h: any) => h === "택배사"
                                    );

                                    if (
                                      mappingIdx !== -1 ||
                                      typeIdx !== -1 ||
                                      postTypeIdx !== -1
                                    ) {
                                      // rowIdx를 사용하여 해당 행을 직접 업데이트하고,
                                      // 같은 상품명을 가진 다른 행들도 함께 업데이트
                                      // sorted는 tableData.slice(1)에서 생성되므로, tableData에서의 실제 인덱스는 i + 1
                                      const targetRowIndex = i + 1;

                                      const updatedTable = tableData.map(
                                        (row, idx) => {
                                          if (idx === 0) return row;
                                          const rowName =
                                            row[headerIndex.nameIdx!];
                                          const trimmedRowName =
                                            String(rowName).trim();

                                          // rowIdx에 해당하는 행이거나 같은 상품명을 가진 모든 행 업데이트
                                          if (
                                            idx === targetRowIndex ||
                                            (rowName &&
                                              trimmedRowName ===
                                                originalProductName)
                                          ) {
                                            const newRow = [...row];
                                            if (
                                              mappingIdx !== -1 &&
                                              selectedCode
                                            ) {
                                              newRow[mappingIdx] = selectedCode;
                                            }
                                            if (
                                              typeIdx !== -1 &&
                                              itemData?.type
                                            ) {
                                              newRow[typeIdx] = itemData.type;
                                            }
                                            if (
                                              postTypeIdx !== -1 &&
                                              itemData?.postType
                                            ) {
                                              newRow[postTypeIdx] =
                                                itemData.postType;
                                            }
                                            return newRow;
                                          }
                                          return row;
                                        }
                                      );
                                      setTableData(updatedTable);

                                      // 파일 데이터도 업데이트
                                      if (fileId) {
                                        const updatedFile = {
                                          ...file,
                                          tableData: updatedTable,
                                          productCodeMap: updatedProductCodeMap,
                                          productIdMap:
                                            selectedId !== undefined &&
                                            selectedId !== null
                                              ? {
                                                  ...productIdMap,
                                                  [originalProductName]:
                                                    selectedId,
                                                }
                                              : file.productIdMap ||
                                                productIdMap,
                                        };
                                        setFile(updatedFile);
                                        sessionStorage.setItem(
                                          `uploadedFile_${fileId}`,
                                          JSON.stringify(updatedFile)
                                        );
                                        const updatedFiles = uploadedFiles.map(
                                          (f) =>
                                            f.id === fileId ? updatedFile : f
                                        );
                                        setUploadedFiles(updatedFiles);
                                      }

                                      // 테이블 강제 리렌더링을 위해 약간의 지연 후 다시 설정
                                      setTimeout(() => {
                                        setTableData((prev) => [...prev]);
                                      }, 0);
                                    }

                                    // 모달 닫기
                                    setRecommendIdx(null);
                                    handleSelectSuggest(
                                      originalProductName,
                                      selectedCode,
                                      selectedId
                                    );
                                  }}
                                  onClose={() => setRecommendIdx(null)}
                                  onDelete={async (item) => {
                                    if (!item.id) return;

                                    try {
                                      // 상품 삭제 API 호출
                                      const response = await fetch(
                                        `/api/products/delete?id=${item.id}`,
                                        {
                                          method: "DELETE",
                                        }
                                      );

                                      const result = await response.json();

                                      if (result.success) {
                                        // codes 상태에서 삭제된 상품 제거
                                        const updatedCodes = codes.filter(
                                          (code: any) => code.id !== item.id
                                        );
                                        setCodes(updatedCodes);
                                        // productCodeMap에서도 제거 (상품명이 같은 경우)
                                        const updatedProductCodeMap = {
                                          ...productCodeMap,
                                        };
                                        delete updatedProductCodeMap[item.name];
                                        setProductCodeMap(
                                          updatedProductCodeMap
                                        );
                                        alert("상품이 삭제되었습니다.");
                                        setRecommendIdx(null); // 모달 닫기
                                      } else {
                                        alert(
                                          `상품 삭제 실패: ${result.error}`
                                        );
                                      }
                                    } catch (error) {
                                      console.error("상품 삭제 실패:", error);
                                      alert(
                                        "상품 삭제 중 오류가 발생했습니다."
                                      );
                                    }
                                  }}
                                />
                              )}
                            </div>
                          ) : (
                            ""
                          )}
                        </td>
                        {isEditMode && (
                          <td className="border px-2 py-1 border-gray-300 text-xs text-center">
                            <button
                              onClick={() => {
                                handleDuplicateRow(originalIdx);
                              }}
                              className="px-2 py-1 bg-[#04a670] hover:bg-[#04a670]/60 text-white rounded text-xs font-bold"
                              type="button"
                            >
                              복제
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </>
      )}
      <DirectInputModal
        open={directInputModal.open}
        fields={directInputModal.fields}
        values={directInputModal.values}
        fieldNameMap={fieldNameMap}
        onClose={() => {
          setIsNewProductModal(false);
          closeDirectInputModal();
        }}
        nameReadOnly={!isNewProductModal}
        onSave={async () => {
          const savedProductName = directInputModal.values.name; // 저장된 상품명 기억
          await saveDirectInputModal();

          // 상품 저장 후 최신 codes를 다시 불러오기
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

            const response = await fetch("/api/products/list", {headers});
            const result = await response.json();
            if (result.success) {
              const newCodes = result.data || [];
              setCodes(newCodes);
              // codesOriginRef도 업데이트
              codesOriginRef.current = newCodes;

              // 새로 불러온 codes에서 상품 찾기
              const newProduct = newCodes.find(
                (c: any) => c.name === savedProductName
              );
              if (newProduct && newProduct.type && newProduct.postType) {
                // 상품명이 일치하는 행들의 내외주, 택배사 실시간 업데이트
                const headerRow = tableData[0];
                const nameIdx = headerIndex?.nameIdx;
                const typeIdx = headerRow.findIndex((h: any) => h === "내외주");
                const postTypeIdx = headerRow.findIndex(
                  (h: any) => h === "택배사"
                );
                const mappingIdx = headerRow.findIndex(
                  (h: any) => h === "매핑코드"
                );

                if (
                  nameIdx !== undefined &&
                  nameIdx !== -1 &&
                  (typeIdx !== -1 || postTypeIdx !== -1 || mappingIdx !== -1)
                ) {
                  const updatedTable = tableData.map((row, idx) => {
                    if (idx === 0) return row;
                    const rowName = row[nameIdx];
                    if (
                      rowName &&
                      String(rowName).trim() === savedProductName.trim()
                    ) {
                      const newRow = [...row];
                      if (mappingIdx !== -1 && newProduct.code) {
                        newRow[mappingIdx] = newProduct.code;
                      }
                      if (typeIdx !== -1 && newProduct.type) {
                        newRow[typeIdx] = newProduct.type;
                      }
                      if (postTypeIdx !== -1 && newProduct.postType) {
                        newRow[postTypeIdx] = newProduct.postType;
                      }
                      return newRow;
                    }
                    return row;
                  });

                  setTableData(updatedTable);

                  // productCodeMap에도 업데이트
                  const updatedProductCodeMap = {
                    ...productCodeMap,
                    [savedProductName]: newProduct.code || "",
                  };
                  setProductCodeMap(updatedProductCodeMap);

                  // 파일 데이터도 업데이트
                  if (fileId) {
                    const updatedFile = {
                      ...file,
                      tableData: updatedTable,
                      productCodeMap: updatedProductCodeMap,
                    };
                    setFile(updatedFile);
                    sessionStorage.setItem(
                      `uploadedFile_${fileId}`,
                      JSON.stringify(updatedFile)
                    );
                    const updatedFiles = uploadedFiles.map((f) =>
                      f.id === fileId ? updatedFile : f
                    );
                    setUploadedFiles(updatedFiles);
                  }
                }
              }
            }
          } catch (error) {
            console.error("상품 목록 조회 실패:", error);
          }
          // 저장 후 신규 생성 모달 플래그 리셋
          setIsNewProductModal(false);
        }}
        onValueChange={setDirectInputValue}
      />
      {codeEditWindow &&
        codeEditWindow.open &&
        (() => {
          // 현재 매핑코드 찾기
          const currentMappingCode = (() => {
            if (!headerIndex || typeof headerIndex.nameIdx !== "number")
              return "";

            const trimmedProductName = String(
              codeEditWindow.productName
            ).trim();
            const headerRow = tableData[0];
            const mappingIdx = headerRow.findIndex(
              (h: any) => h === "매핑코드"
            );

            // 1순위: productCodeMap에서 찾기 (trim된 상품명으로)
            if (productCodeMap[trimmedProductName]) {
              return productCodeMap[trimmedProductName];
            }

            // 2순위: tableData에서 같은 상품명을 가진 첫 번째 행 찾기
            if (mappingIdx !== -1) {
              for (let idx = 1; idx < tableData.length; idx++) {
                const row = tableData[idx];
                const rowName = row[headerIndex.nameIdx];
                if (rowName && String(rowName).trim() === trimmedProductName) {
                  if (row[mappingIdx]) {
                    return String(row[mappingIdx]);
                  }
                  break;
                }
              }
            }

            // 3순위: codes에서 name으로 찾기 (자동 매칭)
            const autoMatched = codes.find(
              (c: any) => c.name && String(c.name).trim() === trimmedProductName
            );
            return autoMatched?.code || "";
          })();

          return (
            <CodeEditWindow
              rowId={0} // upload/view에서는 실제 DB rowId가 없으므로 0 사용
              currentRowData={{
                매핑코드: currentMappingCode,
                상품명: codeEditWindow.productName,
              }}
              skipApiCall={true} // API 호출 건너뛰기
              onCodeUpdate={(rowId, code, codeItem) => {
                // CodeEditWindow에서 선택한 코드를 적용
                // 사용자가 선택한 상품(codeItem)이 필수로 전달되어야 함
                // codeItem이 없으면 같은 매핑코드를 가진 다른 상품이 선택될 수 있으므로 에러 처리
                if (!codeItem) {
                  console.error(
                    "선택한 상품 정보가 전달되지 않았습니다:",
                    code
                  );
                  alert(
                    "상품 선택 정보를 찾을 수 없습니다. 다시 시도해주세요."
                  );
                  return;
                }
                const selectedItem = codeItem;

                const selectedName = selectedItem.name;
                const selectedCode = code;
                const originalProductName = String(
                  codeEditWindow.productName
                ).trim();

                // 디버깅: codeItem과 selectedItem 확인
                // console.log("CodeEditWindow 업데이트:", {
                //   codeItem,
                //   selectedItem,
                //   type: selectedItem?.type,
                //   postType: selectedItem?.postType,
                //   code,
                //   originalProductName,
                // });

                // productCodeMap 업데이트 (원래 상품명으로 매핑코드 저장)
                const updatedProductCodeMap = {
                  ...productCodeMap,
                  [originalProductName]: selectedCode, // 원래 상품명으로 매핑코드 저장
                };
                setProductCodeMap(updatedProductCodeMap);

                // 사용자가 선택한 상품의 ID 저장 (같은 매핑코드를 가진 다른 상품과 구분하기 위함)
                // 업데이트된 productIdMap을 직접 사용하기 위해 변수에 저장
                let updatedProductIdMap = {...productIdMap};
                if (codeItem?.id !== undefined && codeItem?.id !== null) {
                  updatedProductIdMap = {
                    ...productIdMap,
                    [originalProductName]: codeItem.id,
                  };
                  setProductIdMap(updatedProductIdMap);

                  // 선택한 상품이 codes에 없으면 추가 (실시간 업데이트를 위해)
                  if (
                    codeItem &&
                    !codes.find((c: any) => c.id === codeItem.id)
                  ) {
                    const updatedCodes = [...codes, codeItem];
                    setCodes(updatedCodes);
                    // codesOriginRef도 즉시 업데이트하여 테이블 렌더링 시 반영되도록 함
                    codesOriginRef.current = updatedCodes;
                  } else if (codeItem) {
                    // codes에 이미 있더라도 codesOriginRef에 확실히 포함되도록 함
                    if (
                      !codesOriginRef.current.find(
                        (c: any) => c.id === codeItem.id
                      )
                    ) {
                      codesOriginRef.current = [
                        ...codesOriginRef.current,
                        codeItem,
                      ];
                    }
                  }
                }

                // 매핑코드, 내외주, 택배사 실시간 업데이트
                const headerRow = tableData[0];
                const mappingIdx = headerRow.findIndex(
                  (h: any) => h === "매핑코드"
                );
                const typeIdx = headerRow.findIndex((h: any) => h === "내외주");
                const postTypeIdx = headerRow.findIndex(
                  (h: any) => h === "택배사"
                );

                if (mappingIdx !== -1 || typeIdx !== -1 || postTypeIdx !== -1) {
                  // codeItem에서 직접 type과 postType 가져오기 (우선순위: codeItem > selectedItem)
                  const typeValue =
                    codeItem?.type ?? selectedItem?.type ?? null;
                  const postTypeValue =
                    codeItem?.postType ?? selectedItem?.postType ?? null;

                  // 클라이언트 맵에 저장 (useAutoMapping이 덮어쓰지 않도록)
                  if (typeValue) {
                    setProductTypeMap((prev) => ({
                      ...prev,
                      [originalProductName]: typeValue,
                    }));
                  }
                  if (postTypeValue) {
                    setProductPostTypeMap((prev) => ({
                      ...prev,
                      [originalProductName]: postTypeValue,
                    }));
                  }

                  const updatedTable = tableData.map((row, idx) => {
                    if (idx === 0) return row;
                    const rowName = row[headerIndex?.nameIdx || 0];
                    // 원래 상품명을 가진 모든 행 업데이트
                    const trimmedRowName = String(rowName).trim();
                    if (trimmedRowName === originalProductName) {
                      const newRow = [...row];
                      if (mappingIdx !== -1 && selectedCode) {
                        newRow[mappingIdx] = selectedCode;
                      }
                      // type과 postType 업데이트 (값이 null이 아니면 업데이트)
                      if (
                        typeIdx !== -1 &&
                        typeValue !== null &&
                        typeValue !== undefined
                      ) {
                        newRow[typeIdx] = typeValue;
                      }
                      if (
                        postTypeIdx !== -1 &&
                        postTypeValue !== null &&
                        postTypeValue !== undefined
                      ) {
                        newRow[postTypeIdx] = postTypeValue;
                      }
                      return newRow;
                    }
                    return row;
                  });

                  setTableData(updatedTable);

                  // 파일 데이터도 업데이트 (업데이트된 productIdMap 사용)
                  if (fileId) {
                    const updatedFile = {
                      ...file,
                      tableData: updatedTable,
                      productCodeMap: updatedProductCodeMap,
                      productIdMap: updatedProductIdMap, // 업데이트된 productIdMap 사용
                    };
                    setFile(updatedFile);
                    sessionStorage.setItem(
                      `uploadedFile_${fileId}`,
                      JSON.stringify(updatedFile)
                    );
                    const updatedFiles = uploadedFiles.map((f) =>
                      f.id === fileId ? updatedFile : f
                    );
                    setUploadedFiles(updatedFiles);
                  }

                  // 테이블 강제 리렌더링을 위해 약간의 지연 후 다시 설정
                  setTimeout(() => {
                    setTableData((prev) => [...prev]);
                  }, 0);
                } else {
                  console.warn("헤더 인덱스를 찾을 수 없습니다:", {
                    mappingIdx,
                    typeIdx,
                    postTypeIdx,
                  });
                }

                setCodeEditWindow(null);
              }}
              onClose={() => setCodeEditWindow(null)}
            />
          );
        })()}
      {/* 확인/취소 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-300 p-4 flex justify-end gap-4 shadow-lg">
        {!isAllMappingCodesFilled && (
          <div className="text-xs text-gray-500 mr-auto">
            *매핑코드 전부 입력 시 확인 가능
          </div>
        )}
        <button
          onClick={handleCancel}
          className="bg-[#fc5656] hover:bg-[#fc5656a0] px-[32px] py-[10px] rounded-md transition-colors text-white font-semibold"
        >
          취소
        </button>
        <button
          onClick={handleConfirm}
          disabled={!isAllMappingCodesFilled}
          className={`px-[32px] py-[10px] rounded-md transition-colors text-white font-semibold ${
            isAllMappingCodesFilled
              ? "bg-[#1ca2fb] hover:bg-[#1ca2fba0]"
              : "bg-gray-400 cursor-not-allowed"
          }`}
        >
          확인
        </button>
      </div>

      {/* 상품 수정 모달 */}
      <DirectInputModal
        open={productEditModal.open}
        fields={productEditModal.fields}
        values={productEditModal.values}
        fieldNameMap={fieldNameMap}
        onClose={handleCloseProductEditModal}
        onSave={handleSaveProductEdit}
        onValueChange={handleProductEditValueChange}
        nameReadOnly={true}
      />
    </div>
  );
}

export default function FileViewPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full h-screen flex items-center justify-center">
          <div>로딩 중...</div>
        </div>
      }
    >
      <FileViewContent />
    </Suspense>
  );
}
