"use client";

import {useEffect, useState, useRef, useMemo, Suspense} from "react";
import {useSearchParams} from "next/navigation";
import {useUploadStore} from "@/stores/uploadStore";
import RecommendModal from "@/components/RecommendModal";
import DirectInputModal from "@/components/DirectInputModal";
import CodeEditWindow from "@/components/CodeEditWindow";
import {fieldNameMap} from "@/constants/fieldMappings";
import {useAutoMapping} from "@/hooks/useAutoMapping";

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

  const [file, setFile] = useState<any>(null);
  const [tableData, setTableData] = useState<any[][]>([]);
  const [fileName, setFileName] = useState("");
  const [vendorName, setVendorName] = useState("");
  const codesOriginRef = useRef<any[]>([]);
  // 원본 배송메시지 저장 (rowIdx -> 원본 메시지, 파일 로드 시점의 메시지)
  const originalMessagesRef = useRef<{[rowIdx: number]: string}>({});
  // 순수 원본 배송메시지 저장 (rowIdx -> 순수 원본 메시지, 업체명 제거된 메시지)
  const pureOriginalMessagesRef = useRef<{[rowIdx: number]: string}>({});
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
  // Edit 모드 상태
  const [isEditMode, setIsEditMode] = useState(false);

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

  // 편집 토글 시 정렬 적용 (편집 종료 시)
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
      // 편집 진입 시 한 번 정렬
      const sortedData = sortTableData(tableData);
      applySortedData(sortedData);
    } else if (isEditMode && !next) {
      // 편집 종료 시 다시 정렬
      const sortedData = sortTableData(tableData);
      applySortedData(sortedData);
    }
    setIsEditMode(next);
  };

  // 행 복제 함수
  const handleDuplicateRow = (rowIndex: number) => {
    if (rowIndex < 1) return; // 헤더는 복제 불가

    const newTableData = [...tableData];
    const rowToDuplicate = [...newTableData[rowIndex]];

    // 복제된 행을 원본 행 바로 아래에 삽입
    newTableData.splice(rowIndex + 1, 0, rowToDuplicate);

    setTableData(newTableData);

    // 파일 데이터도 업데이트
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
    newTableData[rowIndex][colIndex] = value;

    // 상품명 컬럼이 변경된 경우 매핑코드, 내외주, 택배사도 자동 업데이트
    if (headerIndex && colIndex === headerIndex.nameIdx) {
      const trimmedValue = value.trim();

      // codes에서 매칭되는 상품 찾기
      const matchedProduct = codes.find((c: any) => c.name === trimmedValue);

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

    // 파일 데이터도 업데이트
    if (fileId) {
      const updatedFile = {
        ...file,
        tableData: newTableData,
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

  // 업체명 변경시 배송메시지 실시간 업데이트를 위한 함수
  const updateVendorAndMessage = (newVendorName: string) => {
    const headerRow = tableData[0];
    const vendorIdx = headerRow.findIndex(
      (h: any) => h && typeof h === "string" && h === "업체명"
    );
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

    if (vendorIdx === -1) return;

    const vendorStr = newVendorName.trim();
    // 5글자 이상이면 2글자, 4글자 이하면 전체 글자수
    const vendorPrefix =
      vendorStr.length >= 5 ? vendorStr.substring(0, 2) : vendorStr;

    const updatedTable = tableData.map((row, idx) => {
      if (idx === 0) return row;
      const newRow = [...row];
      newRow[vendorIdx] = vendorStr;

      // 배송메시지 업데이트
      if (messageIdx !== -1) {
        // 순수 원본 메시지 가져오기 (한 번만 추출하고 절대 변경하지 않음)
        let pureOriginalMessage = pureOriginalMessagesRef.current[idx];

        if (pureOriginalMessage === undefined) {
          // 순수 원본이 저장되지 않았으면 원본 메시지를 그대로 저장
          const originalMessage = originalMessagesRef.current[idx];

          if (originalMessage === undefined) {
            // 원본도 없으면 현재 메시지를 그대로 저장
            const currentMessage = row[messageIdx];
            const currentMessageStr =
              currentMessage !== null && currentMessage !== undefined
                ? String(currentMessage).trim()
                : "";

            // 기존 메시지를 그대로 순수 원본으로 저장 (첫 단어 제거하지 않음)
            pureOriginalMessage = currentMessageStr;

            // 원본 메시지도 저장
            originalMessagesRef.current[idx] = currentMessageStr;
          } else {
            // 원본 메시지를 그대로 순수 원본으로 저장 (첫 단어 제거하지 않음)
            pureOriginalMessage = originalMessage;
          }

          // 순수 원본 메시지 저장 (한 번만 저장하고 절대 변경하지 않음)
          pureOriginalMessagesRef.current[idx] = pureOriginalMessage;
        }
        // 순수 원본이 이미 저장되어 있으면 절대 변경하지 않고 그대로 사용

        // 업체명이 있으면 앞에 업체명 추가, 없으면 순수 원본 메시지만 표시
        if (vendorStr) {
          if (pureOriginalMessage) {
            newRow[messageIdx] =
              `${vendorPrefix} ${pureOriginalMessage}`.trim();
          } else {
            newRow[messageIdx] = vendorPrefix;
          }
        } else {
          // 업체명이 비어있으면 순수 원본 메시지만 표시
          newRow[messageIdx] = pureOriginalMessage || "";
        }
      }

      return newRow;
    });

    setTableData(updatedTable);

    // 파일 데이터도 업데이트 (productCodeMap 유지)
    if (fileId) {
      const updatedFile = {
        ...file,
        tableData: updatedTable,
        productCodeMap: {...productCodeMap}, // 매핑코드 유지
      };
      setFile(updatedFile);
      sessionStorage.setItem(
        `uploadedFile_${fileId}`,
        JSON.stringify(updatedFile)
      );
      // store의 uploadedFiles도 업데이트
      const updatedFiles = uploadedFiles.map((f) =>
        f.id === fileId ? updatedFile : f
      );
      setUploadedFiles(updatedFiles);
    }
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
    const dataRows = tableData.slice(1);

    // 모든 행의 상품명에 대해 매핑코드와 업체명이 있는지 확인
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const name = row[nameIdx];

      if (!name || typeof name !== "string" || name.trim() === "") {
        continue; // 상품명이 없으면 건너뛰기
      }

      const trimmedName = name.trim();

      // 매핑코드 확인
      const codeFromMap = productCodeMap[trimmedName];
      const codeFromCodes = codes.find(
        (c: any) => c.name === trimmedName
      )?.code;
      const codeFromOrigin = codesOriginRef.current.find(
        (c) => c.name === trimmedName
      )?.code;

      const hasMappingCode = !!(codeFromMap || codeFromCodes || codeFromOrigin);

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

  const handleConfirm = () => {
    if (fileId && isAllMappingCodesFilled) {
      // productTypeMap과 productPostTypeMap의 값을 tableData에 반영
      const headerRow = tableData[0];
      const typeIdx = headerRow.findIndex((h: any) => h === "내외주");
      const postTypeIdx = headerRow.findIndex((h: any) => h === "택배사");

      const finalTableData = tableData.map((row, idx) => {
        if (idx === 0) return row;
        const rowName = row[headerIndex?.nameIdx || 0];
        if (!rowName) return row;

        const trimmedName = String(rowName).trim();
        const newRow = [...row];

        // 클라이언트 맵에 저장된 값이 있으면 반영
        if (typeIdx !== -1 && productTypeMap[trimmedName]) {
          newRow[typeIdx] = productTypeMap[trimmedName];
        }
        if (postTypeIdx !== -1 && productPostTypeMap[trimmedName]) {
          newRow[postTypeIdx] = productPostTypeMap[trimmedName];
        }

        return newRow;
      });

      // 파일의 productCodeMap 및 tableData 업데이트 (모든 필수 필드 포함)
      const updatedFile = {
        id: file.id,
        fileName: file.fileName,
        rowCount: file.rowCount,
        tableData: finalTableData,
        headerIndex: headerIndex,
        productCodeMap: {...productCodeMap},
      };

      // sessionStorage 업데이트
      try {
        sessionStorage.setItem(
          `uploadedFile_${fileId}`,
          JSON.stringify(updatedFile)
        );
      } catch (error) {
        console.error("sessionStorage 업데이트 실패:", error);
      }

      // store의 uploadedFiles도 업데이트
      const updatedFiles = uploadedFiles.map((f) =>
        f.id === fileId ? updatedFile : f
      );
      setUploadedFiles(updatedFiles);

      confirmFile(fileId);

      // 부모 창에 메시지 전송 (약간의 지연을 두어 메시지가 전송되도록 보장)
      if (window.opener) {
        // 메시지 전송
        window.opener.postMessage(
          {
            type: "FILE_CONFIRMED",
            fileId: fileId,
            fileData: updatedFile,
          },
          window.location.origin
        );

        // 메시지가 전송될 시간을 주고 새창 닫기
        setTimeout(() => {
          window.close();
        }, 100);
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

  useEffect(() => {
    // 상품 목록 fetch (DB에서)
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
  }, [setCodes]);

  useEffect(() => {
    if (codes.length && codesOriginRef.current.length === 0) {
      codesOriginRef.current = [...codes];
    }
  }, [codes]);

  useEffect(() => {
    if (!fileId) return;

    // sessionStorage에서 파일 데이터 가져오기
    const storedFile = sessionStorage.getItem(`uploadedFile_${fileId}`);
    if (storedFile) {
      try {
        const parsedFile = JSON.parse(storedFile);
        setFile(parsedFile);
        setTableData(parsedFile.tableData);
        setFileName(parsedFile.fileName);
        setHeaderIndex(parsedFile.headerIndex);
        setProductCodeMap(parsedFile.productCodeMap || {});

        // 원본 배송메시지 저장 (파일 로드 시점의 메시지를 그대로 저장)
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
                  // 업체명 제거는 나중에 업체명을 적용할 때 한 번만 수행
                  originalMessagesRef.current[idx] = messageStr;
                } else {
                  originalMessagesRef.current[idx] = "";
                }
              }
            });
          }

          // 업체명 초기값 설정
          const vendorIdx = headerRow.findIndex(
            (h: any) => h && typeof h === "string" && h === "업체명"
          );
          if (vendorIdx !== -1 && parsedFile.tableData[1][vendorIdx]) {
            setVendorName(String(parsedFile.tableData[1][vendorIdx]).trim());
          }
        }
      } catch (error) {
        console.error("파일 데이터 파싱 실패:", error);
      }
    } else {
      // store에서 찾기
      const foundFile = uploadedFiles.find((f) => f.id === fileId);
      if (foundFile) {
        setFile(foundFile);
        setTableData(foundFile.tableData);
        setFileName(foundFile.fileName);
        setHeaderIndex(foundFile.headerIndex);
        setProductCodeMap(foundFile.productCodeMap || {});

        // 원본 배송메시지 저장 (파일 로드 시점의 메시지를 그대로 저장)
        if (foundFile.tableData && foundFile.tableData.length > 1) {
          const headerRow = foundFile.tableData[0];
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
            foundFile.tableData.forEach((row: any[], idx: number) => {
              if (idx > 0) {
                const message = row[messageIdx];
                if (message !== null && message !== undefined) {
                  const messageStr = String(message).trim();
                  // 파일 로드 시점의 메시지를 그대로 원본으로 저장
                  // 업체명 제거는 나중에 업체명을 적용할 때 한 번만 수행
                  originalMessagesRef.current[idx] = messageStr;
                } else {
                  originalMessagesRef.current[idx] = "";
                }
              }
            });
          }

          // 업체명 초기값 설정
          const vendorIdx = headerRow.findIndex(
            (h: any) => h && typeof h === "string" && h === "업체명"
          );
          if (vendorIdx !== -1 && foundFile.tableData[1][vendorIdx]) {
            setVendorName(String(foundFile.tableData[1][vendorIdx]).trim());
          }
        }
      }
    }
  }, [fileId, uploadedFiles, setHeaderIndex, setProductCodeMap]);

  // 자동 매핑 훅 사용
  const {codesOriginRef: autoMappingCodesOriginRef} = useAutoMapping({
    tableData,
    codes,
    productCodeMap,
    headerIndex,
    setTableData,
    setProductCodeMap,
    setHeaderIndex,
  });

  // codesOriginRef와 autoMappingCodesOriginRef 동기화
  useEffect(() => {
    if (autoMappingCodesOriginRef.current.length > 0) {
      codesOriginRef.current = autoMappingCodesOriginRef.current;
    }
  }, [autoMappingCodesOriginRef, codesOriginRef]);

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
                onClick={handleToggleEditMode}
                className={`px-4 py-1 rounded text-sm font-semibold transition-colors ${
                  isEditMode
                    ? "bg-green-500 hover:bg-green-600 text-white"
                    : "bg-blue-500 hover:bg-blue-600 text-white"
                }`}
              >
                {isEditMode ? "편집 완료" : "편집"}
              </button>
              <input
                type="text"
                placeholder="업체명 입력"
                value={vendorName}
                onChange={(e) => {
                  const newValue = e.target.value;
                  setVendorName(newValue);
                  // 실시간으로 업데이트 (빈 값일 때도 처리)
                  updateVendorAndMessage(newValue);
                }}
                className="border border-gray-300 px-3 py-1 rounded text-sm"
                style={{minWidth: "150px"}}
              />
              <span>{tableData.length - 1}건</span>
            </div>
          </div>
          <div className="mt-2 w-full overflow-x-auto text-black mb-20">
            <table className="table-auto border border-collapse border-gray-400 w-full min-w-[800px]">
              <thead>
                <tr>
                  {tableData[0].map((header, hidx) => (
                    <th
                      key={hidx}
                      className="border bg-gray-100 px-2 py-1 text-xs"
                    >
                      {header}
                    </th>
                  ))}
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
                  const sorted = isEditMode
                    ? [...tableData.slice(1)]
                    : [...tableData.slice(1)].sort((a, b) => {
                        const prodA = a[productNameIdx] || "";
                        const prodB = b[productNameIdx] || "";
                        const prodCompare = String(prodA).localeCompare(
                          String(prodB),
                          "ko-KR"
                        );
                        if (prodCompare !== 0) return prodCompare;
                        // 상품명 동일하면 수취인명 or 이름 기준
                        if (receiverIdx !== -1) {
                          const recA = a[receiverIdx] || "";
                          const recB = b[receiverIdx] || "";
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
                  const qtyIdx = headerRow.findIndex((h: any) => h === "수량");
                  const receiverNameIdx = headerRow.findIndex(
                    (h: any) =>
                      h &&
                      typeof h === "string" &&
                      (h.includes("수취인명") || h === "이름")
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

                  return sorted.map((row, i) => {
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

                    // 매핑코드 값 가져오기 (우선순위: productCodeMap > 테이블 컬럼 > codes)
                    let mappingCode = "";
                    if (name) {
                      const trimmedName = String(name).trim();
                      // productCodeMap을 먼저 확인 (추천 선택 시 즉시 반영)
                      mappingCode =
                        productCodeMap[trimmedName] ||
                        (mappingIdx !== -1 && row[mappingIdx]
                          ? String(row[mappingIdx])
                          : "") ||
                        codes.find((c: any) => c.name === trimmedName)?.code ||
                        codesOriginRef.current.find(
                          (c) => c.name === trimmedName
                        )?.code ||
                        "";
                    }

                    return (
                      <tr key={i}>
                        {tableData[0].map((_, j) => {
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

                          // 편집 모드이고 상품명, 수량, 수취인명 컬럼인 경우 input으로 표시
                          const isEditableColumn =
                            j === productNameIdx ||
                            j === qtyIdx ||
                            j === receiverNameIdx;
                          const isDuplicateCell =
                            (isReceiverDup && j === receiverNameIdx) ||
                            (isAddressDup && j === addressIdx);
                          const tdClass = `border px-2 py-1 border-gray-300 text-xs min-w-[60px]${
                            isDuplicateCell ? " bg-red-100" : ""
                          }`;

                          return (
                            <td key={j} className={tdClass}>
                              {isEditMode && isEditableColumn ? (
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
                              ) : cellValue !== undefined &&
                                cellValue !== null ? (
                                cellValue
                              ) : (
                                ""
                              )}
                            </td>
                          );
                        })}
                        <td className="border px-2 py-1 border-gray-300 text-xs text-center">
                          {name ? (
                            <div className="flex items-center justify-center gap-1">
                              {mappingCode && <span>{mappingCode}</span>}
                              <button
                                className="w-[40px] p-1 rounded-sm text-[12px] hover:bg-blue-300 border border-[#9a9a9a85] bg-blue-400"
                                type="button"
                                onClick={() => handleRecommendClick(i, name)}
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
                              {recommendIdx === i && (
                                <RecommendModal
                                  open={recommendIdx === i}
                                  recommendList={recommendList}
                                  name={name}
                                  rowIdx={i}
                                  onSelect={(
                                    selectedName,
                                    selectedCode,
                                    selectedItem
                                  ) => {
                                    // 먼저 productCodeMap 업데이트
                                    const updatedProductCodeMap = {
                                      ...productCodeMap,
                                      [selectedName]: selectedCode,
                                    };
                                    setProductCodeMap(updatedProductCodeMap);

                                    // 선택한 항목의 데이터 사용 (없으면 codes에서 찾기)
                                    const itemData =
                                      selectedItem ||
                                      codes.find(
                                        (c: any) =>
                                          c.name === selectedName &&
                                          c.code === selectedCode
                                      );

                                    // 클라이언트 맵에 저장 (useAutoMapping이 덮어쓰지 않도록)
                                    if (itemData?.type) {
                                      setProductTypeMap((prev) => ({
                                        ...prev,
                                        [selectedName]: itemData.type,
                                      }));
                                    }
                                    if (itemData?.postType) {
                                      setProductPostTypeMap((prev) => ({
                                        ...prev,
                                        [selectedName]: itemData.postType,
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
                                      const updatedTable = tableData.map(
                                        (row, idx) => {
                                          if (idx === 0) return row;
                                          const rowName =
                                            row[headerIndex.nameIdx!];
                                          // 같은 상품명을 가진 모든 행 업데이트
                                          if (
                                            rowName &&
                                            String(rowName).trim() ===
                                              selectedName.trim()
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
                                    }

                                    // 모달 닫기
                                    handleSelectSuggest(
                                      selectedName,
                                      selectedCode
                                    );
                                  }}
                                  onClose={() => setRecommendIdx(null)}
                                  onDirectInput={(inputName, inputRowIdx) => {
                                    openDirectInputModal(
                                      inputName,
                                      inputRowIdx
                                    );
                                    setRecommendIdx(null);
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
                                const actualRowIndex = tableData.indexOf(row);
                                handleDuplicateRow(actualRowIndex);
                              }}
                              className="px-2 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-xs"
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
        onClose={closeDirectInputModal}
        onSave={async () => {
          await saveDirectInputModal();
          // 저장 후 codes 목록 다시 불러오기 (DB에 저장된 최신 데이터 반영)
          try {
            const response = await fetch("/api/products/list");
            const result = await response.json();
            if (result.success) {
              setCodes(result.data || []);
              // codesOriginRef도 업데이트
              codesOriginRef.current = result.data || [];
            }
          } catch (error) {
            console.error("상품 목록 조회 실패:", error);
          }
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
            const headerRow = tableData[0];
            const mappingIdx = headerRow.findIndex(
              (h: any) => h === "매핑코드"
            );

            // tableData에서 같은 상품명을 가진 첫 번째 행 찾기
            for (let idx = 1; idx < tableData.length; idx++) {
              const row = tableData[idx];
              const rowName = row[headerIndex.nameIdx];
              if (
                rowName &&
                String(rowName).trim() === codeEditWindow.productName.trim()
              ) {
                if (mappingIdx !== -1 && row[mappingIdx]) {
                  return String(row[mappingIdx]);
                }
                break;
              }
            }

            return (
              productCodeMap[codeEditWindow.productName] ||
              codes.find((c: any) => c.name === codeEditWindow.productName)
                ?.code ||
              ""
            );
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
                // codeItem이 함께 전달되면 우선 사용하고, 없으면 codes에서 검색
                const selectedItem =
                  codeItem || codes.find((c: any) => c.code === code);
                if (!selectedItem) {
                  console.error("선택한 상품을 찾을 수 없습니다:", code);
                  return;
                }

                const selectedName = selectedItem.name;
                const selectedCode = code;
                const originalProductName = String(
                  codeEditWindow.productName
                ).trim();

                // 디버깅: codeItem과 selectedItem 확인
                console.log("CodeEditWindow 업데이트:", {
                  codeItem,
                  selectedItem,
                  type: selectedItem?.type,
                  postType: selectedItem?.postType,
                  code,
                  originalProductName,
                });

                // productCodeMap 업데이트 (원래 상품명으로 매핑코드 저장)
                const updatedProductCodeMap = {
                  ...productCodeMap,
                  [originalProductName]: selectedCode, // 원래 상품명으로 매핑코드 저장
                };
                setProductCodeMap(updatedProductCodeMap);

                // 매핑코드, 내외주, 택배사 실시간 업데이트
                const headerRow = tableData[0];
                const mappingIdx = headerRow.findIndex(
                  (h: any) => h === "매핑코드"
                );
                const typeIdx = headerRow.findIndex((h: any) => h === "내외주");
                const postTypeIdx = headerRow.findIndex(
                  (h: any) => h === "택배사"
                );

                console.log("헤더 인덱스:", {
                  mappingIdx,
                  typeIdx,
                  postTypeIdx,
                  headerRow,
                });

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
