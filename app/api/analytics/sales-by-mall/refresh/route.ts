import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

/**
 * POST /api/analytics/sales-by-mall/refresh
 * 기간별 매출 정산 계산 및 저장
 */
export async function POST(request: NextRequest) {
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
    const {startDate, endDate, mallId} = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        {success: false, error: "시작일과 종료일이 필요합니다."},
        {status: 400}
      );
    }

    // mall 테이블에서 쇼핑몰 조회 (mallId가 있으면 해당 쇼핑몰만, 없으면 전체)
    let malls;
    if (mallId) {
      malls = await sql`
        SELECT id, name, code
        FROM mall
        WHERE id = ${mallId}::int
        ORDER BY name
      `;
    } else {
      malls = await sql`
        SELECT id, name, code
        FROM mall
        ORDER BY name
      `;
    }

    if (malls.length === 0) {
      return NextResponse.json(
        {success: false, error: "쇼핑몰 데이터가 없습니다."},
        {status: 400}
      );
    }

    // 트랜잭션 시작
    await sql`BEGIN`;

    try {
      const settlements = [];
      let totalOrdersCount = 0;

      // 각 쇼핑몰별 행사가 조회 (한 번에 모든 쇼핑몰의 행사가 조회)
      const allPromotions = await sql`
        SELECT mall_id, product_code, discount_rate, event_price
        FROM mall_promotions
        WHERE mall_id = ANY(${malls.map((m) => m.id)})
      `;
      
      // 행사가 맵 생성: {mallId_productCode: {discountRate, eventPrice}}
      const promotionMap: {[key: string]: {discountRate: number | null; eventPrice: number | null}} = {};
      allPromotions.forEach((promo: any) => {
        const key = `${promo.mall_id}_${promo.product_code}`;
        promotionMap[key] = {
          discountRate: promo.discount_rate,
          eventPrice: promo.event_price,
        };
      });

      // 각 쇼핑몰별로 정산 계산
      for (const mall of malls) {
        const mallId = mall.id;
        const mallName = mall.name;

        // 해당 쇼핑몰의 주문 데이터 조회 (기간 필터링)
        // mall_id FK를 직접 사용하여 조회
        // upload_rows만 사용하며, 기간은 upload_rows.created_at 기준으로 필터링
        // DISTINCT로 중복 제거 (products JOIN으로 인한 중복 방지)
        // 상품 정보도 함께 조회하여 저장 (상품 정보 변경 시에도 정산이 달라지지 않도록)
        const orders = await sql`
          SELECT DISTINCT ON (ur.id)
            ur.id,
            ur.row_data,
            ur.shop_name,
            ur.mall_id,
            ur.supply_price as row_supply_price,
            ur.created_at as row_created_at,
            p.id as product_id,
            p.code as product_code,
            p.name as product_name,
            p.price as product_price,
            p.sale_price as product_sale_price,
            p.sabang_name as product_sabang_name,
            p.bill_type as product_bill_type,
            p.post_type as product_post_type,
            p.category as product_category,
            p.product_type as product_product_type
          FROM upload_rows ur
          LEFT JOIN LATERAL (
            SELECT id, code, name, price, sale_price, sabang_name, bill_type, post_type, category, product_type
            FROM products
            WHERE company_id = ${companyId}
              AND (
                -- productId가 유효하면 productId로 매칭 (우선)
                (COALESCE(ur.row_data->>'productId', '') != '' AND id::text = ur.row_data->>'productId')
                OR
                -- productId가 없거나 빈 문자열이면 매핑코드로 매칭 (대안)
                (COALESCE(ur.row_data->>'productId', '') = '' AND code = ur.row_data->>'매핑코드')
              )
            LIMIT 1
          ) p ON true
          WHERE ur.company_id = ${companyId}
            AND ur.mall_id = ${mallId}
            -- 기간 필터링: upload_rows.created_at 기준 (날짜만 비교, endDate 포함)
            AND DATE(ur.created_at) >= ${startDate}::date
            AND DATE(ur.created_at) < (${endDate}::date + INTERVAL '1 day')
          ORDER BY ur.id
        `;

        totalOrdersCount += orders.length;

        // 디버깅: 상품 매칭 결과 확인 (처음 3개만)
        if (orders.length > 0) {
          console.log(`📊 [refresh] ${mallName}: 주문 ${orders.length}건 조회됨`);
          orders.slice(0, 3).forEach((order: any, idx: number) => {
            console.log(`📊 [refresh] 샘플 ${idx + 1}:`, {
              orderId: order.id,
              row_data_매핑코드: order.row_data?.매핑코드,
              row_data_productId: order.row_data?.productId,
              matched_product_id: order.product_id,
              matched_product_code: order.product_code,
              matched_product_name: order.product_name,
            });
          });
        }

        // 주문 통계 계산
        // 작업일지 기준:
        // - 주문 수량: 해당 쇼핑몰에 해당하는 모든 주문건 (upload_rows의 개수)
        // - 주문 금액: 모든 주문건의 공급가(sale_price) 총합 (수량 곱함)
        let orderQuantity = 0; // 주문 건수 (주문 수량)
        let orderAmount = 0; // 주문 금액 (각 주문의 공급가 * 수량 합산)
        let cancelQuantity = 0; // 취소 건수 (취소 수량)
        let cancelAmount = 0; // 취소 금액
        let totalProfitAmount = 0;

        for (const order of orders) {
          const rowData = order.row_data || {};
          const orderStatus = rowData["주문상태"] || "";
          const isCanceled = orderStatus === "취소";

          // 매핑코드 또는 productId 추출
          const productCode = rowData["매핑코드"] || rowData["productId"] || null;

          // 행사가 확인
          let eventPrice: number | null = null;
          let discountRate: number | null = null;
          if (productCode) {
            const promoKey = `${mallId}_${productCode}`;
            const promotion = promotionMap[promoKey];
            if (promotion) {
              eventPrice = promotion.eventPrice;
              discountRate = promotion.discountRate;
            }
          }

          // 공급가 우선순위: 
          // 1. 행사가 (아래에서 적용)
          // 2. upload_rows.supply_price 컬럼 (엑셀 파일에서 수집한 공급단가)
          // 3. 주문 데이터의 공급단가 (row_data["공급단가"])
          // 4. 주문 데이터의 공급가 (row_data["공급가"])
          // 5. 매핑된 상품의 공급단가 (order.product_sale_price)
          // 6. 기타 (row_data["sale_price"] 등)
          let salePrice =
            order.row_supply_price ||
            rowData["공급단가"] ||
            rowData["공급가"] ||
            order.product_sale_price ||
            rowData["sale_price"] ||
            0;
          let salePriceNum = typeof salePrice === "string" ? parseFloat(salePrice) : salePrice || 0;

          // 행사가 적용: 행사가가 있으면 우선 사용, 없으면 할인율 적용
          if (eventPrice !== null) {
            salePriceNum = eventPrice;
          } else if (discountRate !== null && salePriceNum > 0) {
            salePriceNum = Math.round(salePriceNum * (1 - discountRate / 100));
          }

          // 원가: products의 price
          const costPrice = order.product_price || rowData["원가"] || rowData["가격"] || 0;
          const costPriceNum = typeof costPrice === "string" ? parseFloat(costPrice) : costPrice || 0;

          // 수량 (금액 계산용)
          const quantity = rowData["수량"] || rowData["주문수량"] || 1;
          const quantityNum = typeof quantity === "string" ? parseFloat(quantity) : quantity || 1;

          if (isCanceled) {
            // 취소건
            cancelQuantity += 1; // 취소 건수
            // 취소 금액: 공급가 * 수량
            cancelAmount += salePriceNum * quantityNum;
          } else {
            // 주문건
            orderQuantity += 1; // 주문 건수 (주문 수량)
            // 주문 금액: 공급가 * 수량
            orderAmount += salePriceNum * quantityNum;
            // 이익액 계산: (공급가 - 원가) * 수량
            const profit = (salePriceNum - costPriceNum) * quantityNum;
            totalProfitAmount += profit;
          }
        }

        // 주문 건이 0이면 저장하지 않음
        if (orderQuantity === 0 && cancelQuantity === 0) {
          continue;
        }

        // 순매출 계산
        const netSalesQuantity = orderQuantity - cancelQuantity; // 수량 차이
        const netSalesAmount = orderAmount - cancelAmount;

        // 총이익률 계산
        const totalProfitRate =
          netSalesAmount > 0
            ? (totalProfitAmount / netSalesAmount) * 100
            : 0;

        // 판매수수료 (일단 NULL)
        const salesFeeAmount = null;
        const salesFeeRate = null;

        // 순이익 계산
        const netProfitAmount = totalProfitAmount - (salesFeeAmount || 0);
        const netProfitRate =
          netSalesAmount > 0 ? (netProfitAmount / netSalesAmount) * 100 : 0;

        // 기존 데이터 확인: 기간, 주문수, 금액 등이 모두 일치하는지 확인
        const existing = await sql`
          SELECT 
            id,
            order_quantity,
            order_amount,
            cancel_quantity,
            cancel_amount,
            net_sales_quantity,
            net_sales_amount,
            total_profit_amount,
            net_profit_amount
          FROM mall_sales_settlements
          WHERE company_id = ${companyId}
            AND mall_id = ${mallId}
            AND period_start_date = ${startDate}::date
            AND period_end_date = ${endDate}::date
        `;

        let settlementId: number | null = null;
        let isIdentical = false;

        if (existing.length > 0) {
          const existingData = existing[0];
          settlementId = existingData.id;
          
          // 기존 데이터와 모든 값이 일치하는지 확인
          isIdentical = 
            existingData.order_quantity === orderQuantity &&
            existingData.order_amount === orderAmount &&
            existingData.cancel_quantity === cancelQuantity &&
            existingData.cancel_amount === cancelAmount &&
            existingData.net_sales_quantity === netSalesQuantity &&
            existingData.net_sales_amount === netSalesAmount &&
            existingData.total_profit_amount === totalProfitAmount &&
            existingData.net_profit_amount === netProfitAmount;

          // 디버깅: isIdentical 상태 로그
          console.log(`📊 [refresh] ${mallName}: 기존 데이터 있음, settlementId=${settlementId}, isIdentical=${isIdentical}`);

          if (!isIdentical) {
            // 값이 다르면 업데이트
            await sql`
              UPDATE mall_sales_settlements
              SET
                order_quantity = ${orderQuantity},
                order_amount = ${orderAmount},
                cancel_quantity = ${cancelQuantity},
                cancel_amount = ${cancelAmount},
                net_sales_quantity = ${netSalesQuantity},
                net_sales_amount = ${netSalesAmount},
                total_profit_amount = ${totalProfitAmount},
                total_profit_rate = ${totalProfitRate},
                sales_fee_amount = ${salesFeeAmount},
                sales_fee_rate = ${salesFeeRate},
                net_profit_amount = ${netProfitAmount},
                net_profit_rate = ${netProfitRate},
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ${settlementId}
            `;
            
            // 기존 주문 연결 데이터 삭제
            await sql`
              DELETE FROM mall_sales_settlement_orders
              WHERE settlement_id = ${settlementId}
            `;
          }

          // 기존 데이터가 있고 주문 건이 0이면 삭제
          if (orderQuantity === 0 && cancelQuantity === 0) {
            // 기존 주문 연결 데이터도 함께 삭제 (CASCADE로 자동 삭제되지만 명시적으로 삭제)
            await sql`
              DELETE FROM mall_sales_settlement_orders
              WHERE settlement_id = ${settlementId}
            `;
            await sql`
              DELETE FROM mall_sales_settlements
              WHERE id = ${settlementId}
            `;
            continue;
          }

        } else {
          // 주문 건이 0이 아니면 삽입
          if (orderQuantity > 0 || cancelQuantity > 0) {
            const insertResult = await sql`
              INSERT INTO mall_sales_settlements (
                company_id,
                mall_id,
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
                sales_fee_amount,
                sales_fee_rate,
                net_profit_amount,
                net_profit_rate
              ) VALUES (
                ${companyId},
                ${mallId},
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
                ${salesFeeAmount},
                ${salesFeeRate},
                ${netProfitAmount},
                ${netProfitRate}
              )
              RETURNING id
            `;
            settlementId = insertResult[0]?.id || null;
            console.log(`[${mallName}] 신규 데이터 삽입 완료 (settlement_id: ${settlementId})`);
          }
        }

        // 정산에 사용된 주문 데이터 전체를 중간 테이블에 저장 (기존 데이터와 동일하더라도 갱신)
        if (settlementId && orders.length > 0) {
          // 디버깅: 저장 시작 로그
          console.log(`💾 [refresh] ${mallName}: 주문 데이터 저장 시작 (settlementId=${settlementId}, orders=${orders.length}개)`);
          
          // 기존 주문 연결 데이터 삭제 (갱신을 위해)
          await sql`
            DELETE FROM mall_sales_settlement_orders
            WHERE settlement_id = ${settlementId}
          `;
          console.log(`💾 [refresh] ${mallName}: 기존 주문 연결 데이터 삭제 완료`);
          
          // 배치로 삽입 (배치 크기로 나눠서 처리하여 타임아웃 방지)
          try {
            const BATCH_SIZE = 100; // 배치 크기 (연결 풀 고려하여 줄임)
            const PARALLEL_SIZE = 50; // 병렬 실행 수 제한 (데이터베이스 연결 풀 보호)
            
            // 주문을 배치 크기로 나눠서 처리
            for (let i = 0; i < orders.length; i += BATCH_SIZE) {
              const batch = orders.slice(i, i + BATCH_SIZE);
              
              // 배치 삽입을 위한 Promise 배열 생성
              const insertPromises = batch.map(order => {
                // 상품 정보 객체 생성 (상품이 있는 경우만)
                const productData = order.product_id ? {
                  id: order.product_id,
                  code: order.product_code,
                  name: order.product_name,
                  price: order.product_price,
                  sale_price: order.product_sale_price,
                  sabang_name: order.product_sabang_name,
                  bill_type: order.product_bill_type,
                  post_type: order.product_post_type,
                  category: order.product_category,
                  product_type: order.product_product_type,
                } : null;
                
                return sql`
                  INSERT INTO mall_sales_settlement_orders (settlement_id, order_id, order_data, product_data, updated_at)
                  VALUES (
                    ${settlementId}, 
                    ${order.id}, 
                    ${JSON.stringify(order.row_data || {})}::jsonb, 
                    ${productData ? JSON.stringify(productData) : null}::jsonb,
                    CURRENT_TIMESTAMP
                  )
                  ON CONFLICT (settlement_id, order_id) 
                  DO UPDATE SET 
                    order_data = EXCLUDED.order_data,
                    product_data = EXCLUDED.product_data,
                    updated_at = CURRENT_TIMESTAMP
                `;
              });
              
              // 병렬 실행 수를 제한하여 데이터베이스 연결 풀 보호
              for (let j = 0; j < insertPromises.length; j += PARALLEL_SIZE) {
                const parallelBatch = insertPromises.slice(j, j + PARALLEL_SIZE);
                await Promise.all(parallelBatch);
              }
              
              // 진행 상황 로그 (큰 배치의 경우)
              if (orders.length > BATCH_SIZE && (i + BATCH_SIZE) % (BATCH_SIZE * 5) === 0) {
                console.log(`[${mallName}] 주문 데이터 저장 진행 중: ${Math.min(i + BATCH_SIZE, orders.length)}/${orders.length}`);
              }
            }
            
            // 저장 확인
            const savedCount = await sql`
              SELECT COUNT(*) as count
              FROM mall_sales_settlement_orders
              WHERE settlement_id = ${settlementId}
            `;
            
            console.log(`✅ [refresh] ${mallName}: ${orders.length}개의 주문 데이터 저장 완료 (실제 저장된 개수: ${savedCount[0]?.count || 0})`);
            
            // 디버깅: 저장된 데이터 샘플 확인
            const savedSample = await sql`
              SELECT order_id, order_data->>'매핑코드' as mapping_code, order_data->>'productId' as product_id,
                     product_data->>'id' as saved_product_id, product_data->>'name' as saved_product_name
              FROM mall_sales_settlement_orders
              WHERE settlement_id = ${settlementId}
              LIMIT 3
            `;
            console.log(`✅ [refresh] ${mallName}: 저장된 샘플 데이터:`, savedSample.map((s: any) => ({
              order_id: s.order_id,
              mapping_code: s.mapping_code,
              product_id: s.product_id,
              saved_product_id: s.saved_product_id,
              saved_product_name: s.saved_product_name,
            })));
          } catch (error: any) {
            console.error(`[${mallName}] 주문 데이터 저장 중 오류 발생:`, error);
            throw error;
          }
        } else {
          if (!settlementId) {
            console.warn(`[${mallName}] settlementId가 없어서 주문 데이터를 저장하지 않습니다.`);
          }
          if (orders.length === 0) {
            console.log(`[${mallName}] 주문이 없어서 주문 데이터를 저장하지 않습니다.`);
          }
        }

        // settlements 배열에 추가 (주문 건이 0이 아닌 경우만, 기존 데이터와 동일한 경우는 제외)
        if ((orderQuantity > 0 || cancelQuantity > 0) && !isIdentical) {
          settlements.push({
            mallId,
            mallName,
            orderQuantity,
            orderAmount,
            cancelQuantity,
            cancelAmount,
            netSalesQuantity,
            netSalesAmount,
            totalProfitAmount,
            totalProfitRate,
            netProfitAmount,
            netProfitRate,
          });
        }
      }

      await sql`COMMIT`;

      return NextResponse.json({
        success: true,
        message: `${settlements.length}개 쇼핑몰의 정산 데이터가 저장되었습니다. (총 ${totalOrdersCount}건의 주문 데이터 처리)`,
        period: {
          startDate,
          endDate,
        },
        totalOrdersProcessed: totalOrdersCount,
        settlements,
      });
    } catch (error) {
      await sql`ROLLBACK`;
      throw error;
    }
  } catch (error: any) {
    console.error("매출 정산 갱신 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message || "알 수 없는 오류가 발생했습니다."},
      {status: 500}
    );
  }
}
