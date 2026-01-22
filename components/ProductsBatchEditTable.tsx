"use client";

import {useState, useMemo, useCallback, memo} from "react";
import Pagination from "./Pagination";
import {getProductsColumnWidth} from "@/utils/table";
import type {Product} from "@/types/api";
import {
  POST_TYPE_OPTIONS,
  BILL_TYPE_OPTIONS,
  PRODUCT_TYPE_OPTIONS,
} from "@/constants/productFields";

interface ProductsBatchEditTableProps {
  loading: boolean;
  products: Product[];
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onDataUpdate: () => void;
  filters: {
    types: string[];
    postTypes: string[];
    categories: string[];
  };
}

const ProductsBatchEditTable = memo(function ProductsBatchEditTable({
  loading,
  products,
  currentPage,
  totalPages,
  onPageChange,
  onDataUpdate,
  filters,
}: ProductsBatchEditTableProps) {
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [isUpdating, setIsUpdating] = useState(false);

  // 일괄 수정할 필드 값들
  const [batchUpdates, setBatchUpdates] = useState<{
    type?: string;
    postType?: string;
    category?: string;
    billType?: string;
    productType?: string;
    pkg?: string;
    price?: string;
    salePrice?: string;
    postFee?: string;
    purchase?: string;
    etc?: string;
  }>({});

  // 체크박스 관련 함수들
  const handleSelectAll = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.checked) {
        const allIds = new Set(products.map((p) => p.id));
        setSelectedRows(allIds);
      } else {
        setSelectedRows(new Set());
      }
    },
    [products]
  );

  const handleSelectRow = useCallback((id: number) => {
    setSelectedRows((prev) => {
      const newSelected = new Set(prev);
      if (newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        newSelected.add(id);
      }
      return newSelected;
    });
  }, []);

  // 일괄 수정 필드 변경
  const handleBatchUpdateChange = useCallback(
    (field: string, value: string) => {
      setBatchUpdates((prev) => ({
        ...prev,
        [field]: value === "" ? undefined : value,
      }));
    },
    []
  );

  // 일괄 수정 실행
  const handleBatchUpdate = useCallback(async () => {
    if (selectedRows.size === 0) {
      alert("수정할 상품을 선택해주세요.");
      return;
    }

    // 빈 값 제거
    const updates: any = {};
    for (const [key, value] of Object.entries(batchUpdates)) {
      if (value !== undefined && value !== null && value !== "") {
        // 숫자 필드는 숫자로 변환
        if (key === "price" || key === "salePrice" || key === "postFee") {
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            updates[key] = numValue;
          }
        } else {
          updates[key] = value;
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      alert("수정할 필드를 입력해주세요.");
      return;
    }

    if (
      !confirm(
        `선택한 ${
          selectedRows.size
        }개의 상품을 수정하시겠습니까?\n수정할 필드: ${Object.keys(
          updates
        ).join(", ")}`
      )
    ) {
      return;
    }

    setIsUpdating(true);
    try {
      const selectedIds = Array.from(selectedRows);
      // console.log("일괄 수정 요청:", {selectedIds, updates});

      const {batchUpdateProducts} = await import("@/utils/api");
      const result = await batchUpdateProducts(selectedIds, updates);

      // console.log("일괄 수정 결과:", result);

      if (result.success) {
        alert(result.message || "수정되었습니다.");
        setSelectedRows(new Set());
        setBatchUpdates({});
        onDataUpdate();
      } else {
        throw new Error(result.error || "수정 실패");
      }
    } catch (error) {
      console.error("일괄 수정 실패:", error);
      const errorMessage = error instanceof Error ? error.message : "수정 실패";
      alert(`수정 실패: ${errorMessage}`);
    } finally {
      setIsUpdating(false);
    }
  }, [selectedRows, batchUpdates, onDataUpdate]);

  const isAllSelected = useMemo(() => {
    return products.length > 0 && selectedRows.size === products.length;
  }, [products.length, selectedRows.size]);

  const isIndeterminate = useMemo(() => {
    return selectedRows.size > 0 && selectedRows.size < products.length;
  }, [selectedRows.size, products.length]);

  const headers = [
    // "ID",
    "매입처",
    "내외주",
    "택배사",
    "매핑코드",
    "상품명",
    "사방넷명",
    "원가",
    "판매가",
    // "공급단가",
    "택배비",
    "세금구분",
    "카테고리",
    "상품구분",
    // "기타",
  ];

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center py-8">
        <div className="flex items-center justify-center gap-2 text-gray-500">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
          <span>데이터를 불러오는 중...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="w-full overflow-x-auto">
        {/* 일괄 수정 컨트롤 */}
        <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="mb-3">
            <h3 className="text-sm font-semibold mb-2">
              일괄 수정 (선택한 상품에 적용)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">내외주</label>
                <select
                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                  value={batchUpdates.type || ""}
                  onChange={(e) =>
                    handleBatchUpdateChange("type", e.target.value)
                  }
                >
                  <option value="">변경 안함</option>
                  <option value="내주">내주</option>
                  <option value="외주">외주</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">택배사</label>
                <select
                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                  value={batchUpdates.postType || ""}
                  onChange={(e) =>
                    handleBatchUpdateChange("postType", e.target.value)
                  }
                >
                  <option value="">변경 안함</option>
                  {POST_TYPE_OPTIONS.filter((opt) => opt.value).map(
                    (option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    )
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  카테고리
                </label>
                <select
                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                  value={batchUpdates.category || ""}
                  onChange={(e) =>
                    handleBatchUpdateChange("category", e.target.value)
                  }
                >
                  <option value="">변경 안함</option>
                  {filters.categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  세금구분
                </label>
                <select
                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                  value={batchUpdates.billType || ""}
                  onChange={(e) =>
                    handleBatchUpdateChange("billType", e.target.value)
                  }
                >
                  <option value="">변경 안함</option>
                  {BILL_TYPE_OPTIONS.filter((opt) => opt.value).map(
                    (option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    )
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  상품구분
                </label>
                <select
                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                  value={batchUpdates.productType || ""}
                  onChange={(e) =>
                    handleBatchUpdateChange("productType", e.target.value)
                  }
                >
                  <option value="">변경 안함</option>
                  {PRODUCT_TYPE_OPTIONS.filter((opt) => opt.value).map(
                    (option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    )
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  합포수량
                </label>
                <input
                  type="text"
                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                  value={batchUpdates.pkg || ""}
                  onChange={(e) =>
                    handleBatchUpdateChange("pkg", e.target.value)
                  }
                  placeholder="변경 안함"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">원가</label>
                <input
                  type="number"
                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                  value={batchUpdates.price || ""}
                  onChange={(e) =>
                    handleBatchUpdateChange("price", e.target.value)
                  }
                  placeholder="변경 안함"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  공급단가
                </label>
                <input
                  type="number"
                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                  value={batchUpdates.salePrice || ""}
                  onChange={(e) =>
                    handleBatchUpdateChange("salePrice", e.target.value)
                  }
                  placeholder="변경 안함"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">택배비</label>
                <input
                  type="number"
                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                  value={batchUpdates.postFee || ""}
                  onChange={(e) =>
                    handleBatchUpdateChange("postFee", e.target.value)
                  }
                  placeholder="변경 안함"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">매입처</label>
                <input
                  type="text"
                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                  value={batchUpdates.purchase || ""}
                  onChange={(e) =>
                    handleBatchUpdateChange("purchase", e.target.value)
                  }
                  placeholder="변경 안함"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">기타</label>
                <input
                  type="text"
                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                  value={batchUpdates.etc || ""}
                  onChange={(e) =>
                    handleBatchUpdateChange("etc", e.target.value)
                  }
                  placeholder="변경 안함"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={handleBatchUpdate}
              disabled={isUpdating || selectedRows.size === 0}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isUpdating
                ? "수정 중..."
                : `선택한 ${selectedRows.size}개 일괄 수정`}
            </button>
          </div>
        </div>

        <div className="mb-4 flex justify-between gap-2 items-end">
          <div className="text-sm text-gray-500">
            총 {products.length}개 {currentPage} / {totalPages}
          </div>
        </div>

        <table className="table-auto border border-collapse border-gray-400 w-full min-w-[1200px]">
          <thead>
            <tr>
              <th
                className="border bg-gray-100 px-2 py-1 text-xs font-semibold"
                style={{width: "40px"}}
              >
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = isIndeterminate;
                  }}
                  onChange={handleSelectAll}
                  className="cursor-pointer"
                />
              </th>
              {headers.map((header) => (
                <th
                  key={header}
                  className="border bg-gray-100 px-2 py-1 text-xs font-semibold"
                  style={{width: getProductsColumnWidth(header)}}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td
                  colSpan={headers.length + 1}
                  className="border px-2 py-4 text-center text-gray-500"
                >
                  등록된 상품이 없습니다.
                </td>
              </tr>
            ) : (
              products.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="border px-2 py-1 border-gray-300 text-xs text-center">
                    <input
                      type="checkbox"
                      checked={selectedRows.has(product.id)}
                      onChange={() => handleSelectRow(product.id)}
                      className="cursor-pointer"
                    />
                  </td>
                  {/* <td className="border px-2 py-1 border-gray-300 text-xs text-center">
                    {product.id}
                  </td> */}
                  <td className="border px-2 py-1 border-gray-300 text-xs">
                    {product.purchase || ""}
                  </td>
                  <td className="border px-2 py-1 border-gray-300 text-xs">
                    {product.type || ""}
                  </td>
                  <td className="border px-2 py-1 border-gray-300 text-xs">
                    {product.postType || ""}
                  </td>
                  <td className="border px-2 py-1 border-gray-300 text-xs text-center">
                    {product.code}
                  </td>
                  <td className="border px-2 py-1 border-gray-300 text-xs">
                    {product.name}
                  </td>

                  <td className="border px-2 py-1 border-gray-300 text-xs">
                    {product.sabangName || ""}
                  </td>
                  {/* <td className="border px-2 py-1 border-gray-300 text-xs text-right">
                    {product.pkg || ""}
                  </td> */}
                  <td className="border px-2 py-1 border-gray-300 text-xs text-right">
                    {typeof product.price === "number"
                      ? product.price.toLocaleString()
                      : ""}
                  </td>
                  <td className="border px-2 py-1 border-gray-300 text-xs text-right">
                    {typeof product.salePrice === "number"
                      ? product.salePrice.toLocaleString()
                      : ""}
                  </td>
                  <td className="border px-2 py-1 border-gray-300 text-xs text-right">
                    {typeof product.postFee === "number"
                      ? product.postFee.toLocaleString()
                      : ""}
                  </td>

                  <td className="border px-2 py-1 border-gray-300 text-xs">
                    {product.billType || ""}
                  </td>
                  <td className="border px-2 py-1 border-gray-300 text-xs">
                    {product.category || ""}
                  </td>
                  <td className="border px-2 py-1 border-gray-300 text-xs">
                    {product.productType || ""}
                  </td>
                  {/* <td className="border px-2 py-1 border-gray-300 text-xs">
                    {product.etc || ""}
                  </td> */}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex justify-center">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </>
  );
});

export default ProductsBatchEditTable;
