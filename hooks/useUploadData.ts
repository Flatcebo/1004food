import {useState, useEffect, useCallback, useMemo} from "react";
import {getTodayDate} from "@/utils/date";

interface Filters {
  types: string[];
  postTypes: string[];
  vendors: string[];
}

export function useUploadData() {
  const [savedData, setSavedData] = useState<any[]>([]);
  const [filters, setFilters] = useState<Filters>({
    types: [],
    postTypes: [],
    vendors: [],
  });
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedPostType, setSelectedPostType] = useState<string>("");
  const [selectedVendor, setSelectedVendor] = useState<string>("");
  const [selectedOrderStatus, setSelectedOrderStatus] =
    useState<string>("공급중");
  const [searchField, setSearchField] = useState<string>("수취인명");
  const [searchValue, setSearchValue] = useState<string>("");
  const todayDate = getTodayDate();
  const [uploadTimeFrom, setUploadTimeFrom] = useState<string>(todayDate);
  const [uploadTimeTo, setUploadTimeTo] = useState<string>(todayDate);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // 실제 적용되는 필터 (검색 버튼 클릭 시 적용)
  const [appliedType, setAppliedType] = useState<string>("");
  const [appliedPostType, setAppliedPostType] = useState<string>("");
  const [appliedVendor, setAppliedVendor] = useState<string>("");
  const [appliedOrderStatus, setAppliedOrderStatus] =
    useState<string>("공급중");
  const [appliedSearchField, setAppliedSearchField] = useState<string>("");
  const [appliedSearchValue, setAppliedSearchValue] = useState<string>("");
  const [appliedUploadTimeFrom, setAppliedUploadTimeFrom] =
    useState<string>(todayDate);
  const [appliedUploadTimeTo, setAppliedUploadTimeTo] =
    useState<string>(todayDate);
  const [appliedItemsPerPage, setAppliedItemsPerPage] = useState(20);

  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [totalCount, setTotalCount] = useState(0);

  // 저장된 데이터 조회
  const fetchSavedData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      // 적용된 필터만 사용
      if (appliedType) params.append("type", appliedType);
      if (appliedPostType) params.append("postType", appliedPostType);
      if (appliedVendor) params.append("vendor", appliedVendor);
      if (appliedOrderStatus) params.append("orderStatus", appliedOrderStatus);
      // 적용된 검색 필드와 값만 사용
      if (appliedSearchField && appliedSearchValue) {
        params.append("searchField", appliedSearchField);
        params.append("searchValue", appliedSearchValue);
      }
      // 적용된 업로드 일자만 사용
      if (appliedUploadTimeFrom)
        params.append("uploadTimeFrom", appliedUploadTimeFrom);
      if (appliedUploadTimeTo)
        params.append("uploadTimeTo", appliedUploadTimeTo);

      // 페이지네이션 파라미터 추가
      params.append("page", currentPage.toString());
      params.append("limit", appliedItemsPerPage.toString());

      const response = await fetch(`/api/upload/list?${params.toString()}`);
      const result = await response.json();

      if (result.success) {
        setSavedData(result.data || []);
        if (result.pagination) {
          setTotalCount(result.pagination.totalCount || 0);
        }
        if (result.filters) {
          setFilters(result.filters);
        }
      } else {
        console.error("데이터 조회 실패:", result.error);
      }
    } catch (error) {
      console.error("데이터 조회 중 오류:", error);
    } finally {
      setLoading(false);
    }
  }, [
    appliedType,
    appliedPostType,
    appliedVendor,
    appliedOrderStatus,
    appliedSearchField,
    appliedSearchValue,
    appliedUploadTimeFrom,
    appliedUploadTimeTo,
    appliedItemsPerPage,
    currentPage,
  ]);

  // 초기 로드 시 기본 필터 자동 적용
  useEffect(() => {
    // 초기 로드 시 기본값으로 필터 적용
    setAppliedUploadTimeFrom(todayDate);
    setAppliedUploadTimeTo(todayDate);
    setAppliedOrderStatus("공급중");
    setAppliedItemsPerPage(20);
  }, []);

  // 필터 변경 시 첫 페이지로 이동하고 데이터 조회
  useEffect(() => {
    setCurrentPage(1);
  }, [
    appliedType,
    appliedPostType,
    appliedVendor,
    appliedOrderStatus,
    appliedSearchField,
    appliedSearchValue,
    appliedUploadTimeFrom,
    appliedUploadTimeTo,
    appliedItemsPerPage,
  ]);

  // currentPage 변경 시 데이터 조회
  useEffect(() => {
    fetchSavedData();
  }, [fetchSavedData]);

  // 테이블 데이터 준비: 현재 페이지의 행 데이터를 평탄화 (메모이제이션)
  // 백엔드에서 이미 페이지네이션된 데이터를 받아오므로 그대로 사용
  const tableRows = useMemo(() => {
    return savedData.map((row: any) => {
      const flatRow = {
        id: row.id,
        file_name: row.file_name,
        upload_time: row.upload_time,
        ...(row.row_data || {}),
      };

      // 우편번호를 우편으로 통일
      if (flatRow["우편번호"] !== undefined && flatRow["우편"] === undefined) {
        flatRow["우편"] = flatRow["우편번호"];
        delete flatRow["우편번호"];
      }

      return flatRow;
    });
  }, [savedData]);

  // 헤더 순서 정의 (상수로 이동)
  const headerOrder = useMemo(
    () => [
      "id",
      "file_name",
      "upload_time",
      "업체명",
      "내외주",
      "택배사",
      "수취인명",
      "수취인 전화번호",
      "우편",
      "주소",
      "수량",
      "상품명",
      "주문자명",
      "주문자 전화번호",
      "배송메시지",
      "매핑코드",
      "주문상태",
    ],
    []
  );

  // 모든 컬럼 헤더 수집 (메모이제이션)
  const headers = useMemo(() => {
    const allHeaders = new Set<string>();
    tableRows.forEach((row: any) => {
      Object.keys(row).forEach((key) => {
        // 우편번호는 우편으로 통일
        if (key === "우편번호") {
          allHeaders.add("우편");
        } else {
          allHeaders.add(key);
        }
      });
    });

    return Array.from(allHeaders).sort((a, b) => {
      const aIndex = headerOrder.indexOf(a);
      const bIndex = headerOrder.indexOf(b);
      // 둘 다 순서에 있으면 순서대로
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      // a만 순서에 있으면 앞으로
      if (aIndex !== -1) return -1;
      // b만 순서에 있으면 앞으로
      if (bIndex !== -1) return 1;
      // 둘 다 순서에 없으면 알파벳 순서
      return a.localeCompare(b);
    });
  }, [tableRows, headerOrder]);

  // 페이지네이션 계산 (백엔드에서 받은 totalCount 사용)
  const totalPages = useMemo(() => {
    return Math.ceil(totalCount / appliedItemsPerPage);
  }, [totalCount, appliedItemsPerPage]);

  // 백엔드에서 이미 페이지네이션된 데이터를 받아오므로 그대로 사용
  const paginatedRows = useMemo(() => {
    return tableRows;
  }, [tableRows]);

  // 검색 필터 적용 함수 (검색 버튼 클릭 시 호출)
  const applySearchFilter = useCallback(() => {
    setAppliedType(selectedType);
    setAppliedPostType(selectedPostType);
    setAppliedVendor(selectedVendor);
    setAppliedOrderStatus(selectedOrderStatus);
    setAppliedSearchField(searchField);
    setAppliedSearchValue(searchValue);
    setAppliedUploadTimeFrom(uploadTimeFrom);
    setAppliedUploadTimeTo(uploadTimeTo);
    setAppliedItemsPerPage(itemsPerPage);
    setCurrentPage(1);
  }, [
    selectedType,
    selectedPostType,
    selectedVendor,
    selectedOrderStatus,
    searchField,
    searchValue,
    uploadTimeFrom,
    uploadTimeTo,
    itemsPerPage,
  ]);

  // 필터 초기화 함수
  const resetFilters = useCallback(() => {
    setSelectedType("");
    setSelectedPostType("");
    setSelectedVendor("");
    setSelectedOrderStatus("공급중");
    setSearchField("수취인명");
    setSearchValue("");
    setUploadTimeFrom(todayDate);
    setUploadTimeTo(todayDate);
    setItemsPerPage(20);
    setAppliedType("");
    setAppliedPostType("");
    setAppliedVendor("");
    setAppliedOrderStatus("공급중");
    setAppliedSearchField("");
    setAppliedSearchValue("");
    setAppliedUploadTimeFrom(todayDate);
    setAppliedUploadTimeTo(todayDate);
    setAppliedItemsPerPage(20);
    setCurrentPage(1);
  }, [todayDate]);

  return {
    savedData,
    filters,
    selectedType,
    setSelectedType,
    selectedPostType,
    setSelectedPostType,
    selectedVendor,
    setSelectedVendor,
    selectedOrderStatus,
    setSelectedOrderStatus,
    searchField,
    setSearchField,
    searchValue,
    setSearchValue,
    uploadTimeFrom,
    setUploadTimeFrom,
    uploadTimeTo,
    setUploadTimeTo,
    itemsPerPage,
    setItemsPerPage,
    appliedType,
    appliedPostType,
    appliedVendor,
    appliedOrderStatus,
    appliedSearchField,
    appliedSearchValue,
    appliedUploadTimeFrom,
    appliedUploadTimeTo,
    appliedItemsPerPage,
    setAppliedType,
    setAppliedPostType,
    setAppliedVendor,
    setAppliedOrderStatus,
    setAppliedSearchField,
    setAppliedSearchValue,
    setAppliedUploadTimeFrom,
    setAppliedUploadTimeTo,
    applySearchFilter,
    resetFilters,
    loading,
    currentPage,
    setCurrentPage,
    totalPages,
    totalCount,
    headers,
    paginatedRows,
    tableRows,
    fetchSavedData,
  };
}
