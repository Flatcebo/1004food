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
    handleFiles,
    handleFileChange,
    directInputModal,
    setDirectInputValue,
    closeDirectInputModal,
    saveDirectInputModal,
    openDirectInputModal,
    uploadedFiles,
    setUploadedFiles,
    openFileInNewWindow,
    confirmedFiles,
    unconfirmFile,
    removeUploadedFile,
  } = useUploadStore();

  const codesOriginRef = useRef<any[]>([]);
  useEffect(() => {
    if (codes.length && codesOriginRef.current.length === 0) {
      codesOriginRef.current = [...codes];
    }
  }, [codes]);

  // 모달이 열릴 때 모든 데이터 리셋
  useEffect(() => {
    if (isModalOpen) {
      setTableData([]);
      setFileName("");
      setProductCodeMap({});
      setUploadedFiles([]);
      setHeaderIndex(null);
      setRecommendIdx(null);
      setRecommendList([]);
      codesOriginRef.current = [];
      // confirmedFiles 리셋
      Array.from(confirmedFiles).forEach((fileId) => {
        unconfirmFile(fileId);
      });
    }
  }, [
    isModalOpen,
    setTableData,
    setFileName,
    setProductCodeMap,
    setUploadedFiles,
    setHeaderIndex,
    setRecommendIdx,
    setRecommendList,
    confirmedFiles,
    unconfirmFile,
  ]);

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
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (e.dataTransfer.files.length === 1) {
        handleFile(e.dataTransfer.files[0]);
      } else {
        handleFiles(Array.from(e.dataTransfer.files));
      }
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

  const handleSaveWithConfirmedFiles = () => {
    const confirmedFileIds = Array.from(confirmedFiles);
    let filesToUpload: any[] = [];

    // 확인된 파일이 있으면 확인된 파일 사용, 없으면 일반 업로드된 파일 사용
    if (confirmedFileIds.length > 0) {
      // 확인된 파일 데이터 가져오기
      filesToUpload = confirmedFileIds
        .map((fileId) => {
          // sessionStorage에서 최신 데이터 가져오기
          const storedFile = sessionStorage.getItem(`uploadedFile_${fileId}`);
          if (storedFile) {
            try {
              return JSON.parse(storedFile);
            } catch (error) {
              console.error("파일 데이터 파싱 실패:", error);
              return null;
            }
          }
          // store에서 찾기
          return uploadedFiles.find((f) => f.id === fileId);
        })
        .filter((f) => f !== null);
    } else {
      // 확인된 파일이 없으면 일반 업로드된 파일 사용
      filesToUpload = uploadedFiles.map((file) => {
        // sessionStorage에서 최신 데이터 확인
        const storedFile = sessionStorage.getItem(`uploadedFile_${file.id}`);
        if (storedFile) {
          try {
            return JSON.parse(storedFile);
          } catch (error) {
            console.error("파일 데이터 파싱 실패:", error);
            return file;
          }
        }
        return file;
      });
    }

    if (filesToUpload.length === 0) {
      alert("업로드할 파일이 없습니다.");
      return;
    }

    // 각 파일의 데이터를 매핑코드와 함께 변환
    const uploadData = filesToUpload
      .map((file: any) => {
        if (!file.tableData || !file.headerIndex) return null;

        const headerRow = file.tableData[0];
        const nameIdx = file.headerIndex.nameIdx;
        const mappingIdx = headerRow.findIndex((h: any) => h === "매핑코드");

        const typeIdx = headerRow.findIndex((h: any) => h === "내외주");
        const postTypeIdx = headerRow.findIndex((h: any) => h === "택배사");

        const rows = file.tableData.slice(1).map((row: any[]) => {
          const name = nameIdx !== -1 ? row[nameIdx] : "";

          // codes.json에서 상품명으로 찾기
          const foundCode = codes.find((c: any) => c.name === name);
          const code = file.productCodeMap?.[name] || foundCode?.code || "";

          const rowData: any = {};
          headerRow.forEach((header: any, idx: number) => {
            rowData[header] = row[idx];
          });
          rowData["매핑코드"] = code;

          // 내외주와 택배사도 추가
          if (foundCode) {
            if (typeIdx >= 0 && foundCode.type) {
              rowData["내외주"] = foundCode.type;
            }
            if (postTypeIdx >= 0 && foundCode.postType) {
              rowData["택배사"] = foundCode.postType;
            }
          }

          return rowData;
        });

        return {
          fileName: file.fileName,
          rowCount: file.rowCount,
          data: rows,
        };
      })
      .filter((d: any) => d !== null);

    // 전송할 데이터를 sessionStorage에 저장하고 새 창에서 표시
    try {
      sessionStorage.setItem("uploadSentData", JSON.stringify(uploadData));
      sessionStorage.setItem("uploadSentTimestamp", new Date().toISOString());

      const url = "/upload/preview";
      const newWindow = window.open(url, "_blank", "width=1400,height=900");
      if (!newWindow) {
        alert("팝업이 차단되었습니다. 팝업 차단을 해제해주세요.");
        return;
      }

      console.log("전송할 데이터:", uploadData);

      // 업로드 후 모든 데이터 리셋
      setTableData([]);
      setFileName("");
      setProductCodeMap({});
      setUploadedFiles([]);
      setHeaderIndex(null);
      setRecommendIdx(null);
      setRecommendList([]);
      codesOriginRef.current = [];
      // confirmedFiles 리셋
      Array.from(confirmedFiles).forEach((fileId) => {
        unconfirmFile(fileId);
      });
    } catch (error) {
      console.error("데이터 저장 실패:", error);
      alert("데이터 저장 중 오류가 발생했습니다.");
    }
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
          handleSaveWithConfirmedFiles();
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
            multiple
          />
          <div className="text-lg mb-2 text-gray-600">
            파일을 드래그하거나 클릭하여 선택
          </div>
          <div className="text-sm text-gray-400">
            엑셀(.xlsx, .xls) 파일만 가능합니다 (여러 파일 선택 가능)
          </div>
        </div>
        {uploadedFiles.length > 0 && (
          <div className="w-full mt-4">
            <div className="font-bold text-lg mb-2 text-black flex flex-row justify-between">
              <span>업로드된 파일 목록 ({uploadedFiles.length}개)</span>
              <span>
                전체{" "}
                {uploadedFiles.reduce((sum, file) => sum + file.rowCount, 0)}건
              </span>
            </div>
            <div className="border border-gray-300 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-4 py-2 text-left">
                      파일명
                    </th>
                    <th className="border border-gray-300 px-4 py-2 text-center">
                      건수
                    </th>
                    <th className="border border-gray-300 px-4 py-2 text-center">
                      작업
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {uploadedFiles.map((file) => (
                    <tr
                      key={file.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => openFileInNewWindow(file.id)}
                    >
                      <td className="border border-gray-300 px-4 py-2">
                        {file.fileName}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-center">
                        {file.rowCount}건
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              openFileInNewWindow(file.id);
                            }}
                          >
                            보기
                          </button>
                          <button
                            className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (
                                confirm(
                                  `"${file.fileName}" 파일을 삭제하시겠습니까?`
                                )
                              ) {
                                removeUploadedFile(file.id);
                                // sessionStorage에서도 제거
                                sessionStorage.removeItem(
                                  `uploadedFile_${file.id}`
                                );
                              }
                            }}
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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
        {tableData.length > 0 &&
          headerIndex &&
          headerIndex.nameIdx !== -1 &&
          uploadedFiles.length === 0 && (
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
                            <td className="border px-2 py-1 border-gray-300 text-xs">
                              {name &&
                              codesOriginRef.current.find(
                                (c) => c.name === name
                              )?.code ? (
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
                                                    // recommendList에 해당 필드가 하나라도 있는지 확인
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
                                              {recommendList.map(
                                                (item, ridx) => {
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
                                                          // recommendList에 해당 필드가 하나라도 있는지 확인
                                                          return recommendList.some(
                                                            (item: any) =>
                                                              item.hasOwnProperty(
                                                                key
                                                              )
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
                                                              (item as any)[
                                                                key
                                                              ] ?? ""
                                                            )}
                                                          </td>
                                                        ))}
                                                    </tr>
                                                  );
                                                }
                                              )}
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
                                            onClick={() =>
                                              setRecommendIdx(null)
                                            }
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
