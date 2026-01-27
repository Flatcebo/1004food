import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

/**
 * 특정 매입처의 주문 상세 목록 조회 API
 * GET: 매입처별 주문 목록 조회 (발주여부 필터 가능)
 */
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

    // URL 파라미터 추출
    const {searchParams} = new URL(request.url);
    const purchaseId = searchParams.get("purchaseId");
    const purchaseName = searchParams.get("purchaseName");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const orderFilter = searchParams.get("orderFilter") || "unordered"; // all, ordered, unordered

    if (!purchaseId && !purchaseName) {
      return NextResponse.json(
        {success: false, error: "purchaseId 또는 purchaseName이 필요합니다."},
        {status: 400}
      );
    }

    // 오늘 날짜 기본값
    const today = new Date().toISOString().split("T")[0];
    const queryStartDate = startDate || today;
    const queryEndDate = endDate || today;

    // 매입처 정보 조회
    let purchase;
    if (purchaseId) {
      const result = await sql`
        SELECT id, name, submit_type, email, kakaotalk, template_headers
        FROM purchase
        WHERE id = ${purchaseId} AND company_id = ${companyId}
      `;
      purchase = result[0];
    } else {
      const result = await sql`
        SELECT id, name, submit_type, email, kakaotalk, template_headers
        FROM purchase
        WHERE name = ${purchaseName} AND company_id = ${companyId}
      `;
      purchase = result[0];
    }

    if (!purchase) {
      return NextResponse.json(
        {success: false, error: "매입처를 찾을 수 없습니다."},
        {status: 404}
      );
    }

    // 주문 목록 조회 (purchase_id FK 사용)
    let orderFilterCondition = sql``;
    if (orderFilter === "ordered") {
      orderFilterCondition = sql`AND ur.is_ordered = true`;
    } else if (orderFilter === "unordered") {
      orderFilterCondition = sql`AND (ur.is_ordered = false OR ur.is_ordered IS NULL)`;
    }

    const orders = await sql`
      SELECT DISTINCT ON (ur.id)
        ur.id,
        ur.row_data,
        ur.is_ordered,
        ur.purchase_id,
        ur.created_at,
        u.created_at as upload_date,
        pr.id as product_id,
        pr.code as product_code,
        pr.name as product_name,
        pr.sale_price,
        pr.sabang_name
      FROM upload_rows ur
      INNER JOIN uploads u ON ur.upload_id = u.id AND u.company_id = ${companyId}
      LEFT JOIN LATERAL (
        SELECT id, code, name, sale_price, sabang_name
        FROM products
        WHERE company_id = ${companyId}
          AND (
            (ur.row_data->>'productId' IS NOT NULL AND id = (ur.row_data->>'productId')::integer)
            OR (ur.row_data->>'매핑코드' IS NOT NULL AND code = ur.row_data->>'매핑코드')
          )
        LIMIT 1
      ) pr ON true
      WHERE ur.purchase_id = ${purchase.id}
        AND ur.row_data->>'주문상태' NOT IN ('취소')
        AND u.created_at >= ${queryStartDate}::date
        AND u.created_at < (${queryEndDate}::date + INTERVAL '1 day')
        ${orderFilterCondition}
      ORDER BY ur.id, u.created_at DESC
    `;

    return NextResponse.json({
      success: true,
      purchase: {
        id: purchase.id,
        name: purchase.name,
        submitType: purchase.submit_type || [],
        email: purchase.email,
        kakaotalk: purchase.kakaotalk,
        templateHeaders: purchase.template_headers,
      },
      data: orders.map((row: any) => ({
        id: row.id,
        rowData: row.row_data,
        isOrdered: row.is_ordered,
        purchaseId: row.purchase_id,
        createdAt: row.created_at,
        uploadDate: row.upload_date,
        productId: row.product_id,
        productCode: row.product_code,
        productName: row.product_name,
        salePrice: row.sale_price,
        sabangName: row.sabang_name,
      })),
      count: orders.length,
      period: {
        startDate: queryStartDate,
        endDate: queryEndDate,
      },
    });
  } catch (error: any) {
    console.error("매입처별 주문 목록 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

/**
 * 주문 발주 상태 업데이트 API
 * PUT: 주문들의 발주 상태를 업데이트
 */
export async function PUT(request: NextRequest) {
  try {
    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400}
      );
    }

    const body = await request.json();
    const {orderIds, isOrdered} = body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json(
        {success: false, error: "orderIds가 필요합니다."},
        {status: 400}
      );
    }

    // 주문 발주 상태 업데이트
    const result = await sql`
      UPDATE upload_rows ur
      SET is_ordered = ${isOrdered}
      FROM uploads u
      WHERE ur.upload_id = u.id 
        AND u.company_id = ${companyId}
        AND ur.id = ANY(${orderIds})
    `;

    return NextResponse.json({
      success: true,
      message: `${orderIds.length}건의 발주 상태가 업데이트되었습니다.`,
      updatedCount: orderIds.length,
    });
  } catch (error: any) {
    console.error("발주 상태 업데이트 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
