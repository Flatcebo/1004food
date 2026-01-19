import {useState, useEffect, useCallback, useMemo, useRef} from "react";
import {getTodayDate} from "@/utils/date";
import {getAuthHeaders} from "@/utils/api";

interface Filters {
  types: string[];
  postTypes: string[];
  vendors: string[];
  companies: string[];
}

export function useUploadData() {
  const [savedData, setSavedData] = useState<any[]>([]);
  const [filters, setFilters] = useState<Filters>({
    types: [],
    postTypes: [],
    vendors: [],
    companies: [],
  });
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedPostType, setSelectedPostType] = useState<string>("");
  const [selectedCompany, setSelectedCompany] = useState<string[]>([]);
  const prevSelectedCompanyRef = useRef<string[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<string[]>([]);
  const [selectedOrderStatus, setSelectedOrderStatus] =
    useState<string>("공급중");
  const [searchField, setSearchField] = useState<string>("수취인명");
  const [searchValue, setSearchValue] = useState<string>("");
  const todayDate = getTodayDate();
  const [uploadTimeFrom, setUploadTimeFrom] = useState<string>(todayDate);
  const [uploadTimeTo, setUploadTimeTo] = useState<string>(todayDate);
  const [itemsPerPage, setItemsPerPage] = useState(1000);

  // 실제 적용되는 필터 (검색 버튼 클릭 시 적용)
  const [appliedType, setAppliedType] = useState<string>("");
  const [appliedPostType, setAppliedPostType] = useState<string>("");
  const [appliedCompany, setAppliedCompany] = useState<string[]>([]);
  const [appliedVendor, setAppliedVendor] = useState<string[]>([]);
  const [appliedOrderStatus, setAppliedOrderStatus] =
    useState<string>("공급중");
  const [appliedSearchField, setAppliedSearchField] = useState<string>("");
  const [appliedSearchValue, setAppliedSearchValue] = useState<string>("");
  const [appliedUploadTimeFrom, setAppliedUploadTimeFrom] =
    useState<string>(todayDate);
  const [appliedUploadTimeTo, setAppliedUploadTimeTo] =
    useState<string>(todayDate);
  const [appliedItemsPerPage, setAppliedItemsPerPage] = useState(1000);

  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [totalCount, setTotalCount] = useState(0);

  // 자동 필터링이 실행되었는지 추적하는 ref
  const autoFilterAppliedRef = useRef(false);
  // 사용자가 수동으로 필터를 해제했는지 추적하는 ref
  const userClearedFilterRef = useRef(false);

  // 저장된 데이터 조회
  const fetchSavedData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      // 적용된 필터만 사용
      if (appliedType) params.append("type", appliedType);
      if (appliedPostType) params.append("postType", appliedPostType);
      if (appliedCompany && appliedCompany.length > 0) {
        appliedCompany.forEach((c) => params.append("company", c));
      }
      if (appliedVendor && appliedVendor.length > 0) {
        appliedVendor.forEach((v) => params.append("vendor", v));
      }
      // 주문상태 필터: 빈 문자열이 아닌 경우에만 추가 (빈 문자열 = 전체)
      console.log("🔍 주문상태 필터 체크:", {
        appliedOrderStatus,
        type: typeof appliedOrderStatus,
        length: appliedOrderStatus?.length,
        trimmed: appliedOrderStatus?.trim(),
        isEmpty: appliedOrderStatus?.trim() === "",
        condition: appliedOrderStatus && appliedOrderStatus.trim() !== "",
      });
      
      if (appliedOrderStatus && appliedOrderStatus.trim() !== "") {
        params.append("orderStatus", appliedOrderStatus);
        console.log("✅ orderStatus 파라미터 추가됨:", appliedOrderStatus);
      } else {
        console.log("❌ orderStatus 파라미터 추가 안됨");
      }
      
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

      const finalOrderStatus = params.get("orderStatus");
      console.log("📡 fetchSavedData API 호출:", {
        appliedOrderStatus,
        orderStatusParam: finalOrderStatus,
        allParams: params.toString(),
        hasOrderStatus: params.has("orderStatus"),
      });

      const response = await fetch(`/api/upload/list?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
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
    appliedCompany,
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
  // 초기화가 이미 실행되었는지 추적하는 ref
  const initializedRef = useRef(false);

  useEffect(() => {
    // 이미 초기화되었거나 URL 파라미터가 설정된 경우 스킵
    if (initializedRef.current) return;

    // 초기 로드 시 기본값으로 필터 적용 (URL 파라미터가 없는 경우에만)
    // URL 파라미터가 있으면 그 값이 우선되므로 여기서는 기본값만 설정
    setAppliedUploadTimeFrom(todayDate);
    setAppliedUploadTimeTo(todayDate);
    setAppliedOrderStatus("공급중");
    setAppliedItemsPerPage(1000);

    initializedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 사용자가 수동으로 필터를 해제했는지 감지
  useEffect(() => {
    // 자동 필터링이 적용된 상태에서 사용자가 빈 배열로 변경한 경우
    if (
      autoFilterAppliedRef.current &&
      prevSelectedCompanyRef.current.length > 0 &&
      selectedCompany.length === 0
    ) {
      userClearedFilterRef.current = true;
    }
    prevSelectedCompanyRef.current = selectedCompany;
  }, [selectedCompany]);

  // filters가 로드된 후 assigned_vendor_ids 기반으로 업체명 필터 설정
  useEffect(() => {
    // filters가 아직 로드되지 않았거나 companies가 비어있으면 스킵
    if (!filters.companies || filters.companies.length === 0) {
      return;
    }

    // 사용자가 수동으로 필터를 해제한 경우 자동 필터링 실행하지 않음
    if (userClearedFilterRef.current) {
      return;
    }

    // 이미 업체명이 설정되어 있으면 스킵 (사용자가 수동으로 변경한 경우)
    // selectedCompany도 체크하여 초기 로드 시에만 실행되도록 함
    if (selectedCompany.length > 0 || appliedCompany.length > 0) {
      return;
    }

    // 이미 자동 필터링이 실행된 경우 스킵
    if (autoFilterAppliedRef.current) {
      return;
    }

    const loadUserCompanies = async () => {
      try {
        const stored = localStorage.getItem("auth-storage");
        if (stored) {
          const parsed = JSON.parse(stored);
          const user = parsed.state?.user;
          if (user?.assignedMallIds && user.assignedMallIds.length > 0) {
            console.log("assignedMallIds 발견:", user.assignedMallIds);
            // mall API를 호출하여 ID를 이름으로 변환
            const headers: HeadersInit = {};
            if (user?.companyId) {
              headers["company-id"] = user.companyId.toString();
            }
            const mallsResponse = await fetch("/api/mall?limit=1000", {
              headers,
            });
            const mallsResult = await mallsResponse.json();

            if (mallsResult.success && mallsResult.data) {
              const mallNames = mallsResult.data
                .filter((m: any) => user.assignedMallIds.includes(m.id))
                .map((m: any) => m.name);

              console.log("mallNames:", mallNames);
              console.log("filters.companies:", filters.companies);

              if (mallNames.length > 0) {
                // 실제 업체명 필터 옵션과 일치하는 것만 필터링
                const validCompanyNames = mallNames.filter((name: string) =>
                  filters.companies.includes(name)
                );

                if (validCompanyNames.length > 0) {
                  console.log("업체명 필터 자동 설정:", validCompanyNames);
                  // 자동 필터링 실행 플래그 설정
                  autoFilterAppliedRef.current = true;
                  // 드롭다운에 표시되도록 selectedCompany 먼저 설정
                  setSelectedCompany(validCompanyNames);
                  // 필터 적용을 위해 appliedCompany도 설정
                  setAppliedCompany(validCompanyNames);
                } else {
                  console.log(
                    "업체명 필터 옵션과 일치하는 mall name이 없습니다:",
                    {
                      mallNames,
                      availableCompanies: filters.companies,
                    }
                  );
                }
              }
            }
          } else {
            console.log("assignedMallIds가 없거나 비어있습니다:", user);
          }
        }
      } catch (error) {
        console.error("유저 업체명 로드 실패:", error);
      }
    };

    loadUserCompanies();
  }, [filters.companies, selectedCompany, appliedCompany]);

  // 필터 변경 시 첫 페이지로 이동하고 데이터 조회
  useEffect(() => {
    setCurrentPage(1);
  }, [
    appliedType,
    appliedPostType,
    appliedCompany,
    appliedVendor,
    appliedSearchField,
    appliedSearchValue,
    appliedUploadTimeFrom,
    appliedUploadTimeTo,
    appliedItemsPerPage,
  ]);

  // appliedOrderStatus 변경 시 첫 페이지로 이동하고 데이터 조회
  useEffect(() => {
    console.log("🔄 appliedOrderStatus 변경:", appliedOrderStatus);
    setCurrentPage(1);
    // currentPage가 이미 1일 수 있으므로 직접 호출
    fetchSavedData();
  }, [appliedOrderStatus, fetchSavedData]);

  // currentPage 변경 시 데이터 조회
  useEffect(() => {
    fetchSavedData();
  }, [fetchSavedData, currentPage]);

  // 테이블 데이터 준비: 현재 페이지의 행 데이터를 평탄화 (메모이제이션)
  // 백엔드에서 이미 페이지네이션된 데이터를 받아오므로 그대로 사용
  const tableRows = useMemo(() => {
    return savedData.map((row: any) => {
      // 등록일 포맷팅: YYYY-MM-DD HH:mm:ss (DB에서 문자열로 받은 한국 시간을 그대로 표시)
      let formattedDate = "";
      if (row.upload_time) {
        // DB에서 받아온 시간 문자열 (이미 "YYYY-MM-DD HH24:MI:SS" 형식)
        formattedDate = row.upload_time;
      }

      const flatRow = {
        id: row.id,
        file_name: row.file_name,
        upload_time: row.upload_time,
        등록일: formattedDate,
        ...(row.row_data || {}),
        // 쇼핑몰명을 별도 컬럼에서 가져오기 (없으면 row_data에서 찾기)
        쇼핑몰명:
          row.shop_name ||
          row.row_data?.["쇼핑몰명"] ||
          row.row_data?.["쇼핑몰명(1)"] ||
          "",
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
      "내부코드",
      "등록일",
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
    console.log("🔍 applySearchFilter 호출:", {
      selectedOrderStatus,
      selectedType,
      selectedPostType,
      selectedCompany,
      selectedVendor,
    });
    setAppliedType(selectedType);
    setAppliedPostType(selectedPostType);
    setAppliedCompany(selectedCompany);
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
    selectedCompany,
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
    setSelectedCompany([]);
    setSelectedVendor([]);
    setSelectedOrderStatus("공급중");
    setSearchField("수취인명");
    setSearchValue("");
    setUploadTimeFrom(todayDate);
    setUploadTimeTo(todayDate);
    setItemsPerPage(1000);
    setAppliedType("");
    setAppliedPostType("");
    setAppliedCompany([]);
    setAppliedVendor([]);
    setAppliedOrderStatus("공급중");
    setAppliedSearchField("");
    setAppliedSearchValue("");
    setAppliedUploadTimeFrom(todayDate);
    setAppliedUploadTimeTo(todayDate);
    setAppliedItemsPerPage(1000);
    setCurrentPage(1);
    // 필터 초기화 시 자동 필터링 플래그도 리셋
    autoFilterAppliedRef.current = false;
    userClearedFilterRef.current = false;
    prevSelectedCompanyRef.current = [];
  }, [todayDate]);

  return {
    savedData,
    filters,
    selectedType,
    setSelectedType,
    selectedPostType,
    setSelectedPostType,
    selectedCompany,
    setSelectedCompany,
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
    appliedCompany,
    appliedVendor,
    appliedOrderStatus,
    appliedSearchField,
    appliedSearchValue,
    appliedUploadTimeFrom,
    appliedUploadTimeTo,
    appliedItemsPerPage,
    setAppliedType,
    setAppliedPostType,
    setAppliedCompany,
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
