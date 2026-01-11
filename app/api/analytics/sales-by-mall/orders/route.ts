import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

/**
 * GET /api/analytics/sales-by-mall/orders
 * 특정 쇼핑몰의 주문 목록 조회
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

    const {searchParams} = new URL(request.url);
    const mallId = searchParams.get("mallId");
    let startDate = searchParams.get("startDate");
    let endDate = searchParams.get("endDate");

    if (!mallId) {
      return NextResponse.json(
        {success: false, error: "mallId가 필요합니다."},
        {status: 400}
      );
    }

    if (!startDate || !endDate) {
      return NextResponse.json(
        {success: false, error: "시작일과 종료일이 필요합니다."},
        {status: 400}
      );
    }

    // 날짜만 추출 (YYYY-MM-DD 형식) - ISO 문자열이나 타임스탬프에서 날짜만 추출
    // 이미 YYYY-MM-DD 형식인 경우 그대로 사용
    if (startDate && startDate.includes("T")) {
      startDate = startDate.split("T")[0];
    }
    if (startDate && startDate.includes(" ")) {
      startDate = startDate.split(" ")[0];
    }
    if (endDate && endDate.includes("T")) {
      endDate = endDate.split("T")[0];
    }
    if (endDate && endDate.includes(" ")) {
      endDate = endDate.split(" ")[0];
    }
    
    // YYYY-MM-DD 형식 검증
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      console.error(`[주문 목록 조회] 잘못된 날짜 형식: startDate=${startDate}, endDate=${endDate}`);
      return NextResponse.json(
        {success: false, error: `잘못된 날짜 형식입니다. (startDate: ${startDate}, endDate: ${endDate})`},
        {status: 400}
      );
    }

    const mallIdInt = parseInt(mallId, 10);
    
    console.log(`[주문 목록 조회] 원본 파라미터:`, {
      mallId,
      startDate_원본: searchParams.get("startDate"),
      endDate_원본: searchParams.get("endDate"),
    });
    console.log(`[주문 목록 조회] 처리 후: company_id: ${companyId}, mall_id: ${mallIdInt}, 기간: ${startDate} ~ ${endDate}`);

    // 정산 데이터 확인 (디버깅용) - 실제로 정산된 데이터가 있는지 확인
    const settlementCheck = await sql`
      SELECT 
        period_start_date,
        period_end_date,
        order_quantity,
        order_amount
      FROM mall_sales_settlements
      WHERE company_id = ${companyId}
        AND mall_id = ${mallIdInt}
        AND period_start_date = ${startDate}::date
        AND period_end_date = ${endDate}::date
      LIMIT 1
    `;
    console.log(`[주문 목록 조회] 정산 데이터 확인:`, settlementCheck.length > 0 ? settlementCheck[0] : "없음");

    // 먼저 해당 mall_id와 company_id로 전체 주문 건수 확인 (디버깅용)
    const totalCountCheck = await sql`
      SELECT COUNT(*) as count
      FROM upload_rows ur
      WHERE ur.company_id = ${companyId}
        AND ur.mall_id = ${mallIdInt}
    `;
    console.log(`[주문 목록 조회] 해당 쇼핑몰 전체 주문 건수 (mall_id=${mallIdInt}):`, totalCountCheck[0]?.count || 0);

    // 기간 내 전체 주문 건수 확인 (디버깅용)
    const periodCountCheck = await sql`
      SELECT COUNT(*) as count
      FROM upload_rows ur
      WHERE ur.company_id = ${companyId}
        AND DATE(ur.created_at) >= ${startDate}::date
        AND DATE(ur.created_at) < (${endDate}::date + INTERVAL '1 day')
    `;
    console.log(`[주문 목록 조회] 기간 내 전체 주문 건수 (${startDate} ~ ${endDate}):`, periodCountCheck[0]?.count || 0);

    // 해당 쇼핑몰의 주문 데이터 조회 (refresh/route.ts와 동일한 로직 사용)
    const orders = await sql`
      SELECT DISTINCT ON (ur.id)
        ur.id,
        ur.row_data,
        ur.shop_name,
        ur.mall_id,
        ur.created_at as row_created_at,
        p.price as product_price,
        p.sale_price as product_sale_price
      FROM upload_rows ur
      LEFT JOIN LATERAL (
        SELECT price, sale_price
        FROM products
        WHERE company_id = ${companyId}
          AND (
            code = ur.row_data->>'매핑코드'
            OR id::text = ur.row_data->>'productId'
          )
        LIMIT 1
      ) p ON true
      WHERE ur.company_id = ${companyId}
        AND ur.mall_id = ${mallIdInt}
        AND DATE(ur.created_at) >= ${startDate}::date
        AND DATE(ur.created_at) < (${endDate}::date + INTERVAL '1 day')
      ORDER BY ur.id
    `;

    console.log(`[주문 목록 조회] 조회된 주문 건수: ${orders.length}`);
    
    // 샘플 데이터 확인 (디버깅용)
    if (orders.length > 0) {
      console.log(`[주문 목록 조회] 샘플 주문 데이터:`, {
        id: orders[0].id,
        mall_id: orders[0].mall_id,
        shop_name: orders[0].shop_name,
        created_at: orders[0].row_created_at,
        date_only: orders[0].row_created_at ? new Date(orders[0].row_created_at).toISOString().split('T')[0] : null,
      });
    } else {
      // 데이터가 없는 경우, 조건별로 확인
      const checkMallId = await sql`
        SELECT COUNT(*) as count
        FROM upload_rows ur
        WHERE ur.company_id = ${companyId}
          AND ur.mall_id = ${mallIdInt}
          AND DATE(ur.created_at) >= ${startDate}::date
          AND DATE(ur.created_at) < (${endDate}::date + INTERVAL '1 day')
      `;
      console.log(`[주문 목록 조회] ⚠️ 조건별 확인 - mall_id=${mallIdInt}, 기간=${startDate}~${endDate}:`, checkMallId[0]?.count || 0);
      
      // 다른 mall_id로 확인 (디버깅용)
      const otherMallIds = await sql`
        SELECT DISTINCT ur.mall_id, COUNT(*) as count
        FROM upload_rows ur
        WHERE ur.company_id = ${companyId}
          AND DATE(ur.created_at) >= ${startDate}::date
          AND DATE(ur.created_at) < (${endDate}::date + INTERVAL '1 day')
        GROUP BY ur.mall_id
        ORDER BY count DESC
        LIMIT 5
      `;
      console.log(`[주문 목록 조회] 기간 내 다른 mall_id별 주문 건수:`, otherMallIds);
    }

    // 주문 데이터 포맷팅 (refresh/route.ts와 동일한 로직 사용)
    const formattedOrders = orders.map((order: any) => {
      const rowData = order.row_data || {};
      
      // 공급가: row_data의 공급가 또는 products의 sale_price (refresh/route.ts와 동일)
      const salePrice =
        rowData["공급가"] ||
        order.product_sale_price ||
        rowData["sale_price"] ||
        rowData["공급단가"] ||
        0;
      
      // 수량: row_data의 수량 또는 주문수량
      const quantity = rowData["수량"] || rowData["주문수량"] || 1;
      
      return {
        id: order.id,
        shopName: order.shop_name,
        createdAt: order.row_created_at,
        orderNumber: rowData["주문번호"] || rowData["주문번호(사방넷)"] || rowData["주문번호(쇼핑몰)"] || null,
        internalCode: rowData["내부코드"] || null,
        productName: rowData["상품명"] || null,
        mappingCode: rowData["매핑코드"] || null,
        quantity: typeof quantity === "number" ? quantity : parseFloat(String(quantity)) || 1,
        salePrice: typeof salePrice === "number" ? salePrice : parseFloat(String(salePrice)) || 0,
        orderStatus: rowData["주문상태"] || null,
        orderDate: rowData["주문일시"] || null,
        ...rowData, // 나머지 모든 필드 포함
      };
    });
    
    console.log(`[주문 목록 조회] 포맷팅된 주문 건수: ${formattedOrders.length}`);

    return NextResponse.json({
      success: true,
      data: formattedOrders,
      count: formattedOrders.length,
    });
  } catch (error: any) {
    console.error("주문 목록 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message || "알 수 없는 오류가 발생했습니다."},
      {status: 500}
    );
  }
}
