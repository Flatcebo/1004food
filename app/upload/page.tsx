"use client";

import {useRef, useState, useEffect} from "react";
import * as XLSX from "xlsx";
import stringSimilarity from "string-similarity";
import {useUploadStore} from "@/stores/uploadStore";
import ModalTable from "@/components/ModalTable";

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
    handleCodeMatch,
    handleInputCode,
    handleSave,
    getSuggestions,
    handleRecommendClick,
    handleSelectSuggest,
    handleFile,
    handleFileChange,
    directInputModal,
    setDirectInputValue,
    closeDirectInputModal,
    saveDirectInputModal,
    openDirectInputModal,
  } = useUploadStore();

  const codesOriginRef = useRef<any[]>([]);
  useEffect(() => {
    if (codes.length && codesOriginRef.current.length === 0) {
      codesOriginRef.current = [...codes];
    }
  }, [codes]);

  // codes.json fetch
  useEffect(() => {
    if (!isModalOpen) return;
    fetch("/data/mapping/codes.json")
      .then((res) => res.json())
      .then(setCodes);
  }, [isModalOpen, setCodes]);

  // 상품명 인덱스 자동 추출
  useEffect(() => {
    if (!tableData.length) {
      setHeaderIndex(null);
      return;
    }
    const headerRow = tableData[0];
    const nameIdx = headerRow.findIndex(
      (h: any) => h && typeof h === "string" && h.includes("상품명")
    );
    setHeaderIndex({nameIdx});
  }, [tableData, setHeaderIndex]);

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

  // Upload 버튼 클릭 핸들러: 매칭 map 구성
  // 코드 직접 입력 시 반영
  // 최종 저장(예시: console.log)
  // 추천 리스트 생성 함수
  // 추천 버튼 클릭
  // 추천목록에서 선택 시(코드 자동 입력)

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    setDragActive(false);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setTableData([]);
    setFileName("");
    setProductCodeMap({});
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center">
      <button
        className="px-5 py-3 bg-blue-600 text-white font-bold rounded hover:bg-blue-800 mt-20"
        onClick={() => setIsModalOpen(true)}
      >
        엑셀 업로드
      </button>
      <ModalTable
        open={isModalOpen}
        onClose={handleCloseModal}
        onSubmit={() => {
          handleSave();
          handleCloseModal();
        }}
      >
        <div
          className={`border-2 border-dashed rounded-lg px-8 py-10 flex flex-col items-center justify-center transition-colors hover:bg-[#9a9a9a51] ${
            dragActive
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 bg-gray-100"
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef?.current?.click()}
          style={{cursor: "pointer"}}
        >
          <input
            type="file"
            accept=".xlsx, .xls"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="text-lg mb-2 text-gray-600">
            파일을 드래그하거나 클릭하여 선택
          </div>
          <div className="text-sm text-gray-400">
            엑셀(.xlsx, .xls) 파일만 가능합니다
          </div>
        </div>
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
                          {key}
                        </td>
                        <td className="w-full">
                          {key === "name" ? (
                            <input
                              type="text"
                              className="border px-2 py-1 rounded w-full bg-gray-100 text-[#333]"
                              value={directInputModal.values.name || ""}
                              readOnly
                            />
                          ) : (
                            <input
                              type="text"
                              className="border px-2 py-1 rounded w-full border-[#e1e0e0] text-[#333]"
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
        {tableData.length > 0 && headerIndex && headerIndex.nameIdx !== -1 && (
          <>
            <div className="font-bold text-lg mt-4 mb-2 text-black text-left w-full flex flex-row justify-between">
              <span>{fileName}</span>
              <span>{tableData.length - 1}건</span>
            </div>
            <div className="mt-2 w-full overflow-x-auto text-black">
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
                    <th className="border bg-gray-100 px-2 py-1 text-xs">
                      매핑코드
                    </th>
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
                          <td className="border px-2 py-1 border-gray-300 text-xs">
                            {name &&
                            codesOriginRef.current.find((c) => c.name === name)
                              ?.code ? (
                              codes.find((c) => c.name === name)?.code // 값은 최신 codes에서, 조건은 codesOriginRef(current)
                            ) : (
                              <div className="flex items-center">
                                <input
                                  className="text-xs px-2 py-1 rounded border border-[#9a9a9a83]"
                                  style={{minWidth: "80px", width: "80px"}}
                                  placeholder="code 입력"
                                  value={productCodeMap[name] || ""}
                                  onChange={(e) =>
                                    handleInputCode(name, e.target.value)
                                  }
                                  disabled={!name}
                                />
                                <button
                                  className="w-[40px] ml-1 p-1 rounded-sm text-[12px] hover:bg-blue-300 border border-[#9a9a9a85] bg-blue-400"
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
                                              {Object.keys(
                                                recommendList[0] ?? {}
                                              )
                                                .filter((k) => k !== "id")
                                                .map((k) => (
                                                  <th
                                                    key={k}
                                                    className="border border-gray-200 font-normal bg-gray-50 px-2 py-1"
                                                  >
                                                    {k}
                                                  </th>
                                                ))}
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {recommendList.map((item, ridx) => {
                                              const keys = Object.keys(
                                                item
                                              ).filter((k) => k !== "id");
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
                                                  {keys.map((k) => (
                                                    <td
                                                      key={k}
                                                      className="border border-gray-200 px-2 py-1 break-all text-black whitespace-pre-line min-w-[85px]"
                                                    >
                                                      {String((item as any)[k])}
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
                                              openDirectInputModal(
                                                name || "",
                                                i
                                              );
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
      </ModalTable>
    </div>
  );
}
