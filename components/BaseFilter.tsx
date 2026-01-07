"use client";

import MultiSelectDropdown from "./MultiSelectDropdown";

/**
 * 공통 필터 컴포넌트
 */
interface FilterOption {
  label: string;
  value: string;
}

interface BaseFilterProps {
  filters: {
    types?: string[];
    postTypes?: string[];
    categories?: string[];
    companies?: string[];
    vendors?: string[];
  };
  selectedType: string;
  selectedPostType: string;
  selectedCategory?: string;
  selectedCompany?: string[];
  selectedVendor?: string[];
  selectedOrderStatus?: string;
  searchField: string;
  searchValue: string;
  searchFieldOptions?: FilterOption[];
  uploadTimeFrom?: string;
  uploadTimeTo?: string;
  itemsPerPage?: number;
  onTypeChange: (type: string) => void;
  onPostTypeChange: (postType: string) => void;
  onCategoryChange?: (category: string) => void;
  onCompanyChange?: (companies: string[]) => void;
  onVendorChange?: (vendors: string[]) => void;
  onOrderStatusChange?: (status: string) => void;
  onSearchFieldChange: (field: string) => void;
  onSearchValueChange: (value: string) => void;
  onUploadTimeFromChange?: (value: string) => void;
  onUploadTimeToChange?: (value: string) => void;
  onItemsPerPageChange?: (value: number) => void;
  onApplySearchFilter: () => void;
  onResetFilters: () => void;
  showCategory?: boolean;
  showCompany?: boolean;
  showVendor?: boolean;
  showOrderStatus?: boolean;
  showDateRange?: boolean;
  showItemsPerPage?: boolean;
}

export default function BaseFilter({
  filters,
  selectedType,
  selectedPostType,
  selectedCategory = "",
  selectedCompany = [],
  selectedVendor = [],
  selectedOrderStatus = "",
  searchField,
  searchValue,
  searchFieldOptions = [
    {label: "상품명", value: "상품명"},
    {label: "매핑코드", value: "매핑코드"},
    {label: "사방넷명", value: "사방넷명"},
  ],
  uploadTimeFrom = "",
  uploadTimeTo = "",
  itemsPerPage = 20,
  onTypeChange,
  onPostTypeChange,
  onCategoryChange,
  onCompanyChange,
  onVendorChange,
  onOrderStatusChange,
  onSearchFieldChange,
  onSearchValueChange,
  onUploadTimeFromChange,
  onUploadTimeToChange,
  onItemsPerPageChange,
  onApplySearchFilter,
  onResetFilters,
  showCategory = false,
  showCompany = false,
  showVendor = false,
  showOrderStatus = false,
  showDateRange = false,
  showItemsPerPage = false,
}: BaseFilterProps) {
  return (
    <div className="mb-4 flex flex-col gap-4">
      {/* 첫 번째 줄: 기본 필터 */}
      <div className="flex gap-4 items-center flex-wrap">
        <label className="text-sm font-medium flex items-center">
          내외주:
          <select
            className="ml-2 px-2 py-1 border border-gray-300 rounded"
            value={selectedType}
            onChange={(e) => onTypeChange(e.target.value)}
          >
            <option value="">전체</option>
            <option value="내주">내주</option>
            <option value="외주">외주</option>
          </select>
        </label>
        <label className="text-sm font-medium flex items-center">
          택배사:
          <select
            className="ml-2 px-2 py-1 border border-gray-300 rounded"
            value={selectedPostType}
            onChange={(e) => onPostTypeChange(e.target.value)}
          >
            <option value="">전체</option>
            <option value="CJ택배">CJ택배</option>
            <option value="우체국택배">우체국택배</option>
            <option value="로젠택배">로젠택배</option>
            <option value="롯데택배">롯데택배</option>
            <option value="한진택배">한진택배</option>
            <option value="천일택배">천일택배</option>
            <option value="방문수령">방문수령</option>
          </select>
        </label>
        {showCategory && onCategoryChange && (
          <label className="text-sm font-medium">
            카테고리:
            <select
              className="ml-2 px-2 py-1 border border-gray-300 rounded"
              value={selectedCategory}
              onChange={(e) => onCategoryChange(e.target.value)}
            >
              <option value="">전체</option>
              {filters.categories?.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
        )}
        {showCompany && onCompanyChange && (
          <MultiSelectDropdown
            label="업체명"
            options={filters.companies || []}
            selectedValues={selectedCompany}
            onChange={(values) => onCompanyChange(values.map(v => String(v)))}
            placeholder="전체"
          />
        )}
        {showVendor && onVendorChange && (
          <MultiSelectDropdown
            label="매입처명"
            options={filters.vendors || []}
            selectedValues={selectedVendor}
            onChange={(values) => onVendorChange(values.map(v => String(v)))}
            placeholder="전체"
          />
        )}
        {showOrderStatus && onOrderStatusChange && (
          <label className="text-sm font-medium">
            주문상태:
            <select
              className="ml-2 px-2 py-1 border border-gray-300 rounded"
              value={selectedOrderStatus}
              onChange={(e) => onOrderStatusChange(e.target.value)}
            >
              <option value="">전체</option>
              <option value="공급중">공급중</option>
              <option value="발주서 다운">발주서 다운</option>
              <option value="사방넷 다운">사방넷 다운</option>
              <option value="배송중">배송중</option>
              <option value="취소">취소</option>
            </select>
          </label>
        )}
        {showItemsPerPage && onItemsPerPageChange && (
          <label className="text-sm font-medium">
            표시 개수:
            <select
              className="ml-2 px-2 py-1 border border-gray-300 rounded"
              value={itemsPerPage}
              onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
            >
              <option value={20}>20개</option>
              <option value={40}>40개</option>
              <option value={100}>100개</option>
              <option value={200}>200개</option>
              <option value={400}>400개</option>
              <option value={1000}>1000개</option>
            </select>
          </label>
        )}
      </div>

      {/* 두 번째 줄: 업로드 일자, 검색 필터, 버튼 */}
      <div className="flex gap-4 items-center flex-wrap">
        {showDateRange && onUploadTimeFromChange && onUploadTimeToChange && (
          <label className="text-sm font-medium">
            업로드 일자:
            <input
              type="date"
              className="ml-2 px-2 py-1 border border-gray-300 rounded"
              value={uploadTimeFrom}
              onChange={(e) => onUploadTimeFromChange(e.target.value)}
            />
            <span className="mx-2">~</span>
            <input
              type="date"
              className="px-2 py-1 border border-gray-300 rounded"
              value={uploadTimeTo}
              onChange={(e) => onUploadTimeToChange(e.target.value)}
            />
          </label>
        )}
        <label className="text-sm font-medium">
          검색:
          <select
            className="ml-2 px-2 py-1 border border-gray-300 rounded"
            value={searchField}
            onChange={(e) => onSearchFieldChange(e.target.value)}
          >
            {searchFieldOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            className="ml-2 px-2 py-1 border border-gray-300 rounded"
            placeholder="검색어 입력"
            value={searchValue}
            onChange={(e) => onSearchValueChange(e.target.value)}
            disabled={!searchField}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onApplySearchFilter();
              }
            }}
          />
        </label>
        <div className="flex gap-2 items-center">
          <button
            onClick={onApplySearchFilter}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded transition-colors"
          >
            검색
          </button>
          <button
            onClick={onResetFilters}
            className="px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white text-sm font-bold rounded transition-colors"
          >
            초기화
          </button>
        </div>
      </div>
    </div>
  );
}
