"use client";

interface DataFiltersProps {
  filters: {
    types: string[];
    postTypes: string[];
    vendors: string[];
  };
  selectedType: string;
  selectedPostType: string;
  selectedVendor: string;
  selectedOrderStatus: string;
  searchField: string;
  searchValue: string;
  uploadTimeFrom: string;
  uploadTimeTo: string;
  onTypeChange: (type: string) => void;
  onPostTypeChange: (postType: string) => void;
  onVendorChange: (vendor: string) => void;
  onOrderStatusChange: (status: string) => void;
  onSearchFieldChange: (field: string) => void;
  onSearchValueChange: (value: string) => void;
  onUploadTimeFromChange: (value: string) => void;
  onUploadTimeToChange: (value: string) => void;
  onApplySearchFilter: () => void;
  onResetFilters: () => void;
}

export default function DataFilters({
  filters,
  selectedType,
  selectedPostType,
  selectedVendor,
  selectedOrderStatus,
  searchField,
  searchValue,
  uploadTimeFrom,
  uploadTimeTo,
  onTypeChange,
  onPostTypeChange,
  onVendorChange,
  onOrderStatusChange,
  onSearchFieldChange,
  onSearchValueChange,
  onUploadTimeFromChange,
  onUploadTimeToChange,
  onApplySearchFilter,
  onResetFilters,
}: DataFiltersProps) {
  return (
    <div className="mb-4 flex flex-col gap-4">
      {/* 첫 번째 줄: 기본 필터 */}
      <div className="flex gap-4 items-center flex-wrap">
        <label className="text-sm font-medium">
          내외주:
          <select
            className="ml-2 px-2 py-1 border border-gray-300 rounded"
            value={selectedType}
            onChange={(e) => onTypeChange(e.target.value)}
          >
            <option value="">전체</option>
            {filters.types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          택배사:
          <select
            className="ml-2 px-2 py-1 border border-gray-300 rounded"
            value={selectedPostType}
            onChange={(e) => onPostTypeChange(e.target.value)}
          >
            <option value="">전체</option>
            {filters.postTypes.map((postType) => (
              <option key={postType} value={postType}>
                {postType}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          업체명:
          <select
            className="ml-2 px-2 py-1 border border-gray-300 rounded"
            value={selectedVendor}
            onChange={(e) => onVendorChange(e.target.value)}
          >
            <option value="">전체</option>
            {filters.vendors.map((vendor) => (
              <option key={vendor} value={vendor}>
                {vendor}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          주문상태:
          <select
            className="ml-2 px-2 py-1 border border-gray-300 rounded"
            value={selectedOrderStatus}
            onChange={(e) => onOrderStatusChange(e.target.value)}
          >
            <option value="공급중">공급중</option>
            <option value="취소">취소</option>
          </select>
        </label>
      </div>

      {/* 두 번째 줄: 업로드 일자, 검색 필터, 버튼 */}
      <div className="flex gap-4 items-center flex-wrap">
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
        <label className="text-sm font-medium">
          검색:
          <select
            className="ml-2 px-2 py-1 border border-gray-300 rounded"
            value={searchField}
            onChange={(e) => onSearchFieldChange(e.target.value)}
          >
            <option value="">선택</option>
            <option value="수취인명">수취인명</option>
            <option value="주문자명">주문자명</option>
            <option value="상품명">상품명</option>
            <option value="매핑코드">매핑코드</option>
          </select>
          <input
            type="text"
            className="ml-2 px-2 py-1 border border-gray-300 rounded"
            placeholder="검색어 입력"
            value={searchValue}
            onChange={(e) => onSearchValueChange(e.target.value)}
            disabled={!searchField}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchField && searchValue) {
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
