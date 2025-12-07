import {useState, useEffect, useCallback} from "react";

interface Filters {
  types: string[];
  postTypes: string[];
  vendors: string[];
}

// 오늘 날짜를 YYYY-MM-DD 형식으로 반환
const getTodayDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

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
  // 실제 적용되는 필터 (검색 버튼 클릭 시 적용)
  const [appliedSearchField, setAppliedSearchField] = useState<string>("");
  const [appliedSearchValue, setAppliedSearchValue] = useState<string>("");
  const [appliedUploadTimeFrom, setAppliedUploadTimeFrom] =
    useState<string>(todayDate);
  const [appliedUploadTimeTo, setAppliedUploadTimeTo] =
    useState<string>(todayDate);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // 저장된 데이터 조회
  const fetchSavedData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedType) params.append("type", selectedType);
      if (selectedPostType) params.append("postType", selectedPostType);
      if (selectedVendor) params.append("vendor", selectedVendor);
      if (selectedOrderStatus)
        params.append("orderStatus", selectedOrderStatus);
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

      const response = await fetch(`/api/upload/list?${params.toString()}`);
      const result = await response.json();

      if (result.success) {
        setSavedData(result.data || []);
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
    selectedType,
    selectedPostType,
    selectedVendor,
    selectedOrderStatus,
    appliedSearchField,
    appliedSearchValue,
    appliedUploadTimeFrom,
    appliedUploadTimeTo,
  ]);

  // 초기 로드 시 오늘 날짜 필터 자동 적용
  useEffect(() => {
    // 초기 로드 시 오늘 날짜로 필터 적용
    setAppliedUploadTimeFrom(todayDate);
    setAppliedUploadTimeTo(todayDate);
  }, []);

  useEffect(() => {
    fetchSavedData();
    setCurrentPage(1); // 필터 변경 시 첫 페이지로 이동
  }, [fetchSavedData]);

  // 테이블 데이터 준비: 모든 행 데이터를 평탄화
  const tableRows = savedData.map((row: any) => {
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

  // 모든 컬럼 헤더 수집
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

  // 새창 데이터 테이블과 동일한 헤더 순서 (INTERNAL_COLUMNS 순서)
  const headerOrder = [
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
  ];

  const headers = Array.from(allHeaders).sort((a, b) => {
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

  // 페이지네이션 계산
  const totalPages = Math.ceil(tableRows.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedRows = tableRows.slice(startIndex, endIndex);

  // 검색 필터 적용 함수 (검색 버튼 클릭 시 호출)
  const applySearchFilter = useCallback(() => {
    setAppliedSearchField(searchField);
    setAppliedSearchValue(searchValue);
    setAppliedUploadTimeFrom(uploadTimeFrom);
    setAppliedUploadTimeTo(uploadTimeTo);
    setCurrentPage(1);
  }, [searchField, searchValue, uploadTimeFrom, uploadTimeTo]);

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
    setAppliedSearchField("");
    setAppliedSearchValue("");
    setAppliedUploadTimeFrom(todayDate);
    setAppliedUploadTimeTo(todayDate);
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
    appliedSearchField,
    appliedSearchValue,
    appliedUploadTimeFrom,
    appliedUploadTimeTo,
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
    headers,
    paginatedRows,
    tableRows,
    fetchSavedData,
  };
}
