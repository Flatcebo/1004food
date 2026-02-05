import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";
import {
  getKoreaDateString,
  isValidPromotionPeriod,
  parseKoreaDate,
} from "@/utils/koreaTime";

/**
 * 매입처별 매출 정산 갱신 API
 */
export async function POST(request: NextRequest) {
  try {
    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400},
      );
    }

    const body = await request.json();
    const {startDate, endDate, purchaseId} = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        {success: false, error: "startDate와 endDate가 필요합니다."},
        {status: 400},
      );
    }

    // purchase_sales_settlements 테이블 생성 (없는 경우)
    await sql`
      CREATE TABLE IF NOT EXISTS purchase_sales_settlements (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        purchase_id INTEGER NOT NULL REFERENCES purchase(id) ON DELETE CASCADE,
        period_start_date DATE NOT NULL,
        period_end_date DATE NOT NULL,
        order_quantity INTEGER DEFAULT 0,
        order_amount DECIMAL(15, 2) DEFAULT 0,
        cancel_quantity INTEGER DEFAULT 0,
        cancel_amount DECIMAL(15, 2) DEFAULT 0,
        net_sales_quantity INTEGER DEFAULT 0,
        net_sales_amount DECIMAL(15, 2) DEFAULT 0,
        total_profit_amount DECIMAL(15, 2) DEFAULT 0,
        total_profit_rate DECIMAL(5, 2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id, purchase_id, period_start_date, period_end_date)
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_purchase_sales_settlements_company_id 
      ON purchase_sales_settlements(company_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_purchase_sales_settlements_purchase_id 
      ON purchase_sales_settlements(purchase_id)
    `;

    // 매입처 목록 조회
    let purchases;
    if (purchaseId) {
      purchases = await sql`
        SELECT id, name FROM purchase 
        WHERE id = ${purchaseId} AND company_id = ${companyId}
      `;
    } else {
      purchases = await sql`
        SELECT id, name FROM purchase 
        WHERE company_id = ${companyId}
        ORDER BY name
      `;
    }

    // 행사가 조회 및 기간 체크 (한 번에 모든 행사가 조회)
    const allPromotions = await sql`
      SELECT id, mall_id, product_code, discount_rate, event_price,
             TO_CHAR(start_date, 'YYYY-MM-DD') as start_date,
             TO_CHAR(end_date, 'YYYY-MM-DD') as end_date
      FROM mall_promotions
    `;

    const promotionMap: {
      [key: string]: {discountRate: number | null; eventPrice: number | null};
    } = {};
    const promotionIdsToDelete: number[] = [];
    const currentDate = getKoreaDateString();

    allPromotions.forEach((promo: any) => {
      // 행사 기간 체크
      const isValid = isValidPromotionPeriod(promo.start_date, promo.end_date);

      if (!isValid) {
        // 기간이 지났으면 삭제 대상에 추가
        if (parseKoreaDate(promo.end_date) < parseKoreaDate(currentDate)) {
          promotionIdsToDelete.push(promo.id);
        }
        // 기간이 아니면 적용하지 않음
        return;
      }

      // 유효한 행사 기간이면 적용
      const key = `${promo.mall_id}_${promo.product_code}`;
      promotionMap[key] = {
        discountRate: promo.discount_rate,
        eventPrice: promo.event_price,
      };
    });

    // 만료된 행사 삭제
    if (promotionIdsToDelete.length > 0) {
      await sql`
        DELETE FROM mall_promotions
        WHERE id = ANY(${promotionIdsToDelete})
      `;
    }

    let processedCount = 0;

    // 각 매입처별로 정산 데이터 계산
    for (const purchase of purchases) {
      // 주문 데이터 집계 (행사가 적용 포함)
      // 각 주문의 mall_id와 product_code를 사용하여 행사가 확인
      const orderData = await sql`
        SELECT DISTINCT ON (ur.id)
          ur.id,
          ur.mall_id,
          ur.row_data,
          pr.sale_price as product_sale_price,
          pr.code as product_code
        FROM upload_rows ur
        INNER JOIN uploads u ON ur.upload_id = u.id AND u.company_id = ${companyId}
        LEFT JOIN LATERAL (
          SELECT id, code, name, sale_price
          FROM products
          WHERE company_id = ${companyId}
            AND (
              (ur.row_data->>'productId' IS NOT NULL AND id = (ur.row_data->>'productId')::integer)
              OR (ur.row_data->>'매핑코드' IS NOT NULL AND code = ur.row_data->>'매핑코드')
            )
            AND purchase = ${purchase.name}
          LIMIT 1
        ) pr ON true
        WHERE ur.row_data->>'주문상태' NOT IN ('취소')
          AND pr.id IS NOT NULL
          AND DATE(ur.created_at) >= ${startDate}::date
          AND DATE(ur.created_at) < (${endDate}::date + INTERVAL '1 day')
      `;

      // 취소 데이터 집계 (행사가 적용 포함)
      const cancelData = await sql`
        SELECT DISTINCT ON (ur.id)
          ur.id,
          ur.mall_id,
          ur.row_data,
          pr.sale_price as product_sale_price,
          pr.code as product_code
        FROM upload_rows ur
        INNER JOIN uploads u ON ur.upload_id = u.id AND u.company_id = ${companyId}
        LEFT JOIN LATERAL (
          SELECT id, code, name, sale_price
          FROM products
          WHERE company_id = ${companyId}
            AND (
              (ur.row_data->>'productId' IS NOT NULL AND id = (ur.row_data->>'productId')::integer)
              OR (ur.row_data->>'매핑코드' IS NOT NULL AND code = ur.row_data->>'매핑코드')
            )
            AND purchase = ${purchase.name}
          LIMIT 1
        ) pr ON true
        WHERE ur.row_data->>'주문상태' = '취소'
          AND pr.id IS NOT NULL
          AND DATE(ur.created_at) >= ${startDate}::date
          AND DATE(ur.created_at) < (${endDate}::date + INTERVAL '1 day')
      `;

      // 주문 금액 계산 (행사가 적용)
      let orderQuantity = 0;
      let orderAmount = 0;
      for (const order of orderData) {
        const rowData = order.row_data || {};
        const quantity =
          parseFloat(rowData["수량"] || rowData["주문수량"] || "1") || 1;
        const productCode =
          rowData["매핑코드"] || rowData["productId"] || order.product_code;

        // 행사가 확인
        let salePrice = order.product_sale_price || 0;
        if (order.mall_id && productCode) {
          const promoKey = `${order.mall_id}_${productCode}`;
          const promotion = promotionMap[promoKey];
          if (promotion) {
            // 행사가 적용: 행사가가 있으면 우선 사용, 없으면 할인율 적용
            if (promotion.eventPrice !== null) {
              salePrice = promotion.eventPrice;
            } else if (promotion.discountRate !== null && salePrice > 0) {
              salePrice = Math.round(
                salePrice * (1 - promotion.discountRate / 100),
              );
            }
          }
        }

        orderQuantity += quantity;
        orderAmount += salePrice * quantity;
      }

      // 취소 금액 계산 (행사가 적용)
      let cancelQuantity = 0;
      let cancelAmount = 0;
      for (const cancel of cancelData) {
        const rowData = cancel.row_data || {};
        const quantity =
          parseFloat(rowData["수량"] || rowData["주문수량"] || "1") || 1;
        const productCode =
          rowData["매핑코드"] || rowData["productId"] || cancel.product_code;

        // 행사가 확인
        let salePrice = cancel.product_sale_price || 0;
        if (cancel.mall_id && productCode) {
          const promoKey = `${cancel.mall_id}_${productCode}`;
          const promotion = promotionMap[promoKey];
          if (promotion) {
            // 행사가 적용: 행사가가 있으면 우선 사용, 없으면 할인율 적용
            if (promotion.eventPrice !== null) {
              salePrice = promotion.eventPrice;
            } else if (promotion.discountRate !== null && salePrice > 0) {
              salePrice = Math.round(
                salePrice * (1 - promotion.discountRate / 100),
              );
            }
          }
        }

        cancelQuantity += quantity;
        cancelAmount += salePrice * quantity;
      }
      const netSalesQuantity = orderQuantity - cancelQuantity;
      const netSalesAmount = orderAmount - cancelAmount;

      // 총이익 계산 (매입가 정보가 없으므로 일단 0으로 설정)
      const totalProfitAmount = 0;
      const totalProfitRate =
        netSalesAmount > 0 ? (totalProfitAmount / netSalesAmount) * 100 : 0;

      // 정산 데이터 저장 (UPSERT)
      await sql`
        INSERT INTO purchase_sales_settlements (
          company_id,
          purchase_id,
          period_start_date,
          period_end_date,
          order_quantity,
          order_amount,
          cancel_quantity,
          cancel_amount,
          net_sales_quantity,
          net_sales_amount,
          total_profit_amount,
          total_profit_rate,
          updated_at
        ) VALUES (
          ${companyId},
          ${purchase.id},
          ${startDate}::date,
          ${endDate}::date,
          ${orderQuantity},
          ${orderAmount},
          ${cancelQuantity},
          ${cancelAmount},
          ${netSalesQuantity},
          ${netSalesAmount},
          ${totalProfitAmount},
          ${totalProfitRate},
          CURRENT_TIMESTAMP
        )
        ON CONFLICT (company_id, purchase_id, period_start_date, period_end_date)
        DO UPDATE SET
          order_quantity = EXCLUDED.order_quantity,
          order_amount = EXCLUDED.order_amount,
          cancel_quantity = EXCLUDED.cancel_quantity,
          cancel_amount = EXCLUDED.cancel_amount,
          net_sales_quantity = EXCLUDED.net_sales_quantity,
          net_sales_amount = EXCLUDED.net_sales_amount,
          total_profit_amount = EXCLUDED.total_profit_amount,
          total_profit_rate = EXCLUDED.total_profit_rate,
          updated_at = CURRENT_TIMESTAMP
      `;

      processedCount++;
    }

    return NextResponse.json({
      success: true,
      message: `${processedCount}개 매입처의 정산 데이터가 갱신되었습니다.`,
      processedCount,
    });
  } catch (error: any) {
    console.error("매입처별 정산 갱신 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500},
    );
  }
}
