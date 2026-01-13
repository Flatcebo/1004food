"use client";

import {
  fieldNameMap,
  fixedRecommendTableHeaders,
} from "@/constants/fieldMappings";

interface RecommendModalProps {
  open: boolean;
  recommendList: Array<{name: string; code: string; [key: string]: any}>;
  name: string;
  rowIdx: number;
  onSelect: (name: string, code: string, item?: any, id?: number) => void;
  onClose: () => void;
  onDelete?: (item: any) => void;
}

export default function RecommendModal({
  open,
  recommendList,
  name,
  rowIdx,
  onSelect,
  onClose,
  onDelete,
}: RecommendModalProps) {
  if (!open || recommendList.length === 0) return null;

  // 택배사가 있는 상품을 우선 정렬하여 표시
  const sortedRecommendList = [...recommendList].sort((a: any, b: any) => {
    const aHasPostType = a.postType && String(a.postType).trim() !== "";
    const bHasPostType = b.postType && String(b.postType).trim() !== "";

    // 택배사가 있는 것을 우선
    if (aHasPostType && !bHasPostType) return -1;
    if (!aHasPostType && bHasPostType) return 1;
    return 0;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#00000084] bg-opacity-30">
      <div className="bg-white shadow-lg rounded-lg px-8 py-6 min-w-[420px] max-w-[90vw] max-h-[65vh] overflow-y-auto relative flex flex-col">
        <div className="font-bold text-base mb-4 text-center">
          비슷한 상품명 추천
          {name && (
            <div className="text-xs text-blue-600 font-medium mt-1">
              주문 상품명: {name}
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="text-xs border border-gray-300 w-full min-w-[1200px]">
            <thead>
              <tr>
                {fixedRecommendTableHeaders
                  .filter((key) => {
                    return sortedRecommendList.some((item: any) =>
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
              {sortedRecommendList.map((item, ridx) => {
                return (
                  <tr
                    key={ridx}
                    className="hover:bg-blue-100 cursor-pointer"
                    onClick={() => onSelect(name, item.code, item, item.id)}
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
                        if (
                          key === "price" ||
                          key === "salePrice" ||
                          key === "postFee"
                        ) {
                          if (value !== null && value !== undefined) {
                            displayValue = Number(value).toLocaleString();
                          } else {
                            displayValue = "-";
                          }
                        } else {
                          displayValue =
                            value !== null && value !== undefined
                              ? String(value)
                              : "-";
                        }

                        return (
                          <td
                            key={key}
                            className={`border border-gray-200 px-2 py-1 break-all text-black whitespace-pre-line min-w-[85px] ${
                              key === "code" || key === "pkg"
                                ? "text-center"
                                : ""
                            } ${
                              key === "price" ||
                              key === "salePrice" ||
                              key === "postFee"
                                ? "text-right"
                                : ""
                            }`}
                          >
                            {key === "etc" && onDelete ? (
                              <button
                                type="button"
                                className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded"
                                onClick={(e) => {
                                  e.stopPropagation(); // 행 클릭 이벤트 방지
                                  if (
                                    confirm(
                                      `"${item.name}" 상품을 삭제하시겠습니까?`
                                    )
                                  ) {
                                    onDelete(item);
                                  }
                                }}
                              >
                                삭제
                              </button>
                            ) : (
                              displayValue
                            )}
                          </td>
                        );
                      })}
                  </tr>
                );
              })}
            </tbody>
          </table>
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
