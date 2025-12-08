"use client";

import BaseFilter from "./BaseFilter";

interface ProductFiltersProps {
  filters: {
    types: string[];
    postTypes: string[];
    categories: string[];
  };
  selectedType: string;
  selectedPostType: string;
  selectedCategory: string;
  searchField: string;
  searchValue: string;
  onTypeChange: (type: string) => void;
  onPostTypeChange: (postType: string) => void;
  onCategoryChange: (category: string) => void;
  onSearchFieldChange: (field: string) => void;
  onSearchValueChange: (value: string) => void;
  onApplySearchFilter: () => void;
  onResetFilters: () => void;
}

export default function ProductFilters(props: ProductFiltersProps) {
  return (
    <BaseFilter
      {...props}
      showCategory={true}
      searchFieldOptions={[
        {label: "상품명", value: "상품명"},
        {label: "매핑코드", value: "매핑코드"},
        {label: "사방넷명", value: "사방넷명"},
      ]}
    />
  );
}

