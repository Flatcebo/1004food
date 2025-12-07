"use client";

import RecommendModal from "./RecommendModal";

interface DataTableProps {
  tableData: any[][];
  fileName: string;
  headerIndex: {nameIdx?: number} | null;
  productCodeMap: {[name: string]: string};
  codesOriginRef: React.MutableRefObject<any[]>;
  codes: Array<{name: string; code: string; [key: string]: any}>;
  recommendIdx: number | null;
  recommendList: Array<{name: string; code: string; [key: string]: any}>;
  onInputCode: (name: string, code: string) => void;
  onRecommendClick: (rowIdx: number, name: string) => void;
  onSelectSuggest: (name: string, code: string, item?: any) => void;
  onDirectInput: (name: string, rowIdx: number) => void;
  onCloseRecommend: () => void;
}

export default function DataTable({
  tableData,
  fileName,
  headerIndex,
  productCodeMap,
  codesOriginRef,
  codes,
  recommendIdx,
  recommendList,
  onInputCode,
  onRecommendClick,
  onSelectSuggest,
  onDirectInput,
  onCloseRecommend,
}: DataTableProps) {
  if (
    !tableData.length ||
    !headerIndex ||
    headerIndex.nameIdx === -1 ||
    !fileName
  ) {
    return null;
  }

  const productNameIdx = headerIndex.nameIdx!; // 이미 위에서 체크했으므로 non-null assertion 사용
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
        <span>{fileName}</span>
        <span>{tableData.length - 1}건</span>
      </div>
      <div className="mt-2 w-full overflow-x-auto text-black">
        <table className="table-auto border border-collapse border-gray-400 w-full min-w-[800px]">
          <thead>
            <tr>
              {tableData[0]
                .map((header, hidx) => ({header, hidx}))
                .filter(({header}) => header !== "파일명")
                .map(({header, hidx}) => (
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
              // 파일명 컬럼 인덱스 찾기
              const fileNameIdx = tableData[0].findIndex(
                (h) => h === "파일명"
              );
              return (
                <tr key={i}>
                  {tableData[0]
                    .map((_, j) => ({j, idx: j}))
                    .filter(({j}) => j !== fileNameIdx)
                    .map(({j, idx}) => {
                      return (
                        <td
                          key={idx}
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
                          value={productCodeMap[name] || ""}
                          onChange={(e) => onInputCode(name, e.target.value)}
                          disabled={!name}
                        />
                        <button
                          className="w-[40px] ml-1 p-1 rounded-sm text-[12px] hover:bg-blue-300 border border-[#9a9a9a85] bg-blue-400"
                          type="button"
                          onClick={() => onRecommendClick(i, name)}
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
                        {recommendIdx === i && (
                          <RecommendModal
                            open={recommendIdx === i}
                            recommendList={recommendList}
                            name={name}
                            rowIdx={i}
                            onSelect={onSelectSuggest}
                            onClose={onCloseRecommend}
                            onDirectInput={onDirectInput}
                          />
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
    </>
  );
}

