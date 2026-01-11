import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

/**
 * GET /api/analytics/sales-by-mall
 * 저장된 정산 데이터 조회
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
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const mallId = searchParams.get("mallId");

    if (!startDate || !endDate) {
      return NextResponse.json(
        {success: false, error: "시작일과 종료일이 필요합니다."},
        {status: 400}
      );
    }

    // 조건 구성
    let query = sql`
      SELECT 
        mss.id,
        mss.mall_id as "mallId",
        m.name as "mallName",
        TO_CHAR(mss.period_start_date, 'YYYY-MM-DD') as "periodStartDate",
        TO_CHAR(mss.period_end_date, 'YYYY-MM-DD') as "periodEndDate",
        mss.order_quantity as "orderQuantity",
        mss.order_amount as "orderAmount",
        mss.cancel_quantity as "cancelQuantity",
        mss.cancel_amount as "cancelAmount",
        mss.net_sales_quantity as "netSalesQuantity",
        mss.net_sales_amount as "netSalesAmount",
        mss.total_profit_amount as "totalProfitAmount",
        mss.total_profit_rate as "totalProfitRate",
        mss.sales_fee_amount as "salesFeeAmount",
        mss.sales_fee_rate as "salesFeeRate",
        mss.net_profit_amount as "netProfitAmount",
        mss.net_profit_rate as "netProfitRate",
        mss.created_at as "createdAt",
        mss.updated_at as "updatedAt"
      FROM mall_sales_settlements mss
      INNER JOIN mall m ON mss.mall_id = m.id
      WHERE mss.company_id = ${companyId}
        AND mss.period_start_date = ${startDate}::date
        AND mss.period_end_date = ${endDate}::date
        -- 주문 건이 0이 아닌 데이터만 조회
        AND (mss.order_quantity > 0 OR mss.cancel_quantity > 0)
    `;

    if (mallId) {
      query = sql`${query} AND mss.mall_id = ${parseInt(mallId, 10)}`;
    }

    query = sql`${query} ORDER BY m.name`;

    const settlements = await query;

    return NextResponse.json({
      success: true,
      data: settlements,
      period: {
        startDate,
        endDate,
      },
    });
  } catch (error: any) {
    console.error("매출 정산 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message || "알 수 없는 오류가 발생했습니다."},
      {status: 500}
    );
  }
}
