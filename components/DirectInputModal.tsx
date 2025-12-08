"use client";

import {useState, useEffect, useRef, useCallback, useMemo} from "react";
import {
  TYPE_OPTIONS,
  POST_TYPE_OPTIONS,
  BILL_TYPE_OPTIONS,
  PRODUCT_TYPE_OPTIONS,
  CATEGORY_OPTIONS,
} from "@/constants/productFields";
import {searchPurchase} from "@/utils/api";
import type {PurchaseOption} from "@/types/api";

interface DirectInputModalProps {
  open: boolean;
  fields: string[];
  values: {[key: string]: string};
  fieldNameMap: {[key: string]: string};
  onClose: () => void;
  onSave: () => void;
  onValueChange: (key: string, value: string) => void;
  nameReadOnly?: boolean; // 상품명 입력란을 읽기 전용으로 할지 여부
}

export default function DirectInputModal({
  open,
  fields,
  values,
  fieldNameMap,
  onClose,
  onSave,
  onValueChange,
  nameReadOnly = true, // 기본값은 읽기 전용
}: DirectInputModalProps) {
  const [purchaseSuggestions, setPurchaseSuggestions] = useState<
    PurchaseOption[]
  >([]);
  const [showPurchaseDropdown, setShowPurchaseDropdown] = useState(false);
  const [purchaseSearchQuery, setPurchaseSearchQuery] = useState("");
  const purchaseInputRef = useRef<HTMLInputElement>(null);
  const purchaseDropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSelectingRef = useRef(false);

  // purchase 검색 함수
  const handleSearchPurchase = useCallback(async (query: string) => {
    if (!query || query.trim() === "") {
      setPurchaseSuggestions([]);
      setShowPurchaseDropdown(false);
      return;
    }

    try {
      const result = await searchPurchase(query.trim());
      if (result.success) {
        setPurchaseSuggestions(result.data || []);
        setShowPurchaseDropdown(true);
      } else {
        setPurchaseSuggestions([]);
        setShowPurchaseDropdown(false);
      }
    } catch (error) {
      console.error("구매처 검색 실패:", error);
      setPurchaseSuggestions([]);
      setShowPurchaseDropdown(false);
    }
  }, []);

  // purchase 입력 핸들러
  const handlePurchaseInputChange = useCallback(
    (value: string) => {
      setPurchaseSearchQuery(value);

      // 선택 중이 아닐 때만 onValueChange 호출
      if (!isSelectingRef.current) {
        onValueChange("purchase", value);
      }

      // 디바운싱: 300ms 후 검색
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      searchTimeoutRef.current = setTimeout(() => {
        if (!isSelectingRef.current) {
          handleSearchPurchase(value);
        }
      }, 300);
    },
    [handleSearchPurchase, onValueChange]
  );

  // purchase 선택 핸들러
  const handlePurchaseSelect = useCallback(
    (e: React.MouseEvent, purchaseName: string) => {
      e.preventDefault();
      e.stopPropagation();

      isSelectingRef.current = true;
      setPurchaseSearchQuery(purchaseName);
      onValueChange("purchase", purchaseName);
      setShowPurchaseDropdown(false);
      setPurchaseSuggestions([]);

      // 선택 완료 후 플래그 리셋
      setTimeout(() => {
        isSelectingRef.current = false;
      }, 200);
    },
    [onValueChange]
  );

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        purchaseDropdownRef.current &&
        !purchaseDropdownRef.current.contains(event.target as Node) &&
        purchaseInputRef.current &&
        !purchaseInputRef.current.contains(event.target as Node)
      ) {
        setShowPurchaseDropdown(false);
      }
    };

    if (showPurchaseDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showPurchaseDropdown]);

  // 모달이 열릴 때 purchase 값 초기화 (open 변경 시에만)
  useEffect(() => {
    if (open) {
      const purchaseValue = values.purchase || "";
      setPurchaseSearchQuery(purchaseValue);
      isSelectingRef.current = false;
    } else {
      setPurchaseSearchQuery("");
      setPurchaseSuggestions([]);
      setShowPurchaseDropdown(false);
      isSelectingRef.current = false;
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // cleanup
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
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
            onSave();
          }}
          className="w-full"
        >
          <table className="w-full text-xs mb-3 ">
            <tbody className="w-full flex flex-col gap-[10px]">
              {fields.map((key) => (
                <tr key={key} className="flex gap-[6px]">
                  <td className="pr-2 py-1 text-right font-medium text-gray-500 w-[75px]">
                    {fieldNameMap[key] || key}
                  </td>
                  <td className="w-full">
                    {key === "name" ? (
                      <input
                        type="text"
                        className={`border border-[#e1e0e0] px-2 py-1 rounded w-full text-[#333] ${
                          nameReadOnly ? "bg-gray-100" : ""
                        }`}
                        value={values.name || ""}
                        readOnly={nameReadOnly}
                        onChange={
                          nameReadOnly
                            ? undefined
                            : (e) => onValueChange(key, e.target.value)
                        }
                      />
                    ) : key === "type" ? (
                      <select
                        className="border border-[#e1e0e0] px-2 py-1 rounded w-full text-[#333]"
                        value={values[key] || ""}
                        onChange={(e) => onValueChange(key, e.target.value)}
                      >
                        {TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : key === "postType" ? (
                      <select
                        className="border border-[#e1e0e0] px-2 py-1 rounded w-full text-[#333]"
                        value={values[key] || ""}
                        onChange={(e) => onValueChange(key, e.target.value)}
                      >
                        {POST_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : key === "billType" ? (
                      <select
                        className="border border-[#e1e0e0] px-2 py-1 rounded w-full text-[#333]"
                        value={values[key] || ""}
                        onChange={(e) => onValueChange(key, e.target.value)}
                      >
                        {BILL_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : key === "productType" ? (
                      <select
                        className="border border-[#e1e0e0] px-2 py-1 rounded w-full text-[#333]"
                        value={values[key] || ""}
                        onChange={(e) => onValueChange(key, e.target.value)}
                      >
                        {PRODUCT_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : key === "category" ? (
                      <select
                        className="border border-[#e1e0e0] px-2 py-1 rounded w-full text-[#333]"
                        value={values[key] || ""}
                        onChange={(e) => onValueChange(key, e.target.value)}
                      >
                        {CATEGORY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : key === "purchase" ? (
                      <div className="relative w-full">
                        <input
                          ref={purchaseInputRef}
                          type="text"
                          className="border border-[#e1e0e0] px-2 py-1 rounded w-full text-[#333]"
                          value={purchaseSearchQuery}
                          onChange={(e) =>
                            handlePurchaseInputChange(e.target.value)
                          }
                          onFocus={() => {
                            if (
                              purchaseSuggestions.length > 0 &&
                              !isSelectingRef.current
                            ) {
                              setShowPurchaseDropdown(true);
                            }
                          }}
                          placeholder="매입처 입력 또는 선택"
                        />
                        {showPurchaseDropdown &&
                          purchaseSuggestions.length > 0 && (
                            <div
                              ref={purchaseDropdownRef}
                              className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-y-auto"
                            >
                              {purchaseSuggestions.map((option) => (
                                <div
                                  key={option.id}
                                  className="px-3 py-2 hover:bg-blue-100 cursor-pointer text-sm"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    handlePurchaseSelect(e, option.name);
                                  }}
                                >
                                  {option.name}
                                </div>
                              ))}
                            </div>
                          )}
                      </div>
                    ) : (
                      <input
                        type="text"
                        className="border border-[#e1e0e0] px-2 py-1 rounded w-full text-[#333]"
                        value={values[key] || ""}
                        onChange={(e) => onValueChange(key, e.target.value)}
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
              onClick={onClose}
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
          onClick={onClose}
        >
          ×
        </button>
      </div>
    </div>
  );
}
