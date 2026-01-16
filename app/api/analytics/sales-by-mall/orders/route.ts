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
    const settlementId = searchParams.get("settlementId");
    const mallId = searchParams.get("mallId");
    let startDate = searchParams.get("startDate");
    let endDate = searchParams.get("endDate");

    // settlementId가 있으면 우선 사용, 없으면 기존 방식 (하위 호환성)
    if (!settlementId && !mallId) {
      return NextResponse.json(
        {success: false, error: "settlementId 또는 mallId가 필요합니다."},
        {status: 400}
      );
    }

    // settlementId가 없을 때만 startDate와 endDate 필요
    if (!settlementId && (!startDate || !endDate)) {
      return NextResponse.json(
        {success: false, error: "settlementId가 없을 경우 시작일과 종료일이 필요합니다."},
        {status: 400}
      );
    }

    let mallIdInt: number | null = null;
    let settlementIdInt: number | null = null;

    // settlementId가 있으면 해당 정산에 연결된 주문들만 조회
    if (settlementId) {
      settlementIdInt = parseInt(settlementId, 10);
      if (isNaN(settlementIdInt)) {
        return NextResponse.json(
          {success: false, error: "잘못된 settlementId입니다."},
          {status: 400}
        );
      }
      
      // 정산 데이터에서 mall_id와 기간 정보 가져오기
      const settlementData = await sql`
        SELECT 
          mall_id,
          TO_CHAR(period_start_date, 'YYYY-MM-DD') as period_start_date,
          TO_CHAR(period_end_date, 'YYYY-MM-DD') as period_end_date
        FROM mall_sales_settlements
        WHERE id = ${settlementIdInt}
          AND company_id = ${companyId}
        LIMIT 1
      `;
      
      if (settlementData.length === 0) {
        return NextResponse.json(
          {success: false, error: "정산 데이터를 찾을 수 없습니다."},
          {status: 404}
        );
      }
      
      mallIdInt = settlementData[0].mall_id;
      startDate = settlementData[0].period_start_date;
      endDate = settlementData[0].period_end_date;
      
      console.log(`[주문 목록 조회] settlementId 사용: settlement_id=${settlementIdInt}, mall_id=${mallIdInt}, 기간: ${startDate} ~ ${endDate}`);
    } else {
      // 기존 방식: 날짜만 추출 (YYYY-MM-DD 형식)
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
      if (!startDate || !endDate || !dateRegex.test(startDate) || !dateRegex.test(endDate)) {
        console.error(`[주문 목록 조회] 잘못된 날짜 형식: startDate=${startDate}, endDate=${endDate}`);
        return NextResponse.json(
          {success: false, error: `잘못된 날짜 형식입니다. (startDate: ${startDate}, endDate: ${endDate})`},
          {status: 400}
        );
      }
      
      mallIdInt = parseInt(mallId!, 10);
      
      console.log(`[주문 목록 조회] 원본 파라미터:`, {
        mallId,
        startDate_원본: searchParams.get("startDate"),
        endDate_원본: searchParams.get("endDate"),
      });
      console.log(`[주문 목록 조회] 처리 후: company_id: ${companyId}, mall_id: ${mallIdInt}, 기간: ${startDate} ~ ${endDate}`);
    }

    // settlementId가 있으면 해당 정산에 연결된 주문들만 조회
    let orders: any[];
    
    if (settlementIdInt) {
      // 정산에 연결된 주문 데이터를 조회 (저장된 order_data와 product_data 사용)
      const settlementOrders = await sql`
        SELECT 
          order_id,
          order_data,
          product_data,
          created_at as saved_at
        FROM mall_sales_settlement_orders
        WHERE settlement_id = ${settlementIdInt}
        ORDER BY order_id
      `;
      
      if (settlementOrders.length === 0) {
        console.log(`[주문 목록 조회] 정산에 연결된 주문이 없습니다. (settlement_id=${settlementIdInt})`);
        orders = [];
      } else {
        console.log(`[주문 목록 조회] 정산에 저장된 주문 개수: ${settlementOrders.length}`);
        console.log(`[주문 목록 조회] 주문 ID 샘플 (최대 10개):`, settlementOrders.slice(0, 10).map(so => so.order_id));
        
        // 저장된 order_data와 product_data를 사용하여 주문 데이터 구성
        // order_id로 upload_rows에서 기본 정보만 가져오고, 실제 주문 데이터와 상품 정보는 저장된 데이터 사용
        const orderIds = settlementOrders.map(so => so.order_id);
        
        const uploadRowsData = await sql`
          SELECT DISTINCT ON (ur.id)
            ur.id,
            ur.shop_name,
            ur.mall_id,
            ur.created_at as row_created_at
          FROM upload_rows ur
          WHERE ur.company_id = ${companyId}
            AND ur.id = ANY(${orderIds})
          ORDER BY ur.id
        `;
        
        // upload_rows 데이터를 맵으로 변환
        const uploadRowsMap = new Map(uploadRowsData.map(ur => [ur.id, ur]));
        
        // 저장된 order_data, product_data와 upload_rows 데이터를 결합
        orders = settlementOrders.map(so => {
          const uploadRow = uploadRowsMap.get(so.order_id);
          const productData = so.product_data || {};
          return {
            id: so.order_id,
            row_data: so.order_data || {}, // 저장된 주문 데이터 사용
            shop_name: uploadRow?.shop_name || null,
            mall_id: uploadRow?.mall_id || null,
            row_created_at: uploadRow?.row_created_at || so.saved_at,
            product_price: productData.price || null, // 저장된 상품 정보 사용
            product_sale_price: productData.sale_price || null, // 저장된 상품 정보 사용
          };
        });
        
        console.log(`[주문 목록 조회] 저장된 주문 데이터와 상품 정보로 구성된 주문 건수: ${orders.length}`);
      }
    } else {
      // 기존 방식: 기간 필터링으로 주문 조회
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
      orders = await sql`
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
    }

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

    // 행사가 조회 (mallId와 매핑코드 기준)
    const promotions = await sql`
      SELECT mall_id, product_code, discount_rate, event_price
      FROM mall_promotions
      WHERE mall_id = ${mallIdInt}
    `;
    
    // 행사가 맵 생성: {productCode: {discountRate, eventPrice}}
    const promotionMap: {[key: string]: {discountRate: number | null; eventPrice: number | null}} = {};
    promotions.forEach((promo: any) => {
      promotionMap[promo.product_code] = {
        discountRate: promo.discount_rate,
        eventPrice: promo.event_price,
      };
    });

    // 주문 데이터 포맷팅 (refresh/route.ts와 동일한 로직 사용)
    const formattedOrders = orders.map((order: any) => {
      const rowData = order.row_data || {};
      
      // 매핑코드만 사용하여 행사가 조회
      const mappingCode = rowData["매핑코드"] || null;
      
      // 행사가 확인 (매핑코드로만 조회)
      let eventPrice: number | null = null;
      let discountRate: number | null = null;
      if (mappingCode) {
        const promotion = promotionMap[mappingCode];
        if (promotion) {
          eventPrice = promotion.eventPrice;
          discountRate = promotion.discountRate;
        }
      }
      
      // 공급가: 원래 상품의 공급가 (행사가 적용하지 않음)
      // row_data의 공급가 또는 products의 sale_price
      let salePrice =
        rowData["공급가"] ||
        order.product_sale_price ||
        rowData["sale_price"] ||
        rowData["공급단가"] ||
        0;
      const salePriceNum = typeof salePrice === "number" ? salePrice : parseFloat(String(salePrice)) || 0;
      
      // 행사가는 이미 위에서 mall_promotions 테이블에서 업체명(mall_id)과 매핑코드로 조회됨
      // 공급가에는 행사가를 적용하지 않고 원래 값을 그대로 사용
      
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
        salePrice: salePriceNum,
        eventPrice: eventPrice, // 행사가 추가
        discountRate: discountRate, // 할인율 추가 (참고용)
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
