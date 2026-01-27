import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

/**
 * 매입처별 정산 주문 목록 조회 API
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
    const settlementId = searchParams.get("settlementId");

    if (!settlementId) {
      return NextResponse.json(
        {success: false, error: "settlementId가 필요합니다."},
        {status: 400}
      );
    }

    // 정산 데이터 조회
    const settlement = await sql`
      SELECT 
        pss.id,
        pss.purchase_id,
        p.name as purchase_name,
        TO_CHAR(pss.period_start_date, 'YYYY-MM-DD') as period_start_date,
        TO_CHAR(pss.period_end_date, 'YYYY-MM-DD') as period_end_date
      FROM purchase_sales_settlements pss
      INNER JOIN purchase p ON pss.purchase_id = p.id
      WHERE pss.id = ${settlementId} AND pss.company_id = ${companyId}
    `;

    if (settlement.length === 0) {
      return NextResponse.json(
        {success: false, error: "정산 데이터를 찾을 수 없습니다."},
        {status: 404}
      );
    }

    const settlementData = settlement[0];

    // 주문 목록 조회 (중복 제거를 위해 DISTINCT ON 사용)
    const orders = await sql`
      SELECT DISTINCT ON (ur.id)
        ur.id,
        ur.row_data,
        ur.created_at,
        pr.code as product_code,
        pr.name as product_name,
        pr.sale_price
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
          AND purchase = ${settlementData.purchase_name}
        LIMIT 1
      ) pr ON true
      WHERE ur.row_data->>'주문상태' NOT IN ('취소')
        AND DATE(ur.created_at) >= ${settlementData.period_start_date}::date
        AND DATE(ur.created_at) < (${settlementData.period_end_date}::date + INTERVAL '1 day')
        AND pr.id IS NOT NULL
      ORDER BY ur.id, u.created_at DESC
    `;

    return NextResponse.json({
      success: true,
      data: orders.map((row: any) => ({
        id: row.id,
        orderNumber: row.row_data?.["주문번호"] || null,
        internalCode: row.row_data?.["내부코드"] || null,
        productName: row.row_data?.["상품명"] || row.product_name,
        mappingCode: row.row_data?.["매핑코드"] || row.product_code,
        quantity: parseFloat(row.row_data?.["수량"]) || 1,
        salePrice: parseFloat(row.sale_price) || 0,
        orderStatus: row.row_data?.["주문상태"] || null,
        orderDate: row.row_data?.["주문일시"] || null,
        createdAt: row.created_at,
      })),
    });
  } catch (error: any) {
    console.error("매입처별 정산 주문 목록 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
