"use client";

import {useProducts} from "@/hooks/useProducts";
import ProductFilters from "@/components/ProductFilters";
import ProductsBatchEditTable from "@/components/ProductsBatchEditTable";
import ActiveFilters from "@/components/ActiveFilters";

export default function ProductsEditPage() {
  const {
    filters,
    selectedType,
    setSelectedType,
    selectedPostType,
    setSelectedPostType,
    selectedCategory,
    setSelectedCategory,
    searchField,
    setSearchField,
    searchValue,
    setSearchValue,
    appliedSearchField,
    appliedSearchValue,
    applySearchFilter,
    resetFilters,
    loading,
    currentPage,
    setCurrentPage,
    totalPages,
    paginatedProducts,
    itemsPerPage,
    setItemsPerPage,
    fetchProducts,
  } = useProducts();

  // 필터 제거 함수
  const handleRemoveFilter = (filterType: string) => {
    switch (filterType) {
      case "type":
        setSelectedType("");
        break;
      case "postType":
        setSelectedPostType("");
        break;
      case "category":
        setSelectedCategory("");
        break;
      case "search":
        setSearchField("상품명");
        setSearchValue("");
        applySearchFilter();
        break;
    }
  };

  // 활성 필터 목록 생성
  const activeFilters = [];
  if (selectedType) {
    activeFilters.push({
      type: "type",
      label: "내외주",
      value: selectedType,
    });
  }
  if (selectedPostType) {
    activeFilters.push({
      type: "postType",
      label: "택배사",
      value: selectedPostType,
    });
  }
  if (selectedCategory) {
    activeFilters.push({
      type: "category",
      label: "카테고리",
      value: selectedCategory,
    });
  }
  if (appliedSearchField && appliedSearchValue) {
    activeFilters.push({
      type: "search",
      label: appliedSearchField,
      value: appliedSearchValue,
    });
  }

  return (
    <div className="w-full h-full flex flex-col items-start justify-start pt-4 px-4">
      <div className="w-full bg-[#ffffff] rounded-lg px-8 shadow-md pb-12">
        {/* 상품 일괄 수정 테이블 */}
        <div className="w-full mt-6">
          <div className="mb-4 flex gap-4 items-center justify-between">
            <h2 className="text-xl font-bold">상품 일괄 수정</h2>

            <div className="flex gap-2 items-center mb-0">
              <button
                className="px-5 py-2 bg-gray-500 text-white text-sm rounded hover:bg-gray-600"
                onClick={fetchProducts}
                disabled={loading}
              >
                새로고침
              </button>
            </div>
          </div>

          <ProductFilters
            filters={filters}
            selectedType={selectedType}
            selectedPostType={selectedPostType}
            selectedCategory={selectedCategory}
            searchField={searchField}
            searchValue={searchValue}
            itemsPerPage={itemsPerPage}
            onTypeChange={setSelectedType}
            onPostTypeChange={setSelectedPostType}
            onCategoryChange={setSelectedCategory}
            onSearchFieldChange={setSearchField}
            onSearchValueChange={setSearchValue}
            onItemsPerPageChange={setItemsPerPage}
            onApplySearchFilter={applySearchFilter}
            onResetFilters={resetFilters}
          />

          {activeFilters.length > 0 && (
            <ActiveFilters
              filters={activeFilters}
              onRemoveFilter={handleRemoveFilter}
            />
          )}

          <ProductsBatchEditTable
            loading={loading}
            products={paginatedProducts}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            onDataUpdate={fetchProducts}
            filters={filters}
          />
        </div>
      </div>
    </div>
  );
}
