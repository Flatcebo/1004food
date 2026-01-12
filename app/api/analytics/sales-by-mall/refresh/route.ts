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
    const {startDate, endDate} = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        {success: false, error: "시작일과 종료일이 필요합니다."},
        {status: 400}
      );
    }

    // mall 테이블에서 모든 쇼핑몰 조회
    const malls = await sql`
      SELECT id, name, code
      FROM mall
      ORDER BY name
    `;

    if (malls.length === 0) {
      return NextResponse.json(
        {success: false, error: "쇼핑몰 데이터가 없습니다."},
        {status: 400}
      );
    }

    // 먼저 기간 내 전체 주문 데이터 확인 (디버깅용)
    const debugOrders = await sql`
      SELECT 
        ur.id,
        ur.shop_name,
        ur.mall_id,
        m.name as mall_name,
        DATE(ur.created_at) as row_date_only,
        ur.created_at as row_created_at
      FROM upload_rows ur
      LEFT JOIN mall m ON ur.mall_id = m.id
      WHERE ur.company_id = ${companyId}
        AND DATE(ur.created_at) >= ${startDate}::date
        AND DATE(ur.created_at) < (${endDate}::date + INTERVAL '1 day')
      ORDER BY ur.created_at DESC
      LIMIT 10
    `;
    console.log(`[디버깅] 기간 내 전체 주문 샘플 (${startDate} ~ ${endDate}):`, debugOrders.map(o => ({
      id: o.id,
      shop_name: o.shop_name,
      mall_id: o.mall_id,
      mall_name: o.mall_name,
      row_date_only: o.row_date_only,
      row_created_at: o.row_created_at
    })));
    
    // 기간 내 전체 주문 건수 확인
    const totalOrdersInPeriod = await sql`
      SELECT COUNT(*) as count
      FROM upload_rows ur
      WHERE ur.company_id = ${companyId}
        AND DATE(ur.created_at) >= ${startDate}::date
        AND DATE(ur.created_at) < (${endDate}::date + INTERVAL '1 day')
    `;
    console.log(`[디버깅] 기간 내 전체 주문 건수: ${totalOrdersInPeriod[0]?.count || 0}`);
    
    // mall_id가 NULL인 주문 건수 확인
    const nullMallIdCount = await sql`
      SELECT COUNT(*) as count
      FROM upload_rows ur
      WHERE ur.company_id = ${companyId}
        AND ur.mall_id IS NULL
        AND DATE(ur.created_at) >= ${startDate}::date
        AND DATE(ur.created_at) < (${endDate}::date + INTERVAL '1 day')
    `;
    console.log(`[디버깅] mall_id가 NULL인 주문 건수: ${nullMallIdCount[0]?.count || 0}`);

    // 트랜잭션 시작
    await sql`BEGIN`;

    try {
      const settlements = [];
      let totalOrdersCount = 0;

      // 각 쇼핑몰별로 정산 계산
      for (const mall of malls) {
        const mallId = mall.id;
        const mallName = mall.name;

        console.log(`[${mallName}] 정산 계산 시작... (mall_id: ${mallId})`);

        // 해당 쇼핑몰의 주문 데이터 조회 (기간 필터링)
        // mall_id FK를 직접 사용하여 조회
        // upload_rows만 사용하며, 기간은 upload_rows.created_at 기준으로 필터링
        // DISTINCT로 중복 제거 (products JOIN으로 인한 중복 방지)
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
            AND ur.mall_id = ${mallId}
            -- 기간 필터링: upload_rows.created_at 기준 (날짜만 비교, endDate 포함)
            AND DATE(ur.created_at) >= ${startDate}::date
            AND DATE(ur.created_at) < (${endDate}::date + INTERVAL '1 day')
          ORDER BY ur.id
        `;

        console.log(`[${mallName}] 조회된 주문 건수: ${orders.length} (기간: ${startDate} ~ ${endDate})`);
        if (orders.length > 0) {
          // 날짜 범위 확인
          const dates = orders
            .map(o => o.row_created_at ? new Date(o.row_created_at).toISOString().split('T')[0] : null)
            .filter((d): d is string => d !== null);
          const minDate = dates.length > 0 ? Math.min(...dates.map(d => new Date(d).getTime())) : null;
          const maxDate = dates.length > 0 ? Math.max(...dates.map(d => new Date(d).getTime())) : null;
          
          // 모든 주문의 상세 정보 출력 (최대 10개)
          const orderDetails = orders.slice(0, 10).map(o => ({
            id: o.id,
            row_created_at: o.row_created_at ? new Date(o.row_created_at).toISOString().split('T')[0] : null,
            주문번호: o.row_data?.["주문번호"] || o.row_data?.["주문번호(사방넷)"] || o.row_data?.["주문번호(쇼핑몰)"] || null,
            내부코드: o.row_data?.["내부코드"] || null,
            수량: o.row_data?.["수량"] || o.row_data?.["주문수량"] || 1
          }));
          console.log(`[${mallName}] 조회된 주문 상세 (최대 10개):`, orderDetails);
          
          console.log(`[${mallName}] 샘플 주문:`, {
            id: orders[0].id,
            mall_id: orders[0].mall_id,
            shop_name: orders[0].shop_name,
            row_created_at: orders[0].row_created_at,
            row_created_at_only: orders[0].row_created_at ? new Date(orders[0].row_created_at).toISOString().split('T')[0] : null,
            date_range: minDate && maxDate ? {
              min: new Date(minDate).toISOString().split('T')[0],
              max: new Date(maxDate).toISOString().split('T')[0]
            } : null
          });
          
          // 기간 밖의 데이터가 있는지 확인
          const outOfRange = orders.filter(o => {
            if (!o.row_created_at) return false;
            const date = new Date(o.row_created_at).toISOString().split('T')[0];
            return date < startDate || date > endDate;
          });
          if (outOfRange.length > 0) {
            console.error(`[${mallName}] ⚠️ 기간 밖의 주문 발견: ${outOfRange.length}건`, outOfRange.map(o => ({
              id: o.id,
              date: o.row_created_at ? new Date(o.row_created_at).toISOString().split('T')[0] : null
            })));
          }
        }
        totalOrdersCount += orders.length;

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

          // 공급가: row_data의 공급가 또는 products의 sale_price
          const salePrice =
            rowData["공급가"] ||
            order.product_sale_price ||
            rowData["sale_price"] ||
            rowData["공급단가"] ||
            0;
          const salePriceNum = typeof salePrice === "string" ? parseFloat(salePrice) : salePrice || 0;

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

        console.log(`[${mallName}] 계산 결과 - 주문: ${orderQuantity}건/${orderAmount}원, 취소: ${cancelQuantity}건/${cancelAmount}원`);

        // 주문 건이 0이면 저장하지 않음
        if (orderQuantity === 0 && cancelQuantity === 0) {
          console.log(`[${mallName}] 주문 건이 0이므로 저장하지 않음`);
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

          if (isIdentical) {
            console.log(`[${mallName}] 기존 데이터와 동일하므로 업데이트하지 않음 (settlement_id: ${settlementId})`);
            // 기존 데이터와 동일하더라도 주문 ID는 갱신해야 함 (주문 연결 데이터 업데이트)
            // settlements 배열에는 추가하지 않음 (이미 존재하는 데이터)
            // continue하지 않고 주문 ID 저장 로직으로 진행
          } else {
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
            
            console.log(`[${mallName}] 기존 데이터 업데이트 완료`);
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
            console.log(`[${mallName}] 기존 데이터 삭제 (주문 건 0)`);
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

        // 정산에 사용된 주문 ID들을 중간 테이블에 저장 (기존 데이터와 동일하더라도 갱신)
        if (settlementId && orders.length > 0) {
          // 주문 ID 배열을 준비
          const orderIds = orders.map(order => order.id);
          
          console.log(`[${mallName}] 정산에 연결할 주문 ID 개수: ${orderIds.length}, settlement_id: ${settlementId}`);
          console.log(`[${mallName}] 주문 ID 샘플 (최대 10개):`, orderIds.slice(0, 10));
          
          // 기존 주문 연결 데이터 삭제 (갱신을 위해)
          await sql`
            DELETE FROM mall_sales_settlement_orders
            WHERE settlement_id = ${settlementId}
          `;
          
          // 배치로 삽입 (Promise.all을 사용하여 병렬 처리)
          if (orderIds.length > 0) {
            try {
              const insertPromises = orderIds.map(orderId => 
                sql`
                  INSERT INTO mall_sales_settlement_orders (settlement_id, order_id)
                  VALUES (${settlementId}, ${orderId})
                  ON CONFLICT (settlement_id, order_id) DO NOTHING
                `
              );
              
              await Promise.all(insertPromises);
              
              // 저장 확인
              const savedCount = await sql`
                SELECT COUNT(*) as count
                FROM mall_sales_settlement_orders
                WHERE settlement_id = ${settlementId}
              `;
              
              console.log(`[${mallName}] ${orderIds.length}개의 주문 ID를 정산 데이터에 연결 완료 (실제 저장된 개수: ${savedCount[0]?.count || 0})`);
            } catch (error: any) {
              console.error(`[${mallName}] 주문 ID 연결 중 오류 발생:`, error);
              throw error;
            }
          }
        } else {
          if (!settlementId) {
            console.warn(`[${mallName}] settlementId가 없어서 주문 ID를 연결하지 않습니다.`);
          }
          if (orders.length === 0) {
            console.log(`[${mallName}] 주문이 없어서 주문 ID를 연결하지 않습니다.`);
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

      console.log(`총 ${totalOrdersCount}건의 주문 데이터로 ${settlements.length}개 쇼핑몰 정산 완료`);

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
