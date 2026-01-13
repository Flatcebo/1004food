"use client";

import {useEffect, useState, useRef, useMemo, useCallback} from "react";
import {useLoadingStore} from "@/stores/loadingStore";
import MultiSelectDropdown from "@/components/MultiSelectDropdown";
import LoadingOverlay from "@/components/LoadingOverlay";
import {IoAdd, IoTrash, IoClose} from "react-icons/io5";

interface Mall {
  id: number;
  name: string;
  code: string;
}

interface Product {
  code: string;
  displayName: string;
  sabangName: string | null;
  name: string;
  salePrice: number | null;
}

interface Promotion {
  id: number;
  mallId: number;
  mallName: string;
  productCode: string;
  discountRate: number | null;
  eventPrice: number | null;
  createdAt: string;
  updatedAt: string;
}

export default function MallPromotionsPage() {
  const [malls, setMalls] = useState<Mall[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mallSearchValue, setMallSearchValue] = useState<string>("");
  const [selectedMallId, setSelectedMallId] = useState<number | null>(null);
  const [selectedProductCode, setSelectedProductCode] = useState<string>("");
  const [discountRate, setDiscountRate] = useState<string>("");
  const [eventPrice, setEventPrice] = useState<string>("");
  const [productNameSearchValue, setProductNameSearchValue] =
    useState<string>("");
  const [productCodeSearchValue, setProductCodeSearchValue] =
    useState<string>("");
  const [debouncedProductNameSearch, setDebouncedProductNameSearch] =
    useState<string>("");
  const [debouncedProductCodeSearch, setDebouncedProductCodeSearch] =
    useState<string>("");
  const [isProductNameDropdownOpen, setIsProductNameDropdownOpen] =
    useState(false);
  const [isProductCodeDropdownOpen, setIsProductCodeDropdownOpen] =
    useState(false);
  const productNameDropdownRef = useRef<HTMLDivElement>(null);
  const productCodeDropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const {isLoading, title, message, subMessage, startLoading, stopLoading} =
    useLoadingStore();

  // mall 목록 조회
  useEffect(() => {
    const loadMalls = async () => {
      try {
        const response = await fetch("/api/mall?limit=1000");
        const result = await response.json();
        if (result.success) {
          // 가나다 순으로 정렬
          const sortedMalls = (result.data || []).sort((a: Mall, b: Mall) =>
            a.name.localeCompare(b.name, "ko")
          );
          setMalls(sortedMalls);
        }
      } catch (error) {
        console.error("mall 목록 조회 실패:", error);
      }
    };
    loadMalls();
  }, []);

  // 행사가 목록 조회
  useEffect(() => {
    const loadPromotions = async () => {
      try {
        const response = await fetch("/api/mall-promotions");
        const result = await response.json();
        if (result.success) {
          setPromotions(result.data || []);
        }
      } catch (error) {
        console.error("행사가 목록 조회 실패:", error);
      }
    };
    loadPromotions();
  }, []);

  // 상품 목록 조회
  useEffect(() => {
    const loadProducts = async () => {
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

      try {
        const response = await fetch("/api/mall-promotions/products", {
          headers,
        });
        const result = await response.json();
        if (result.success) {
          setProducts(result.data || []);
        }
      } catch (error) {
        console.error("상품 목록 조회 실패:", error);
      }
    };
    loadProducts();
  }, []);

  // 모달 열기
  const handleOpenModal = (mallId: number) => {
    setSelectedMallId(mallId);
    setSelectedProductCode("");
    setDiscountRate("");
    setEventPrice("");
    setProductNameSearchValue("");
    setProductCodeSearchValue("");
    setIsModalOpen(true);
  };

  // 모달 닫기
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedMallId(null);
    setSelectedProductCode("");
    setDiscountRate("");
    setEventPrice("");
    setProductNameSearchValue("");
    setProductCodeSearchValue("");
  };

  // 행사가 저장
  const handleSavePromotion = async () => {
    if (!selectedMallId || !selectedProductCode) {
      alert("업체와 상품을 선택해주세요.");
      return;
    }

    if (!discountRate && !eventPrice) {
      alert("할인율 또는 행사가를 입력해주세요.");
      return;
    }

    startLoading("행사가 저장", "저장 중입니다...", "");

    try {
      const response = await fetch("/api/mall-promotions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mallId: selectedMallId,
          productCode: selectedProductCode,
          discountRate: discountRate ? parseFloat(discountRate) : null,
          eventPrice: eventPrice ? parseInt(eventPrice) : null,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // 목록 새로고침
        const listResponse = await fetch("/api/mall-promotions");
        const listResult = await listResponse.json();
        if (listResult.success) {
          setPromotions(listResult.data || []);
        }
        handleCloseModal();
        alert("행사가가 저장되었습니다.");
      } else {
        alert(`저장 실패: ${result.error}`);
      }
    } catch (error) {
      console.error("행사가 저장 실패:", error);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      stopLoading();
    }
  };

  // 행사가 삭제
  const handleDeletePromotion = async (id: number) => {
    if (!confirm("정말 삭제하시겠습니까?")) {
      return;
    }

    startLoading("행사가 삭제", "삭제 중입니다...", "");

    try {
      const response = await fetch(`/api/mall-promotions?id=${id}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (result.success) {
        // 목록 새로고침
        const listResponse = await fetch("/api/mall-promotions");
        const listResult = await listResponse.json();
        if (listResult.success) {
          setPromotions(listResult.data || []);
        }
        alert("행사가가 삭제되었습니다.");
      } else {
        alert(`삭제 실패: ${result.error}`);
      }
    } catch (error) {
      console.error("행사가 삭제 실패:", error);
      alert("삭제 중 오류가 발생했습니다.");
    } finally {
      stopLoading();
    }
  };

  // 할인율 입력 시 행사가 계산
  const handleDiscountRateChange = (value: string) => {
    setDiscountRate(value);
    if (value && selectedProductCode) {
      const product = products.find((p) => p.code === selectedProductCode);
      if (product && product.salePrice) {
        const rate = parseFloat(value);
        if (!isNaN(rate) && rate >= 0 && rate <= 100) {
          const calculatedPrice = Math.round(
            product.salePrice * (1 - rate / 100)
          );
          setEventPrice(calculatedPrice.toString());
        }
      }
    }
  };

  // 행사가 입력 시 할인율 초기화
  const handleEventPriceChange = (value: string) => {
    setEventPrice(value);
    if (value) {
      setDiscountRate("");
    }
  };

  // 디바운싱: 입력이 멈춘 후에만 필터링
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      setDebouncedProductNameSearch(productNameSearchValue);
      setDebouncedProductCodeSearch(productCodeSearchValue);
    }, 150); // 150ms 디바운스

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [productNameSearchValue, productCodeSearchValue]);

  // 상품명으로 필터링 (메모이제이션)
  const filteredProductsByName = useMemo(() => {
    if (!debouncedProductNameSearch) {
      return products.slice(0, 100); // 검색어가 없으면 최대 100개만 표시
    }
    const searchLower = debouncedProductNameSearch.toLowerCase();
    return products
      .filter((product) =>
        product.displayName.toLowerCase().includes(searchLower)
      )
      .slice(0, 100); // 최대 100개만 표시
  }, [products, debouncedProductNameSearch]);

  // 매핑코드로 필터링 (메모이제이션)
  const filteredProductsByCode = useMemo(() => {
    if (!debouncedProductCodeSearch) {
      return products.slice(0, 100); // 검색어가 없으면 최대 100개만 표시
    }
    const searchLower = debouncedProductCodeSearch.toLowerCase();
    return products
      .filter((product) => product.code.toLowerCase().includes(searchLower))
      .slice(0, 100); // 최대 100개만 표시
  }, [products, debouncedProductCodeSearch]);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        productNameDropdownRef.current &&
        !productNameDropdownRef.current.contains(event.target as Node)
      ) {
        setIsProductNameDropdownOpen(false);
      }
      if (
        productCodeDropdownRef.current &&
        !productCodeDropdownRef.current.contains(event.target as Node)
      ) {
        setIsProductCodeDropdownOpen(false);
      }
    };

    if (isProductNameDropdownOpen || isProductCodeDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isProductNameDropdownOpen, isProductCodeDropdownOpen]);

  // 업체별로 그룹화
  const promotionsByMall = promotions.reduce((acc, promotion) => {
    if (!acc[promotion.mallId]) {
      acc[promotion.mallId] = [];
    }
    acc[promotion.mallId].push(promotion);
    return acc;
  }, {} as Record<number, Promotion[]>);

  // 업체 검색 필터링 (가나다 순 유지)
  const filteredMalls = useMemo(() => {
    const filtered = malls.filter((mall) => {
      if (!mallSearchValue) return true;
      const searchLower = mallSearchValue.toLowerCase();
      return (
        mall.name.toLowerCase().includes(searchLower) ||
        mall.code.toLowerCase().includes(searchLower)
      );
    });
    // 가나다 순으로 정렬
    return filtered.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [malls, mallSearchValue]);

  return (
    <div className="w-full h-full flex flex-col items-start justify-start px-3 py-4">
      <LoadingOverlay
        isOpen={isLoading}
        title={title}
        message={message}
        subMessage={subMessage}
      />

      <div className="w-full">
        {/* 업체 목록 */}
        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="flex items-center justify-between mb-3">
            {/* <h2 className="text-lg font-bold">업체 목록</h2> */}
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                className="px-2 py-1.5 text-sm border border-gray-300 rounded w-56"
                placeholder="업체명 또는 코드로 검색"
                value={mallSearchValue}
                onChange={(e) => setMallSearchValue(e.target.value)}
              />
              {mallSearchValue && (
                <button
                  className="px-2 py-1.5 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                  onClick={() => setMallSearchValue("")}
                >
                  초기화
                </button>
              )}
            </div>
          </div>
          {filteredMalls.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-500">
              검색 결과가 없습니다.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMalls.map((mall) => {
                const mallPromotions = promotionsByMall[mall.id] || [];
                return (
                  <div
                    key={mall.id}
                    className="border border-gray-200 rounded-lg p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="font-bold text-base">{mall.name}</h3>
                        <p className="text-xs text-gray-500">
                          행사가 설정: {mallPromotions.length}개
                        </p>
                      </div>
                      <button
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1.5"
                        onClick={() => handleOpenModal(mall.id)}
                      >
                        <IoAdd className="w-4 h-4" />
                        추가
                      </button>
                    </div>

                    {/* 행사가 목록 */}
                    {mallPromotions.length > 0 && (
                      <div className="mt-3">
                        <table className="w-full border-collapse text-sm">
                          <thead>
                            <tr className="bg-gray-100">
                              <th className="border border-gray-300 px-2 py-1.5 text-left text-xs font-medium">
                                상품명(사방넷명)
                              </th>
                              <th className="border border-gray-300 px-2 py-1.5 text-left text-xs font-medium">
                                매핑코드
                              </th>
                              <th className="border border-gray-300 px-2 py-1.5 text-left text-xs font-medium">
                                할인율
                              </th>
                              <th className="border border-gray-300 px-2 py-1.5 text-left text-xs font-medium">
                                행사가
                              </th>
                              <th className="border border-gray-300 px-2 py-1.5 text-left text-xs font-medium">
                                작업
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {mallPromotions.map((promotion) => {
                              const product = products.find(
                                (p) => p.code === promotion.productCode
                              );
                              const displayName =
                                product?.displayName || promotion.productCode;
                              return (
                                <tr key={promotion.id}>
                                  <td className="border border-gray-300 px-2 py-1.5">
                                    {displayName}
                                  </td>
                                  <td className="border border-gray-300 px-2 py-1.5">
                                    {promotion.productCode}
                                  </td>
                                  <td className="border border-gray-300 px-2 py-1.5">
                                    {promotion.discountRate !== null
                                      ? `${promotion.discountRate}%`
                                      : "-"}
                                  </td>
                                  <td className="border border-gray-300 px-2 py-1.5">
                                    {promotion.eventPrice !== null ? (
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-gray-700 text-sm">
                                          {product?.salePrice?.toLocaleString() ||
                                            "-"}
                                          {product?.salePrice && "원"}
                                        </span>
                                        <span className="text-gray-400">
                                          =&gt;
                                        </span>
                                        <span className="font-bold text-blue-600 text-sm">
                                          {promotion.eventPrice.toLocaleString()}
                                          원
                                        </span>
                                      </div>
                                    ) : (
                                      "-"
                                    )}
                                  </td>
                                  <td className="border border-gray-300 px-2 py-1.5">
                                    <button
                                      className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                                      onClick={() =>
                                        handleDeletePromotion(promotion.id)
                                      }
                                    >
                                      삭제
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 행사가 추가 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">행사가 추가</h2>
              <button
                className="text-gray-500 hover:text-gray-700"
                onClick={handleCloseModal}
              >
                <IoClose className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {/* 업체명 */}
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  업체명
                </label>
                <input
                  type="text"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                  value={malls.find((m) => m.id === selectedMallId)?.name || ""}
                  disabled
                />
              </div>

              {/* 상품 선택 */}
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  상품 선택
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {/* 상품명 입력 */}
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">
                      상품명
                    </label>
                    <div className="relative" ref={productNameDropdownRef}>
                      <input
                        type="text"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                        placeholder="상품명 입력"
                        value={productNameSearchValue}
                        onChange={(e) => {
                          setProductNameSearchValue(e.target.value);
                          setIsProductNameDropdownOpen(true);
                        }}
                        onFocus={() => setIsProductNameDropdownOpen(true)}
                      />
                      {isProductNameDropdownOpen && (
                        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded shadow-lg max-h-48 overflow-y-auto">
                          {filteredProductsByName.length > 0 ? (
                            filteredProductsByName.map((product) => (
                              <div
                                key={product.code}
                                className="px-2 py-1.5 hover:bg-gray-100 cursor-pointer"
                                onClick={() => {
                                  setSelectedProductCode(product.code);
                                  setProductNameSearchValue(
                                    product.displayName
                                  );
                                  setProductCodeSearchValue(product.code);
                                  setIsProductNameDropdownOpen(false);
                                }}
                              >
                                <div className="font-medium text-sm">
                                  {product.displayName}
                                </div>
                                <div className="text-xs text-gray-500">
                                  매핑코드: {product.code}
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="px-2 py-1.5 text-xs text-gray-500">
                              검색 결과가 없습니다.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 매핑코드 입력 */}
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">
                      매핑코드
                    </label>
                    <div className="relative" ref={productCodeDropdownRef}>
                      <input
                        type="text"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                        placeholder="매핑코드 입력"
                        value={productCodeSearchValue}
                        onChange={(e) => {
                          setProductCodeSearchValue(e.target.value);
                          setIsProductCodeDropdownOpen(true);
                        }}
                        onFocus={() => setIsProductCodeDropdownOpen(true)}
                      />
                      {isProductCodeDropdownOpen && (
                        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded shadow-lg max-h-48 overflow-y-auto">
                          {filteredProductsByCode.length > 0 ? (
                            filteredProductsByCode.map((product) => (
                              <div
                                key={product.code}
                                className="px-2 py-1.5 hover:bg-gray-100 cursor-pointer"
                                onClick={() => {
                                  setSelectedProductCode(product.code);
                                  setProductNameSearchValue(
                                    product.displayName
                                  );
                                  setProductCodeSearchValue(product.code);
                                  setIsProductCodeDropdownOpen(false);
                                }}
                              >
                                <div className="font-medium text-sm">
                                  {product.displayName}
                                </div>
                                <div className="text-xs text-gray-500">
                                  매핑코드: {product.code}
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="px-2 py-1.5 text-xs text-gray-500">
                              검색 결과가 없습니다.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 할인율 */}
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  할인율 (%)
                </label>
                <input
                  type="number"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                  placeholder="할인율 입력 (예: 10)"
                  value={discountRate}
                  onChange={(e) => handleDiscountRateChange(e.target.value)}
                  min="0"
                  max="100"
                  step="0.01"
                />
              </div>

              {/* 행사가 */}
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  행사가 (원)
                </label>
                <input
                  type="number"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                  placeholder="행사가 입력"
                  value={eventPrice}
                  onChange={(e) => handleEventPriceChange(e.target.value)}
                  min="0"
                />
                <div className="mt-1 text-xs text-gray-500">
                  할인율을 입력하면 자동 계산되며, 행사가를 직접 입력하면
                  할인율은 무시됩니다.
                </div>
              </div>

              {/* 상품 선택 정보 및 공급가 표시 */}
              {selectedProductCode && (
                <div className="mt-2 p-2.5 bg-gray-50 rounded border border-gray-200">
                  <div className="grid grid-cols-2 gap-3 mb-2">
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">상품명</div>
                      <div className="text-xs font-medium">
                        {products.find((p) => p.code === selectedProductCode)
                          ?.displayName || "-"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">
                        매핑코드
                      </div>
                      <div className="text-xs font-medium">
                        {selectedProductCode}
                      </div>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-gray-200">
                    <div className="text-xs text-gray-500 mb-1">공급가</div>
                    {discountRate || eventPrice ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <div className="text-sm font-medium text-gray-700">
                          {products
                            .find((p) => p.code === selectedProductCode)
                            ?.salePrice?.toLocaleString() || "-"}
                          원
                        </div>
                        <div className="text-gray-400">=&gt;</div>
                        <div className="text-base font-bold text-blue-600">
                          {eventPrice
                            ? parseInt(eventPrice).toLocaleString()
                            : "-"}
                          {eventPrice && "원"}
                        </div>
                        {discountRate && eventPrice && (
                          <div className="text-xs text-gray-500">
                            (할인율 {discountRate}%)
                          </div>
                        )}
                        {eventPrice && !discountRate && (
                          <div className="text-xs text-gray-500">(행사가)</div>
                        )}
                      </div>
                    ) : (
                      <div className="text-base font-bold text-blue-600">
                        {products
                          .find((p) => p.code === selectedProductCode)
                          ?.salePrice?.toLocaleString() || "-"}
                        {products.find((p) => p.code === selectedProductCode)
                          ?.salePrice && "원"}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 버튼 */}
              <div className="flex gap-2 justify-end pt-2">
                <button
                  className="px-3 py-1.5 text-sm bg-gray-500 text-white rounded hover:bg-gray-600"
                  onClick={handleCloseModal}
                >
                  취소
                </button>
                <button
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                  onClick={handleSavePromotion}
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
