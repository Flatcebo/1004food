import {useState, useEffect, useCallback, useMemo} from "react";
import {fetchProducts} from "@/utils/api";

interface Product {
  id: number;
  type: string | null;
  postType: string | null;
  name: string;
  code: string;
  pkg: string | null;
  price: number | null;
  salePrice: number | null;
  postFee: number | null;
  purchase: string | null;
  billType: string | null;
  category: string | null;
  productType: string | null;
  sabangName: string | null;
  etc: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Filters {
  types: string[];
  postTypes: string[];
  categories: string[];
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filters, setFilters] = useState<Filters>({
    types: [],
    postTypes: [],
    categories: [],
  });
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedPostType, setSelectedPostType] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [searchField, setSearchField] = useState<string>("상품명");
  const [searchValue, setSearchValue] = useState<string>("");
  const [appliedSearchField, setAppliedSearchField] = useState<string>("");
  const [appliedSearchValue, setAppliedSearchValue] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // 상품 목록 조회
  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchProducts();

      if (result.success) {
        const data = result.data || [];
        setProducts(data);

        // 필터 옵션 추출 (최적화: 한 번의 순회로 처리)
        const typeSet = new Set<string>();
        const postTypeSet = new Set<string>();
        const categorySet = new Set<string>();

        for (const p of data) {
          if (p.type) typeSet.add(p.type);
          if (p.postType) postTypeSet.add(p.postType);
          if (p.category) categorySet.add(p.category);
        }

        setFilters({
          types: Array.from(typeSet).sort(),
          postTypes: Array.from(postTypeSet).sort(),
          categories: Array.from(categorySet).sort(),
        });
      } else {
        console.error("상품 목록 조회 실패:", result.error);
      }
    } catch (error) {
      console.error("상품 목록 조회 중 오류:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // 필터링된 상품 목록 (메모이제이션)
  const filteredProducts = useMemo(() => {
    const filtered = products.filter((product) => {
      // 내외주 필터
      if (selectedType && product.type !== selectedType) {
        return false;
      }
      // 택배사 필터
      if (selectedPostType && product.postType !== selectedPostType) {
        return false;
      }
      // 카테고리 필터
      if (selectedCategory && product.category !== selectedCategory) {
        return false;
      }
      // 검색 필터
      if (appliedSearchField && appliedSearchValue) {
        const searchLower = appliedSearchValue.toLowerCase();
        switch (appliedSearchField) {
          case "상품명":
            if (!product.name.toLowerCase().includes(searchLower)) {
              return false;
            }
            break;
          case "매핑코드":
            if (!product.code.toLowerCase().includes(searchLower)) {
              return false;
            }
            break;
          case "사방넷명":
            if (
              !product.sabangName ||
              !product.sabangName.toLowerCase().includes(searchLower)
            ) {
              return false;
            }
            break;
          default:
            break;
        }
      }
      return true;
    });

    // createdAt 최근순으로 정렬 (필터링 후에도 정렬 유지)
    return filtered.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      if (dateB !== dateA) {
        return dateB - dateA; // 최근순 (내림차순)
      }
      return b.id - a.id; // createdAt이 같으면 id 역순
    });
  }, [products, selectedType, selectedPostType, selectedCategory, appliedSearchField, appliedSearchValue]);

  // 페이지네이션 계산 (메모이제이션)
  const totalPages = useMemo(() => {
    return Math.ceil(filteredProducts.length / itemsPerPage);
  }, [filteredProducts.length, itemsPerPage]);

  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredProducts.slice(startIndex, endIndex);
  }, [filteredProducts, currentPage, itemsPerPage]);

  // 검색 필터 적용 함수
  const applySearchFilter = useCallback(() => {
    setAppliedSearchField(searchField);
    setAppliedSearchValue(searchValue);
    setCurrentPage(1);
  }, [searchField, searchValue]);

  // 필터 초기화 함수
  const resetFilters = useCallback(() => {
    setSelectedType("");
    setSelectedPostType("");
    setSelectedCategory("");
    setSearchField("상품명");
    setSearchValue("");
    setAppliedSearchField("");
    setAppliedSearchValue("");
    setItemsPerPage(20);
    setCurrentPage(1);
  }, []);

  return {
    products,
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
    filteredProducts,
    itemsPerPage,
    setItemsPerPage,
    fetchProducts: loadProducts,
  };
}

