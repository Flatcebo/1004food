"use client";

import BaseFilter from "./BaseFilter";

interface DataFiltersProps {
  filters: {
    types: string[];
    postTypes: string[];
    companies: string[];
    vendors: string[];
  };
  selectedType: string;
  selectedPostType: string;
  selectedCompany: string;
  selectedVendor: string;
  selectedOrderStatus: string;
  searchField: string;
  searchValue: string;
  uploadTimeFrom: string;
  uploadTimeTo: string;
  itemsPerPage: number;
  onTypeChange: (type: string) => void;
  onPostTypeChange: (postType: string) => void;
  onCompanyChange: (company: string) => void;
  onVendorChange: (vendor: string) => void;
  onOrderStatusChange: (status: string) => void;
  onSearchFieldChange: (field: string) => void;
  onSearchValueChange: (value: string) => void;
  onUploadTimeFromChange: (value: string) => void;
  onUploadTimeToChange: (value: string) => void;
  onItemsPerPageChange: (value: number) => void;
  onApplySearchFilter: () => void;
  onResetFilters: () => void;
}

export default function DataFilters(props: DataFiltersProps) {
  return (
    <BaseFilter
      {...props}
      showCompany={true}
      showVendor={true}
      showOrderStatus={true}
      showDateRange={true}
      showItemsPerPage={true}
      searchFieldOptions={[
        {label: "선택", value: ""},
        {label: "수취인명", value: "수취인명"},
        {label: "주문자명", value: "주문자명"},
        {label: "상품명", value: "상품명"},
        {label: "매핑코드", value: "매핑코드"},
        {label: "내부코드", value: "내부코드"},
      ]}
    />
  );
}
