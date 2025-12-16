"use client";

import {useState, useMemo, useCallback, memo} from "react";
import Pagination from "./Pagination";
import DirectInputModal from "./DirectInputModal";
import {fieldNameMap} from "@/constants/fieldMappings";
import {PRODUCT_FIELD_ORDER} from "@/constants/productFields";
import {getColumnWidth} from "@/utils/table";
import type {Product} from "@/types/api";

interface ProductsTableProps {
  loading: boolean;
  products: Product[];
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onDataUpdate: () => void;
}

const ProductsTable = memo(function ProductsTable({
  loading,
  products,
  currentPage,
  totalPages,
  onPageChange,
  onDataUpdate,
}: ProductsTableProps) {
  const [directInputModal, setDirectInputModal] = useState({
    open: false,
    fields: [] as string[],
    values: {} as {[key: string]: string},
  });
  const [editDirectInputModal, setEditDirectInputModal] = useState({
    open: false,
    fields: [] as string[],
    values: {} as {[key: string]: string},
  });
  const [saving, setSaving] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // 필드 순서 정의
  const fieldOrder = [...PRODUCT_FIELD_ORDER];

  const handleEdit = (product: Product) => {
    // Product 데이터를 DirectInputModal 형식으로 변환
    const values: {[key: string]: string} = {};
    fieldOrder.forEach((field) => {
      const value = (product as any)[field];
      if (value !== null && value !== undefined) {
        values[field] = String(value);
      } else {
        values[field] = "";
      }
    });

    setEditDirectInputModal({
      open: true,
      fields: fieldOrder,
      values,
    });
  };

  const handleAdd = () => {
    // DirectInputModal 열기
    setDirectInputModal({
      open: true,
      fields: fieldOrder,
      values: {},
    });
  };

  const handleCloseEditDirectInputModal = () => {
    setEditDirectInputModal({
      open: false,
      fields: [],
      values: {},
    });
  };

  const handleEditDirectInputValueChange = (key: string, value: string) => {
    setEditDirectInputModal((prev) => ({
      ...prev,
      values: {...prev.values, [key]: value},
    }));
  };

  const handleCloseDirectInputModal = () => {
    setDirectInputModal({
      open: false,
      fields: [],
      values: {},
    });
  };

  const handleDirectInputValueChange = (key: string, value: string) => {
    setDirectInputModal((prev) => ({
      ...prev,
      values: {...prev.values, [key]: value},
    }));
  };

  const handleSaveDirectInput = async () => {
    const {transformProductData} = await import("@/utils/product");
    const {createProduct} = await import("@/utils/api");
    const values = directInputModal.values;

    // 필수값: name, code는 필수
    if (!values.name || !values.code) {
      alert("상품명과 매핑코드는 필수입니다.");
      return;
    }

    setSaving(true);
    try {
      const requestBody = transformProductData(values);
      const result = await createProduct(requestBody);

      if (result.success) {
        alert(
          "상품이 성공적으로 등록되었습니다. 새로고침 버튼을 눌러 목록을 업데이트하세요."
        );
        handleCloseDirectInputModal();
        // onDataUpdate 호출 제거 - 리렌더링 방지
      } else {
        throw new Error(result.error || "저장 실패");
      }
    } catch (error) {
      console.error("저장 실패:", error);
      const errorMessage = error instanceof Error ? error.message : "저장 실패";
      alert(`저장 실패: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEditDirectInput = async () => {
    const {transformProductData} = await import("@/utils/product");
    const {createProduct} = await import("@/utils/api");
    const values = editDirectInputModal.values;

    // 필수값: name, code는 필수
    if (!values.name || !values.code) {
      alert("상품명과 매핑코드는 필수입니다.");
      return;
    }

    setSaving(true);
    try {
      const requestBody = transformProductData(values);
      const result = await createProduct(requestBody);

      if (result.success) {
        alert(
          "상품이 성공적으로 수정되었습니다. 새로고침 버튼을 눌러 목록을 업데이트하세요."
        );
        handleCloseEditDirectInputModal();
        // onDataUpdate 호출 제거 - 리렌더링 방지
      } else {
        throw new Error(result.error || "저장 실패");
      }
    } catch (error) {
      console.error("저장 실패:", error);
      const errorMessage = error instanceof Error ? error.message : "저장 실패";
      alert(`저장 실패: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

  // 체크박스 관련 함수들 (메모이제이션)
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

  const handleDelete = useCallback(async () => {
    if (selectedRows.size === 0) {
      alert("삭제할 상품을 선택해주세요.");
      return;
    }

    if (!confirm(`선택한 ${selectedRows.size}개의 상품을 삭제하시겠습니까?`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const {deleteProducts} = await import("@/utils/api");
      const result = await deleteProducts(Array.from(selectedRows));

      if (result.success) {
        alert(result.message || "삭제되었습니다.");
        setSelectedRows(new Set());
        onDataUpdate();
      } else {
        throw new Error(result.error || "삭제 실패");
      }
    } catch (error) {
      console.error("삭제 실패:", error);
      const errorMessage = error instanceof Error ? error.message : "삭제 실패";
      alert(`삭제 실패: ${errorMessage}`);
    } finally {
      setIsDeleting(false);
    }
  }, [selectedRows, onDataUpdate]);

  const isAllSelected = useMemo(() => {
    return products.length > 0 && selectedRows.size === products.length;
  }, [products.length, selectedRows.size]);

  const isIndeterminate = useMemo(() => {
    return selectedRows.size > 0 && selectedRows.size < products.length;
  }, [selectedRows.size, products.length]);

  const headers = [
    "ID",
    "내외주",
    "택배사",
    "상품명",
    "매핑코드",
    "사방넷명",
    "합포수량",
    "가격",
    "판매가",
    "택배비",
    "매입처",
    "세금구분",
    "카테고리",
    "상품구분",
    "기타",
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
        <div className="mb-4 flex justify-between gap-2 items-end">
          <div className="text-sm text-gray-500">
            총 {products.length}개 {currentPage} / {totalPages}
          </div>
          {selectedRows.size > 0 && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded transition-colors disabled:bg-gray-400"
            >
              {isDeleting ? "삭제 중..." : `${selectedRows.size}건 삭제`}
            </button>
          )}
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded transition-colors"
          >
            상품 등록
          </button>
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
                  style={{width: getColumnWidth(header)}}
                >
                  {header}
                </th>
              ))}
              <th className="border bg-gray-100 px-2 py-1 text-xs font-semibold">
                작업
              </th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td
                  colSpan={headers.length + 2}
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
                  <td className="border px-2 py-1 border-gray-300 text-xs text-center">
                    {product.id}
                  </td>
                  <td className="border px-2 py-1 border-gray-300 text-xs">
                    {product.type || ""}
                  </td>
                  <td className="border px-2 py-1 border-gray-300 text-xs">
                    {product.postType || ""}
                  </td>
                  <td className="border px-2 py-1 border-gray-300 text-xs">
                    {product.name}
                  </td>
                  <td className="border px-2 py-1 border-gray-300 text-xs text-center">
                    {product.code}
                  </td>
                  <td className="border px-2 py-1 border-gray-300 text-xs">
                    {product.sabangName || ""}
                  </td>
                  <td className="border px-2 py-1 border-gray-300 text-xs text-right">
                    {product.pkg || ""}
                  </td>
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
                    {product.purchase || ""}
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
                  <td className="border px-2 py-1 border-gray-300 text-xs">
                    {product.etc || ""}
                  </td>
                  <td className="border px-2 py-1 border-gray-300 text-xs text-center">
                    <button
                      onClick={() => handleEdit(product)}
                      className="px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded"
                    >
                      수정
                    </button>
                  </td>
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

      <DirectInputModal
        open={directInputModal.open}
        fields={directInputModal.fields}
        values={directInputModal.values}
        fieldNameMap={fieldNameMap}
        onClose={handleCloseDirectInputModal}
        onSave={handleSaveDirectInput}
        onValueChange={handleDirectInputValueChange}
        nameReadOnly={false}
      />

      <DirectInputModal
        open={editDirectInputModal.open}
        fields={editDirectInputModal.fields}
        values={editDirectInputModal.values}
        fieldNameMap={fieldNameMap}
        onClose={handleCloseEditDirectInputModal}
        onSave={handleSaveEditDirectInput}
        onValueChange={handleEditDirectInputValueChange}
      />
    </>
  );
});

export default ProductsTable;
