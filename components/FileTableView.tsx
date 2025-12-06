"use client";

import {useRef, useState, useEffect} from "react";
import {useUploadStore} from "@/stores/uploadStore";

interface FileTableViewProps {
  file: {
    id: string;
    fileName: string;
    rowCount: number;
    tableData: any[][];
    headerIndex: {nameIdx?: number} | null;
    productCodeMap: {[name: string]: string};
  };
  codesOriginRef: React.MutableRefObject<any[]>;
}

export default function FileTableView({
  file,
  codesOriginRef,
}: FileTableViewProps) {
  const {
    codes,
    productCodeMap: globalProductCodeMap,
    setProductCodeMap: setGlobalProductCodeMap,
    headerIndex: globalHeaderIndex,
    recommendIdx,
    setRecommendIdx,
    recommendList,
    setRecommendList,
    handleInputCode,
    handleRecommendClick,
    handleSelectSuggest,
    getSuggestions,
    openDirectInputModal,
    setRecommendIdx: setGlobalRecommendIdx,
    directInputModal,
    setDirectInputValue,
    closeDirectInputModal,
    saveDirectInputModal,
  } = useUploadStore();

  const [localProductCodeMap, setLocalProductCodeMap] = useState<{
    [name: string]: string;
  }>(file.productCodeMap || {});

  const headerIndex = file.headerIndex || globalHeaderIndex;
  const tableData = file.tableData;

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

  const handleLocalInputCode = (name: string, code: string) => {
    const newMap = {...localProductCodeMap, [name]: code};
    setLocalProductCodeMap(newMap);
    // 전역 productCodeMap도 업데이트
    setGlobalProductCodeMap({...globalProductCodeMap, [name]: code});
    handleInputCode(name, code);
  };

  const handleLocalRecommendClick = (rowIdx: number, value: string) => {
    const suggestions = getSuggestions(value);
    if (!suggestions.length) {
      openDirectInputModal(value, rowIdx);
      return;
    }
    setRecommendIdx(rowIdx);
    setRecommendList(suggestions as {name: string; code: string}[]);
  };

  const handleLocalSelectSuggest = (name: string, code: string) => {
    const newMap = {...localProductCodeMap, [name]: code};
    setLocalProductCodeMap(newMap);
    setGlobalProductCodeMap({...globalProductCodeMap, [name]: code});
    handleSelectSuggest(name, code);
  };

  if (!tableData.length || !headerIndex || headerIndex.nameIdx === -1) {
    return null;
  }

  const productNameIdx = headerIndex.nameIdx;
  const receiverIdx = tableData[0]?.findIndex(
    (h: any) =>
      h &&
      typeof h === "string" &&
      (h.includes("수취인명") || h.includes("이름"))
  );

  const sorted = [...tableData.slice(1)].sort((a, b) => {
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

  return (
    <>
      <div className="font-bold text-lg mt-4 mb-2 text-black text-left w-full flex flex-row justify-between">
        <span>{file.fileName}</span>
        <span>{file.rowCount}건</span>
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
            {sorted.map((row, i) => {
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
                      codes.find((c) => c.name === name)?.code
                    ) : (
                      <div className="flex items-center">
                        <input
                          className="text-xs px-2 py-1 rounded border border-[#9a9a9a83]"
                          style={{minWidth: "80px", width: "80px"}}
                          placeholder="code 입력"
                          value={localProductCodeMap[name] || ""}
                          onChange={(e) =>
                            handleLocalInputCode(name, e.target.value)
                          }
                          disabled={!name}
                        />
                        <button
                          className="w-[40px] ml-1 p-1 rounded-sm text-[12px] hover:bg-blue-300 border border-[#9a9a9a85] bg-blue-400"
                          type="button"
                          onClick={() => handleLocalRecommendClick(i, name)}
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
                        {recommendIdx === i && recommendList.length > 0 && (
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
                                            key === "code" || key === "pkg"
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
                                          handleLocalSelectSuggest(
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
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
    </>
  );
}

