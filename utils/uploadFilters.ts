import sql from "@/lib/db";

/**
 * 업로드 데이터 필터 타입 정의
 */
export interface UploadFilters {
  type?: string;
  postType?: string;
  vendor?: string | string[];
  company?: string | string[];
  orderStatus?: string;
  searchField?: string;
  searchValue?: string;
  uploadTimeFrom?: string;
  uploadTimeTo?: string;
}

/**
 * 필터 조건을 SQL 조건 배열로 변환
 * @param filters 필터 객체
 * @param options 추가 옵션 (updateConditions 생성 여부 등)
 * @returns SQL 조건 배열과 업데이트 조건 배열 (옵션)
 */
export function buildFilterConditions(
  filters: UploadFilters,
  options?: {
    includeUpdateConditions?: boolean;
    companyId?: number;
  }
): {
  conditions: any[];
  updateConditions?: any[];
} {
  const {
    type,
    postType,
    vendor,
    company,
    orderStatus,
    searchField,
    searchValue,
    uploadTimeFrom,
    uploadTimeTo,
  } = filters;

  const conditions: any[] = [];
  const updateConditions: any[] = [];

  // company_id 조건 추가 (옵션에 companyId가 있으면)
  if (options?.companyId) {
    conditions.push(sql`u.company_id = ${options.companyId}`);
  }

  // 검색 필드 매핑
  const fieldMap: {[key: string]: string} = {
    수취인명: "수취인명",
    주문자명: "주문자명",
    상품명: "상품명",
    매핑코드: "매핑코드",
    내부코드: "내부코드",
  };

  const dbField = searchField ? fieldMap[searchField] : null;
  const searchPattern = searchValue ? `%${searchValue}%` : null;

  // 내외주 필터
  if (type) {
    conditions.push(sql`ur.row_data->>'내외주' = ${type}`);
    if (options?.includeUpdateConditions) {
      updateConditions.push(sql`upload_rows.row_data->>'내외주' = ${type}`);
    }
  }

  // 택배사 필터
  if (postType) {
    conditions.push(sql`ur.row_data->>'택배사' = ${postType}`);
    if (options?.includeUpdateConditions) {
      updateConditions.push(sql`upload_rows.row_data->>'택배사' = ${postType}`);
    }
  }

  // 업체명(vendor) 필터 - 배열 또는 문자열 지원
  // 매입처명은 매핑코드를 통해 products 테이블의 purchase 컬럼에서 가져옴
  if (vendor) {
    const companyId = options?.companyId;
    if (Array.isArray(vendor) && vendor.length > 0) {
      if (companyId) {
        // 매핑코드를 통해 products 테이블의 purchase(매입처명)와 비교
        conditions.push(sql`
          EXISTS (
            SELECT 1 FROM products p
            WHERE p.code = ur.row_data->>'매핑코드'
            AND p.company_id = ${companyId}
            AND p.purchase = ANY(${vendor})
          )
          OR ur.row_data->>'업체명' = ANY(${vendor})
        `);
      } else {
        // companyId가 없으면 기존 방식 사용
        conditions.push(sql`ur.row_data->>'업체명' = ANY(${vendor})`);
      }
      if (options?.includeUpdateConditions) {
        updateConditions.push(
          sql`upload_rows.row_data->>'업체명' = ANY(${vendor})`
        );
      }
    } else if (typeof vendor === "string") {
      if (companyId) {
        // 매핑코드를 통해 products 테이블의 purchase(매입처명)와 비교
        conditions.push(sql`
          EXISTS (
            SELECT 1 FROM products p
            WHERE p.code = ur.row_data->>'매핑코드'
            AND p.company_id = ${companyId}
            AND p.purchase = ${vendor}
          )
          OR ur.row_data->>'업체명' = ${vendor}
        `);
      } else {
        // companyId가 없으면 기존 방식 사용
        conditions.push(sql`ur.row_data->>'업체명' = ${vendor}`);
      }
      if (options?.includeUpdateConditions) {
        updateConditions.push(sql`upload_rows.row_data->>'업체명' = ${vendor}`);
      }
    }
  }

  // 회사명(company) 필터 - 배열 또는 문자열 지원
  if (company) {
    if (Array.isArray(company) && company.length > 0) {
      conditions.push(sql`ur.row_data->>'업체명' = ANY(${company})`);
      if (options?.includeUpdateConditions) {
        updateConditions.push(
          sql`upload_rows.row_data->>'업체명' = ANY(${company})`
        );
      }
    } else if (typeof company === "string") {
      conditions.push(sql`ur.row_data->>'업체명' = ${company}`);
      if (options?.includeUpdateConditions) {
        updateConditions.push(sql`upload_rows.row_data->>'업체명' = ${company}`);
      }
    }
  }

  // 주문상태 필터
  if (orderStatus) {
    conditions.push(sql`ur.row_data->>'주문상태' = ${orderStatus}`);
    if (options?.includeUpdateConditions) {
      updateConditions.push(
        sql`upload_rows.row_data->>'주문상태' = ${orderStatus}`
      );
    }
  }

  // 검색 필터
  if (dbField && searchPattern) {
    conditions.push(sql`ur.row_data->>${dbField} ILIKE ${searchPattern}`);
    if (options?.includeUpdateConditions) {
      updateConditions.push(
        sql`upload_rows.row_data->>${dbField} ILIKE ${searchPattern}`
      );
    }
  }

  // 업로드 시작일 필터 (빈 문자열 체크 추가)
  if (uploadTimeFrom && typeof uploadTimeFrom === 'string' && uploadTimeFrom.trim() !== '') {
    conditions.push(sql`u.created_at >= ${uploadTimeFrom}::date`);
    if (options?.includeUpdateConditions) {
      updateConditions.push(sql`u.created_at >= ${uploadTimeFrom}::date`);
    }
  }

  // 업로드 종료일 필터 (빈 문자열 체크 추가)
  if (uploadTimeTo && typeof uploadTimeTo === 'string' && uploadTimeTo.trim() !== '') {
    conditions.push(
      sql`u.created_at < (${uploadTimeTo}::date + INTERVAL '1 day')`
    );
    if (options?.includeUpdateConditions) {
      updateConditions.push(
        sql`u.created_at < (${uploadTimeTo}::date + INTERVAL '1 day')`
      );
    }
  }

  return {
    conditions,
    ...(options?.includeUpdateConditions && {updateConditions}),
  };
}

/**
 * 필터 조건을 사용하여 쿼리 빌드
 * @param conditions SQL 조건 배열
 * @param includeId ID 포함 여부
 * @returns SQL 쿼리
 */
export function buildFilterQuery(
  conditions: any[],
  includeId: boolean = false
) {
  if (conditions.length === 0) {
    return sql`
      SELECT ${includeId ? sql`ur.id,` : sql``} ur.row_data
      FROM upload_rows ur
      INNER JOIN uploads u ON ur.upload_id = u.id
      ORDER BY u.created_at DESC, ur.id DESC
    `;
  }

  let query = sql`
    SELECT ${includeId ? sql`ur.id,` : sql``} ur.row_data
    FROM upload_rows ur
    INNER JOIN uploads u ON ur.upload_id = u.id
    WHERE ${conditions[0]}
  `;

  for (let i = 1; i < conditions.length; i++) {
    query = sql`${query} AND ${conditions[i]}`;
  }

  query = sql`${query} ORDER BY u.created_at DESC, ur.id DESC`;
  return query;
}
