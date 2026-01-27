import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

/**
 * 매입처별 매출 정산 조회 API
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
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const purchaseId = searchParams.get("purchaseId");

    if (!startDate || !endDate) {
      return NextResponse.json(
        {success: false, error: "startDate와 endDate가 필요합니다."},
        {status: 400}
      );
    }

    // 정산 데이터 조회 (정확히 일치하는 기간만 조회)
    let settlements;
    if (purchaseId) {
      settlements = await sql`
        SELECT 
          pss.id,
          pss.purchase_id,
          p.name as purchase_name,
          TO_CHAR(pss.period_start_date, 'YYYY-MM-DD') as period_start_date,
          TO_CHAR(pss.period_end_date, 'YYYY-MM-DD') as period_end_date,
          pss.order_quantity,
          pss.order_amount,
          pss.cancel_quantity,
          pss.cancel_amount,
          pss.net_sales_quantity,
          pss.net_sales_amount,
          pss.total_profit_amount,
          pss.total_profit_rate,
          pss.created_at,
          pss.updated_at
        FROM purchase_sales_settlements pss
        INNER JOIN purchase p ON pss.purchase_id = p.id
        WHERE pss.company_id = ${companyId}
          AND pss.purchase_id = ${purchaseId}
          AND pss.period_start_date = ${startDate}::date
          AND pss.period_end_date = ${endDate}::date
        ORDER BY p.name
      `;
    } else {
      settlements = await sql`
        SELECT 
          pss.id,
          pss.purchase_id,
          p.name as purchase_name,
          TO_CHAR(pss.period_start_date, 'YYYY-MM-DD') as period_start_date,
          TO_CHAR(pss.period_end_date, 'YYYY-MM-DD') as period_end_date,
          pss.order_quantity,
          pss.order_amount,
          pss.cancel_quantity,
          pss.cancel_amount,
          pss.net_sales_quantity,
          pss.net_sales_amount,
          pss.total_profit_amount,
          pss.total_profit_rate,
          pss.created_at,
          pss.updated_at
        FROM purchase_sales_settlements pss
        INNER JOIN purchase p ON pss.purchase_id = p.id
        WHERE pss.company_id = ${companyId}
          AND pss.period_start_date = ${startDate}::date
          AND pss.period_end_date = ${endDate}::date
        ORDER BY p.name
      `;
    }

    return NextResponse.json({
      success: true,
      data: settlements.map((row: any) => ({
        id: row.id,
        purchaseId: row.purchase_id,
        purchaseName: row.purchase_name,
        periodStartDate: row.period_start_date,
        periodEndDate: row.period_end_date,
        orderQuantity: parseInt(row.order_quantity) || 0,
        orderAmount: parseFloat(row.order_amount) || 0,
        cancelQuantity: parseInt(row.cancel_quantity) || 0,
        cancelAmount: parseFloat(row.cancel_amount) || 0,
        netSalesQuantity: parseInt(row.net_sales_quantity) || 0,
        netSalesAmount: parseFloat(row.net_sales_amount) || 0,
        totalProfitAmount: parseFloat(row.total_profit_amount) || 0,
        totalProfitRate: parseFloat(row.total_profit_rate) || 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error: any) {
    console.error("매입처별 정산 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
