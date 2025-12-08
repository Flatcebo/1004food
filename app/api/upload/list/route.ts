import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get("type");
    const postType = searchParams.get("postType");
    const vendor = searchParams.get("vendor");
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
    };
    const dbField = searchField ? fieldMap[searchField] : null;
    const searchPattern = searchValue ? `%${searchValue}%` : null;

    // WHERE 조건 구성
    const conditions: any[] = [];
    if (type) {
      conditions.push(sql`ur.row_data->>'내외주' = ${type}`);
    }
    if (postType) {
      conditions.push(sql`ur.row_data->>'택배사' = ${postType}`);
    }
    if (vendor) {
      conditions.push(sql`ur.row_data->>'업체명' = ${vendor}`);
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
      conditions.push(sql`u.created_at < (${uploadTimeTo}::date + INTERVAL '1 day')`);
    }

    // 조건부 쿼리 구성
    const buildQuery = (selectClause: any, includeLimit = false) => {
      if (conditions.length === 0) {
        return includeLimit
          ? sql`${selectClause} ORDER BY u.created_at DESC, ur.id DESC LIMIT ${limit} OFFSET ${offset}`
          : selectClause;
      }
      
      // 첫 번째 조건으로 WHERE 시작
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

    // 데이터 조회 쿼리 (페이지네이션 적용)
    const dataQuery = buildQuery(
      sql`
        SELECT 
          ur.id,
          ur.upload_id,
          ur.row_data,
          u.file_name,
          u.created_at as upload_time
        FROM upload_rows ur
        INNER JOIN uploads u ON ur.upload_id = u.id
      `,
      true
    );

    // 두 쿼리를 병렬로 실행
    const [countResult, rows] = await Promise.all([
      countQuery,
      dataQuery,
    ]);

    const totalCount = Array.isArray(countResult) && countResult.length > 0
      ? parseInt(countResult[0].total as string, 10)
      : 0;

    // 필터 목록 조회
    const [typeList, postTypeList, vendorList] = await Promise.all([
      sql`SELECT DISTINCT row_data->>'내외주' as type FROM upload_rows WHERE row_data->>'내외주' IS NOT NULL ORDER BY type`,
      sql`SELECT DISTINCT row_data->>'택배사' as post_type FROM upload_rows WHERE row_data->>'택배사' IS NOT NULL ORDER BY post_type`,
      sql`SELECT DISTINCT row_data->>'업체명' as vendor FROM upload_rows WHERE row_data->>'업체명' IS NOT NULL ORDER BY vendor`,
    ]);

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
