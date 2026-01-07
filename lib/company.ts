import {NextRequest} from "next/server";
import sql from "@/lib/db";

/**
 * 요청에서 company_id를 추출하는 헬퍼 함수
 * 헤더 또는 쿼리 파라미터에서 company_id를 가져옵니다.
 * 
 * @param request NextRequest 객체
 * @returns company_id (number) 또는 null
 */
export async function getCompanyIdFromRequest(
  request: NextRequest
): Promise<number | null> {
  // 1. 헤더에서 company-id 확인
  const headerCompanyId = request.headers.get("company-id");
  if (headerCompanyId) {
    const id = parseInt(headerCompanyId, 10);
    if (!isNaN(id)) {
      return id;
    }
  }

  // 2. 쿼리 파라미터에서 company_id 확인
  const {searchParams} = new URL(request.url);
  const queryCompanyId = searchParams.get("company_id");
  if (queryCompanyId) {
    const id = parseInt(queryCompanyId, 10);
    if (!isNaN(id)) {
      return id;
    }
  }

  // 3. Authorization 헤더에서 사용자 정보 추출 (향후 JWT 토큰 사용 시)
  // 현재는 기본 company_id 반환 (기존 데이터 호환성)
  try {
    const defaultCompany = await sql`
      SELECT id FROM companies WHERE name = '기본 회사' LIMIT 1
    `;
    
    if (defaultCompany.length > 0) {
      return defaultCompany[0].id;
    }
  } catch (error) {
    // companies 테이블이 아직 생성되지 않았을 수 있음
    console.log("기본 회사 조회 실패:", error);
  }

  return null;
}

/**
 * company_id가 유효한지 확인하는 함수
 * 
 * @param companyId 확인할 company_id
 * @returns 유효하면 true, 아니면 false
 */
export async function validateCompanyId(
  companyId: number
): Promise<boolean> {
  const result = await sql`
    SELECT id FROM companies WHERE id = ${companyId} LIMIT 1
  `;
  return result.length > 0;
}

/**
 * 요청에서 user_id를 추출하는 헬퍼 함수
 * 헤더 또는 쿼리 파라미터에서 user_id를 가져옵니다.
 * 
 * @param request NextRequest 객체
 * @returns user_id (string) 또는 null
 */
export async function getUserIdFromRequest(
  request: NextRequest
): Promise<string | null> {
  // 1. 헤더에서 user-id 확인
  const headerUserId = request.headers.get("user-id");
  if (headerUserId) {
    return headerUserId;
  }

  // 2. 쿼리 파라미터에서 user_id 확인
  const {searchParams} = new URL(request.url);
  const queryUserId = searchParams.get("user_id");
  if (queryUserId) {
    return queryUserId;
  }

  return null;
}
