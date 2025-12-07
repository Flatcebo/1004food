"use client";

import {fieldNameMap, fixedRecommendTableHeaders} from "@/constants/fieldMappings";

interface RecommendModalProps {
  open: boolean;
  recommendList: Array<{name: string; code: string; [key: string]: any}>;
  name: string;
  rowIdx: number;
  onSelect: (name: string, code: string, item?: any) => void;
  onClose: () => void;
  onDirectInput: (name: string, rowIdx: number) => void;
}

export default function RecommendModal({
  open,
  recommendList,
  name,
  rowIdx,
  onSelect,
  onClose,
  onDirectInput,
}: RecommendModalProps) {
  if (!open || recommendList.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#00000084] bg-opacity-30">
      <div className="bg-white shadow-lg rounded-lg px-8 py-6 min-w-[420px] max-w-[90vw] max-h-[65vh] overflow-y-auto relative flex flex-col">
        <div className="font-bold text-base mb-4 text-center">
          비슷한 상품명 추천
        </div>
        <div className="overflow-x-auto">
          <table className="text-xs border border-gray-300 w-full min-w-[1200px]">
          <thead>
            <tr>
              {fixedRecommendTableHeaders
                .filter((key) => {
                  return recommendList.some((item: any) =>
                    item.hasOwnProperty(key)
                  );
                })
                .map((key) => (
                  <th
                    key={key}
                    className="border border-gray-200 font-normal bg-gray-50 px-2 py-1 text-center"
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
                  onClick={() => onSelect(name, item.code, item)}
                >
                  {fixedRecommendTableHeaders
                    .filter((key) => {
                      return recommendList.some((item: any) =>
                        item.hasOwnProperty(key)
                      );
                    })
                    .map((key) => {
                      const value = (item as any)[key];
                      let displayValue = "";
                      
                      // 숫자 필드 포맷팅
                      if (key === "price" || key === "salePrice" || key === "postFee") {
                        if (value !== null && value !== undefined) {
                          displayValue = Number(value).toLocaleString();
                        } else {
                          displayValue = "-";
                        }
                      } else {
                        displayValue = value !== null && value !== undefined ? String(value) : "-";
                      }
                      
                      return (
                        <td
                          key={key}
                          className={`border border-gray-200 px-2 py-1 break-all text-black whitespace-pre-line min-w-[85px] ${
                            key === "code" || key === "pkg" ? "text-center" : ""
                          } ${
                            key === "price" || key === "salePrice" || key === "postFee" ? "text-right" : ""
                          }`}
                        >
                          {displayValue}
                        </td>
                      );
                    })}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        <div className="flex justify-between items-center mt-4 text-xs">
          <button
            type="button"
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-100 text-gray-600"
            onClick={() => {
              onDirectInput(name || "", rowIdx);
              onClose();
            }}
          >
            직접 입력
          </button>
        </div>
        <button
          className="absolute top-2 right-4 text-gray-400 hover:text-black text-[24px]"
          onClick={onClose}
        >
          ×
        </button>
      </div>
    </div>
  );
}

