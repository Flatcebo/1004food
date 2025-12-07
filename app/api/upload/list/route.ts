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

    // 검색 필드 매핑
    const fieldMap: {[key: string]: string} = {
      수취인명: "수취인명",
      주문자명: "주문자명",
      상품명: "상품명",
      매핑코드: "매핑코드",
    };
    const dbField = searchField ? fieldMap[searchField] : null;
    const searchPattern = searchValue ? `%${searchValue}%` : null;

    // 동적 쿼리 구성
    let query = sql`
      SELECT 
        ur.id,
        ur.upload_id,
        ur.row_data,
        u.file_name,
        u.created_at as upload_time
      FROM upload_rows ur
      INNER JOIN uploads u ON ur.upload_id = u.id
    `;

    // WHERE 조건 추가
    const conditions: any[] = [];
    if (type) {
      query = sql`${query} WHERE ur.row_data->>'내외주' = ${type}`;
      conditions.push(true);
    }
    if (postType) {
      query =
        conditions.length === 0
          ? sql`${query} WHERE ur.row_data->>'택배사' = ${postType}`
          : sql`${query} AND ur.row_data->>'택배사' = ${postType}`;
      conditions.push(true);
    }
    if (vendor) {
      query =
        conditions.length === 0
          ? sql`${query} WHERE ur.row_data->>'업체명' = ${vendor}`
          : sql`${query} AND ur.row_data->>'업체명' = ${vendor}`;
      conditions.push(true);
    }
    if (orderStatus) {
      query =
        conditions.length === 0
          ? sql`${query} WHERE ur.row_data->>'주문상태' = ${orderStatus}`
          : sql`${query} AND ur.row_data->>'주문상태' = ${orderStatus}`;
      conditions.push(true);
    }
    if (dbField && searchPattern) {
      query =
        conditions.length === 0
          ? sql`${query} WHERE ur.row_data->>${dbField} ILIKE ${searchPattern}`
          : sql`${query} AND ur.row_data->>${dbField} ILIKE ${searchPattern}`;
      conditions.push(true);
    }
    if (uploadTimeFrom) {
      query =
        conditions.length === 0
          ? sql`${query} WHERE u.created_at >= ${uploadTimeFrom}::date`
          : sql`${query} AND u.created_at >= ${uploadTimeFrom}::date`;
      conditions.push(true);
    }
    if (uploadTimeTo) {
      query =
        conditions.length === 0
          ? sql`${query} WHERE u.created_at < (${uploadTimeTo}::date + INTERVAL '1 day')`
          : sql`${query} AND u.created_at < (${uploadTimeTo}::date + INTERVAL '1 day')`;
    }

    // ORDER BY 추가
    query = sql`${query} ORDER BY u.created_at DESC, ur.id DESC`;

    const rows = await query;

    // 필터 목록 조회
    const [typeList, postTypeList, vendorList] = await Promise.all([
      sql`SELECT DISTINCT row_data->>'내외주' as type FROM upload_rows WHERE row_data->>'내외주' IS NOT NULL ORDER BY type`,
      sql`SELECT DISTINCT row_data->>'택배사' as post_type FROM upload_rows WHERE row_data->>'택배사' IS NOT NULL ORDER BY post_type`,
      sql`SELECT DISTINCT row_data->>'업체명' as vendor FROM upload_rows WHERE row_data->>'업체명' IS NOT NULL ORDER BY vendor`,
    ]);

    return NextResponse.json({
      success: true,
      data: Array.isArray(rows) ? rows : [],
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
