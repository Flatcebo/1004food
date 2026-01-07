import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

export async function GET(request: NextRequest) {
  try {
    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400}
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const statsOnly = searchParams.get("stats") === "true";

    // 통계만 요청한 경우
    if (statsOnly) {
      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD 형식

      // 총 주문 수 (company_id 필터링)
      const totalResult = await sql`
        SELECT COUNT(*) as total FROM upload_rows ur
        INNER JOIN uploads u ON ur.upload_id = u.id
        WHERE u.company_id = ${companyId}
      `;

      // 오늘 주문 수 (업로드 날짜 기준, company_id 필터링)
      const todayResult = await sql`
        SELECT COUNT(*) as today FROM upload_rows ur
        INNER JOIN uploads u ON ur.upload_id = u.id
        WHERE DATE(u.created_at) = ${today} AND u.company_id = ${companyId}
      `;

      // 대기 주문 수 (주문상태가 '대기'인 경우, company_id 필터링)
      const pendingResult = await sql`
        SELECT COUNT(*) as pending FROM upload_rows ur
        INNER JOIN uploads u ON ur.upload_id = u.id
        WHERE ur.row_data->>'주문상태' IN ('대기', '접수', '준비중')
        AND u.company_id = ${companyId}
      `;

      return NextResponse.json({
        success: true,
        stats: {
          totalOrders: parseInt(totalResult[0].total),
          todayOrders: parseInt(todayResult[0].today),
          pendingOrders: parseInt(pendingResult[0].pending),
        },
      });
    }

    const type = searchParams.get("type");
    const postType = searchParams.get("postType");
    const vendors = searchParams.getAll("vendor"); // 다중 vendors 지원
    const companies = searchParams.getAll("company"); // 다중 companies 지원
    const orderStatus = searchParams.get("orderStatus");
    const searchField = searchParams.get("searchField");
    const searchValue = searchParams.get("searchValue");
    const uploadTimeFrom = searchParams.get("uploadTimeFrom");
    const uploadTimeTo = searchParams.get("uploadTimeTo");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = (page - 1) * limit;

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

    // WHERE 조건 구성 (company_id 필수)
    const conditions: any[] = [sql`u.company_id = ${companyId}`];
    if (type) {
      conditions.push(sql`ur.row_data->>'내외주' = ${type}`);
    }
    if (postType) {
      conditions.push(sql`ur.row_data->>'택배사' = ${postType}`);
    }
    if (vendors && vendors.length > 0) {
      // 다중 vendors 필터링 (OR 조건)
      conditions.push(sql`ur.row_data->>'업체명' = ANY(${vendors})`);
    }
    if (companies && companies.length > 0) {
      // 다중 companies 필터링 (OR 조건)
      conditions.push(sql`ur.row_data->>'업체명' = ANY(${companies})`);
    }
    if (orderStatus) {
      conditions.push(sql`ur.row_data->>'주문상태' = ${orderStatus}`);
    }
    if (dbField && searchPattern) {
      conditions.push(sql`ur.row_data->>${dbField} ILIKE ${searchPattern}`);
    }
    if (uploadTimeFrom) {
      conditions.push(sql`u.created_at >= ${uploadTimeFrom}::date`);
    }
    if (uploadTimeTo) {
      conditions.push(
        sql`u.created_at < (${uploadTimeTo}::date + INTERVAL '1 day')`
      );
    }

    // 조건부 쿼리 구성 (항상 company_id 조건 포함)
    const buildQuery = (selectClause: any, includeLimit = false) => {
      // 첫 번째 조건(company_id)으로 WHERE 시작
      let query = sql`${selectClause} WHERE ${conditions[0]}`;

      // 나머지 조건들을 AND로 연결
      for (let i = 1; i < conditions.length; i++) {
        query = sql`${query} AND ${conditions[i]}`;
      }

      if (includeLimit) {
        query = sql`${query} ORDER BY u.created_at DESC, ur.id DESC LIMIT ${limit} OFFSET ${offset}`;
      }

      return query;
    };

    // 전체 개수 조회 쿼리
    const countQuery = buildQuery(
      sql`SELECT COUNT(*) as total FROM upload_rows ur INNER JOIN uploads u ON ur.upload_id = u.id`
    );

    // 데이터 조회 쿼리 (페이지네이션 적용, 한국 시간을 문자열로 반환하여 UTC 해석 방지)
    const dataQuery = buildQuery(
      sql`
        SELECT 
          ur.id,
          ur.upload_id,
          ur.row_data,
          ur.shop_name,
          u.file_name,
          TO_CHAR(u.created_at, 'YYYY-MM-DD HH24:MI:SS') as upload_time
        FROM upload_rows ur
        INNER JOIN uploads u ON ur.upload_id = u.id
      `,
      true
    );

    // 두 쿼리를 병렬로 실행
    const [countResult, rows] = await Promise.all([countQuery, dataQuery]);

    const totalCount =
      Array.isArray(countResult) && countResult.length > 0
        ? parseInt(countResult[0].total as string, 10)
        : 0;

    // 필터 목록 조회 (company_id 필터링)
    const [typeList, postTypeList, vendorList, companyList] = await Promise.all(
      [
        sql`SELECT DISTINCT ur.row_data->>'내외주' as type FROM upload_rows ur INNER JOIN uploads u ON ur.upload_id = u.id WHERE u.company_id = ${companyId} AND ur.row_data->>'내외주' IS NOT NULL ORDER BY type`,
        sql`SELECT DISTINCT ur.row_data->>'택배사' as post_type FROM upload_rows ur INNER JOIN uploads u ON ur.upload_id = u.id WHERE u.company_id = ${companyId} AND ur.row_data->>'택배사' IS NOT NULL ORDER BY post_type`,
        sql`SELECT DISTINCT name as vendor FROM purchase WHERE company_id = ${companyId} AND name IS NOT NULL ORDER BY name`,
        sql`SELECT DISTINCT ur.row_data->>'업체명' as company FROM upload_rows ur INNER JOIN uploads u ON ur.upload_id = u.id WHERE u.company_id = ${companyId} AND ur.row_data->>'업체명' IS NOT NULL ORDER BY company`,
      ]
    );

    return NextResponse.json({
      success: true,
      data: Array.isArray(rows) ? rows : [],
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      filters: {
        types: typeList.map((t: any) => t.type).filter(Boolean),
        postTypes: postTypeList.map((pt: any) => pt.post_type).filter(Boolean),
        vendors: vendorList.map((v: any) => v.vendor).filter(Boolean),
        companies: companyList.map((c: any) => c.company).filter(Boolean),
      },
    });
  } catch (error: any) {
    console.error("데이터 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
