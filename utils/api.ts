/**
 * 공통 API 호출 유틸리티 함수
 */
import type {
  ApiResponse,
  Product,
  ProductCreateRequest,
  PurchaseOption,
} from "@/types/api";

/**
 * 인증된 API 요청을 위한 헤더 생성
 * localStorage에서 사용자 정보를 가져와 company_id를 헤더에 추가
 */
export function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  // 클라이언트 사이드에서만 실행
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("auth-storage");
      if (stored) {
        const parsed = JSON.parse(stored);
        const user = parsed.state?.user;
        if (user?.companyId) {
          headers["company-id"] = user.companyId.toString();
        }
      }
    } catch (e) {
      console.error("인증 정보 로드 실패:", e);
    }
  }

  return headers;
}

/**
 * API 호출 래퍼 함수
 */
export async function apiCall<T = any>(
  url: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const authHeaders = getAuthHeaders();
    const response = await fetch(url, {
      ...options,
      headers: {
        ...authHeaders,
        ...options?.headers,
      },
    });

    const result = await response.json();
    return result as ApiResponse<T>;
  } catch (error) {
    console.error("API 호출 실패:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "API 호출 중 오류가 발생했습니다.";
    return {
      success: false,
      error: errorMessage,
    } as ApiResponse<T>;
  }
}

/**
 * 상품 목록 조회
 */
export async function fetchProducts(): Promise<ApiResponse<Product[]>> {
  return apiCall<Product[]>("/api/products/list");
}

/**
 * 상품 검색
 */
export async function searchProducts(
  productName: string
): Promise<ApiResponse<Product[]>> {
  return apiCall<Product[]>("/api/products/search", {
    method: "POST",
    body: JSON.stringify({productName}),
  });
}

/**
 * 상품 생성
 */
export async function createProduct(
  productData: ProductCreateRequest
): Promise<ApiResponse<Product>> {
  return apiCall<Product>("/api/products/create", {
    method: "POST",
    body: JSON.stringify(productData),
  });
}

/**
 * 상품 일괄 생성
 */
export async function batchCreateProducts(
  products: ProductCreateRequest[]
): Promise<ApiResponse<{count: number}>> {
  return apiCall<{count: number}>("/api/products/batch-create", {
    method: "POST",
    body: JSON.stringify({products}),
  });
}

/**
 * 상품 삭제
 */
export async function deleteProducts(ids: number[]): Promise<ApiResponse<any>> {
  return apiCall<any>("/api/products/delete", {
    method: "DELETE",
    body: JSON.stringify({ids}),
  });
}

/**
 * 상품 일괄 수정
 */
export async function batchUpdateProducts(
  ids: number[],
  updates: Partial<ProductCreateRequest>
): Promise<ApiResponse<{count: number}>> {
  return apiCall<{count: number}>("/api/products/batch-update", {
    method: "PUT",
    body: JSON.stringify({ids, updates}),
  });
}

/**
 * 매입처 검색
 */
export async function searchPurchase(
  query: string
): Promise<ApiResponse<PurchaseOption[]>> {
  return apiCall<PurchaseOption[]>("/api/purchase/search", {
    method: "POST",
    body: JSON.stringify({query}),
  });
}

/**
 * 인증된 fetch 요청
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = getAuthHeaders();
  
  return fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });
}
