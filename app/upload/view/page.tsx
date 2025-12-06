"use client";

import {useEffect, useState, useRef, useMemo} from "react";
import {useSearchParams} from "next/navigation";
import {useUploadStore} from "@/stores/uploadStore";

export default function FileViewPage() {
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
  
  // 업체명 변경시 배송메시지 실시간 업데이트를 위한 함수
  const updateVendorAndMessage = (newVendorName: string) => {
    if (!newVendorName.trim()) return;
    
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
    const vendorPrefix = vendorStr.length > 4 ? vendorStr.substring(0, 2) : vendorStr;
    
    const updatedTable = tableData.map((row, idx) => {
      if (idx === 0) return row;
      const newRow = [...row];
      newRow[vendorIdx] = vendorStr;
      
      // 배송메시지 업데이트
      if (messageIdx !== -1) {
        const currentMessage = row[messageIdx];
        if (!currentMessage || currentMessage === null || String(currentMessage).trim() === "") {
          newRow[messageIdx] = vendorPrefix;
        } else {
          const existingMessage = String(currentMessage).trim();
          // 기존 메시지에서 업체명 부분 제거 후 새 업체명 추가
          const messageWithoutVendor = existingMessage.replace(/^[^\s]+\s?/, "");
          newRow[messageIdx] = `${vendorPrefix} ${messageWithoutVendor}`.trim();
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

  // 매핑코드가 모두 입력되었는지 확인
  const isAllMappingCodesFilled = useMemo(() => {
    if (
      !tableData.length ||
      !headerIndex ||
      typeof headerIndex.nameIdx !== "number"
    ) {
      return false;
    }

    const nameIdx = headerIndex.nameIdx;
    const dataRows = tableData.slice(1);

    // 모든 행의 상품명에 대해 매핑코드가 있는지 확인
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const name = row[nameIdx];

      if (!name || typeof name !== "string" || name.trim() === "") {
        continue; // 상품명이 없으면 건너뛰기
      }

      const trimmedName = name.trim();

      // productCodeMap에서 확인
      const codeFromMap = productCodeMap[trimmedName];

      // codes에서 확인
      const codeFromCodes = codes.find((c: any) => c.name === trimmedName)?.code;

      // codesOriginRef에서 확인
      const codeFromOrigin = codesOriginRef.current.find(
        (c) => c.name === trimmedName
      )?.code;

      // 하나라도 매핑코드가 없으면 false 반환
      if (!codeFromMap && !codeFromCodes && !codeFromOrigin) {
        return false;
      }
    }

    return true; // 모든 상품명에 매핑코드가 있음
  }, [tableData, headerIndex, productCodeMap, codes]);

  const isConfirmed = fileId ? confirmedFiles.has(fileId) : false;

  const handleConfirm = () => {
    if (fileId && isAllMappingCodesFilled) {
      // 파일의 productCodeMap 업데이트
      const updatedFile = {
        ...file,
        productCodeMap: {...productCodeMap},
      };
      // sessionStorage 업데이트
      sessionStorage.setItem(
        `uploadedFile_${fileId}`,
        JSON.stringify(updatedFile)
      );
      // store의 uploadedFiles도 업데이트
      const updatedFiles = uploadedFiles.map((f) =>
        f.id === fileId ? updatedFile : f
      );
      setUploadedFiles(updatedFiles);

      confirmFile(fileId);
      alert("확인되었습니다. 모달의 Upload 버튼을 클릭하여 업로드하세요.");
    }
  };

  const handleCancel = () => {
    if (fileId) {
      unconfirmFile(fileId);
    }
    window.close();
  };

  // 필드명 한글 매핑
  const fieldNameMap: {[key: string]: string} = {
    name: "상품명",
    code: "매핑코드",
    type: "내외주",
    postType: "택배사",
    pkg: "합포수량",
    price: "가격",
    postFee: "택배비",
    etc: "기타",
  };

  // 추천 모달 테이블 고정 헤더 순서
  const fixedRecommendTableHeaders = [
    "type",
    "postType",
    "name",
    "code",
    "price",
    "postFee",
    "pkg",
    "etc",
  ];

  useEffect(() => {
    // codes.json fetch
    fetch("/data/mapping/codes.json")
      .then((res) => res.json())
      .then(setCodes);
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
        
        // 업체명 초기값 설정
        if (parsedFile.tableData && parsedFile.tableData.length > 1) {
          const headerRow = parsedFile.tableData[0];
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
        
        // 업체명 초기값 설정
        if (foundFile.tableData && foundFile.tableData.length > 1) {
          const headerRow = foundFile.tableData[0];
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

  // 상품명 기준으로 매핑코드 + 타입(내외주) + postType(택배사) 컬럼 자동 연동
  useEffect(() => {
    if (
      !tableData.length ||
      !headerIndex ||
      typeof headerIndex.nameIdx !== "number"
    ) {
      return;
    }

    const headerRow = tableData[0];
    const nameIdx = headerIndex.nameIdx;

    const mappingIdx = headerRow.findIndex((h) => h === "매핑코드");
    const typeIdx = headerRow.findIndex((h) => h === "내외주");
    const postTypeIdx = headerRow.findIndex((h) => h === "택배사");

    if (mappingIdx === -1 && typeIdx === -1 && postTypeIdx === -1) return;

    let changed = false;
    const newMap: {[name: string]: string} = {...productCodeMap};

    const newTable = tableData.map((row, idx) => {
      if (idx === 0) return row;

      const nameVal = row[nameIdx];
      if (!nameVal || typeof nameVal !== "string") return row;
      const name = nameVal.trim();
      if (!name) return row;

      let rowChanged = false;
      let updatedRow = row;

      // 코드 우선순위: 직접 입력(productCodeMap) > codes.json 자동 매칭
      let codeVal = newMap[name];
      const found = codes.find((c: any) => c.name === name);
      if (!codeVal && found?.code) codeVal = found.code;

      if (mappingIdx >= 0 && codeVal && row[mappingIdx] !== codeVal) {
        if (!rowChanged) {
          updatedRow = [...row];
          rowChanged = true;
        }
        updatedRow[mappingIdx] = codeVal;
        changed = true;
      }

      if (found) {
        if (typeIdx >= 0 && found.type && row[typeIdx] !== found.type) {
          if (!rowChanged) {
            updatedRow = [...row];
            rowChanged = true;
          }
          updatedRow[typeIdx] = found.type;
          changed = true;
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
          changed = true;
        }
      }

      // productCodeMap에 비어있고 자동매칭된 코드가 있으면 map에도 채워둠
      if (!newMap[name] && found?.code) {
        newMap[name] = found.code;
      }

      return updatedRow;
    });

    if (changed) {
      setTableData(newTable);
    }
    // productCodeMap이 변경되었다면 갱신
    const originalKeys = Object.keys(productCodeMap);
    const newKeys = Object.keys(newMap);
    if (
      originalKeys.length !== newKeys.length ||
      originalKeys.some((k) => productCodeMap[k] !== newMap[k])
    ) {
      setProductCodeMap(newMap);
    }
  }, [
    tableData,
    headerIndex,
    codes,
    productCodeMap,
    setTableData,
    setProductCodeMap,
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
              <input
                type="text"
                placeholder="업체명 입력"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                className="border border-gray-300 px-3 py-1 rounded text-sm"
                style={{minWidth: "150px"}}
              />
              <button
                onClick={() => {
                  if (!vendorName.trim()) {
                    alert("업체명을 입력해주세요.");
                    return;
                  }
                  updateVendorAndMessage(vendorName);
                }}
                className="px-4 py-1 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded transition-colors"
              >
                적용
              </button>
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
                </tr>
              </thead>
              <tbody>
                {(() => {
                  if (
                    !headerIndex ||
                    typeof headerIndex.nameIdx !== "number"
                  )
                    return null;
                  const productNameIdx = headerIndex.nameIdx;
                  // 수취인명/이름 인덱스 찾기
                  const receiverIdx = tableData[0]?.findIndex(
                    (h: any) =>
                      h &&
                      typeof h === "string" &&
                      (h.includes("수취인명") || h.includes("이름"))
                  );
                  // 상품명 -> (상품명 같으면) 수취인명/이름 기준 오름차순 정렬
                  const sorted = [...tableData.slice(1)].sort((a, b) => {
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
                  return sorted.map((row, i) => {
                    let name = "";
                    if (typeof headerIndex?.nameIdx === "number") {
                      name = row[headerIndex.nameIdx] as string;
                    }
                    return (
                      <tr key={i}>
                        {tableData[0].map((_, j) => {
                          return (
                            <td
                              key={j}
                              className="border px-2 py-1 border-gray-300 text-xs min-w-[60px]"
                            >
                              {row[j] !== undefined && row[j] !== null
                                ? row[j]
                                : ""}
                            </td>
                          );
                        })}
                        <td className="border px-2 py-1 border-gray-300 text-xs text-center">
                          {name &&
                          codesOriginRef.current.find((c) => c.name === name)
                            ?.code ? (
                            codes.find((c) => c.name === name)?.code
                          ) : name ? (
                            <div className="flex items-center justify-center gap-2">
                              {productCodeMap[name] && (
                                <span>{productCodeMap[name]}</span>
                              )}
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
                              {recommendIdx === i &&
                                recommendList.length > 0 && (
                                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#00000084] bg-opacity-30">
                                    <div className="bg-white shadow-lg rounded-lg px-8 py-6 min-w-[420px] max-w-[90vw] max-h-[65vh] overflow-y-auto relative flex flex-col">
                                      <div className="font-bold text-base mb-4 text-center">
                                        비슷한 상품명 추천
                                      </div>
                                      <table className="text-xs border border-gray-300 w-full">
                                        <thead>
                                          <tr>
                                            {fixedRecommendTableHeaders
                                              .filter((key) => {
                                                return recommendList.some(
                                                  (item: any) =>
                                                    item.hasOwnProperty(key)
                                                );
                                              })
                                              .map((key) => (
                                                <th
                                                  key={key}
                                                  className={`border border-gray-200 font-normal bg-gray-50 px-2 py-1 ${
                                                    key === "code" ||
                                                    key === "pkg"
                                                      ? "text-center"
                                                      : ""
                                                  }`}
                                                >
                                                  {fieldNameMap[key] || key}
                                                </th>
                                              ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {recommendList.map((item, ridx) => {
                                            return (
                                              <tr
                                                key={ridx}
                                                className="hover:bg-blue-100 cursor-pointer"
                                                onClick={() =>
                                                  handleSelectSuggest(
                                                    name,
                                                    item.code
                                                  )
                                                }
                                              >
                                                {fixedRecommendTableHeaders
                                                  .filter((key) => {
                                                    return recommendList.some(
                                                      (item: any) =>
                                                        item.hasOwnProperty(key)
                                                    );
                                                  })
                                                  .map((key) => (
                                                    <td
                                                      key={key}
                                                      className={`border border-gray-200 px-2 py-1 break-all text-black whitespace-pre-line min-w-[85px] ${
                                                        key === "code" ||
                                                        key === "pkg"
                                                          ? "text-center"
                                                          : ""
                                                      }`}
                                                    >
                                                      {String(
                                                        (item as any)[key] ?? ""
                                                      )}
                                                    </td>
                                                  ))}
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                      <div className="flex justify-between items-center mt-4 text-xs">
                                        <button
                                          type="button"
                                          className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-100 text-gray-600"
                                          onClick={() => {
                                            openDirectInputModal(name || "", i);
                                            setRecommendIdx(null);
                                          }}
                                        >
                                          직접 입력
                                        </button>
                                      </div>
                                      <button
                                        className="absolute top-2 right-4 text-gray-400 hover:text-black text-[24px]"
                                        onClick={() => setRecommendIdx(null)}
                                      >
                                        ×
                                      </button>
                                    </div>
                                  </div>
                                )}
                            </div>
                          ) : (
                            ""
                          )}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </>
      )}
      {directInputModal.open && (
        <div
          onClick={closeDirectInputModal}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#00000080] bg-opacity-30"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white shadow-xl rounded-xl px-8 py-7 min-w-[340px] max-w-[90vw] overflow-y-auto relative flex flex-col items-start"
          >
            <div className="font-bold text-lg mb-4 text-center text-[#333]">
              신규 상품정보 직접 입력
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveDirectInputModal();
              }}
              className="w-full"
            >
              <table className="w-full text-xs mb-3 ">
                <tbody className="w-full flex flex-col gap-[10px]">
                  {directInputModal.fields.map((key) => (
                    <tr key={key} className="flex gap-[6px]">
                      <td className="pr-2 py-1 text-right font-medium text-gray-500 w-[75px]">
                        {fieldNameMap[key] || key}
                      </td>
                      <td className="w-full">
                        {key === "name" ? (
                          <input
                            type="text"
                            className="border border-[#e1e0e0] px-2 py-1 rounded w-full bg-gray-100 text-[#333]"
                            value={directInputModal.values.name || ""}
                            readOnly
                          />
                        ) : key === "type" ? (
                          <select
                            className="border border-[#e1e0e0] px-2 py-1 rounded w-full text-[#333]"
                            value={directInputModal.values[key] || ""}
                            onChange={(e) =>
                              setDirectInputValue(key, e.target.value)
                            }
                          >
                            <option value="">선택하세요</option>
                            <option value="내주">내주</option>
                            <option value="외주">외주</option>
                          </select>
                        ) : key === "postType" ? (
                          <select
                            className="border border-[#e1e0e0] px-2 py-1 rounded w-full text-[#333]"
                            value={directInputModal.values[key] || ""}
                            onChange={(e) =>
                              setDirectInputValue(key, e.target.value)
                            }
                          >
                            <option value="">선택하세요</option>
                            <option value="CJ대한통운">CJ대한통운</option>
                            <option value="우체국택배">우체국택배</option>
                            <option value="로젠택배">로젠택배</option>
                            <option value="롯데택배">롯데택배</option>
                            <option value="한진택배">한진택배</option>
                            <option value="천일택배">천일택배</option>
                          </select>
                        ) : (
                          <input
                            type="text"
                            className="border border-[#e1e0e0] px-2 py-1 rounded w-full text-[#333]"
                            value={directInputModal.values[key] || ""}
                            onChange={(e) =>
                              setDirectInputValue(key, e.target.value)
                            }
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-row gap-4 justify-end mt-4">
                <button
                  type="button"
                  className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300 text-xs font-semibold"
                  onClick={closeDirectInputModal}
                >
                  닫기
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 px-4 py-2 rounded hover:bg-blue-700 text-xs text-white font-semibold"
                >
                  저장
                </button>
              </div>
            </form>
            <button
              className="absolute top-2 right-4 text-gray-400 hover:text-black text-[24px]"
              onClick={closeDirectInputModal}
            >
              ×
            </button>
          </div>
        </div>
      )}
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

