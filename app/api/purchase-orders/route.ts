import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";
import {getTodayDate} from "@/utils/date";

/**
 * 매입처별 주문 통계 조회 API
 * GET: 매입처 리스트와 주문 통계 조회
 */
export async function GET(request: NextRequest) {
  try {
    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400},
      );
    }

    // URL 파라미터 추출
    const {searchParams} = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // 오늘 날짜 기본값 (한국 시간 기준)
    const today = getTodayDate();
    const queryStartDate = startDate || today;
    const queryEndDate = endDate || today;

    // 한국 시간(KST) 기준으로 날짜 범위를 UTC로 변환
    const startKoreaStr = `${queryStartDate}T00:00:00+09:00`;
    const endKoreaStr = `${queryEndDate}T23:59:59.999+09:00`;
    const dateFromUTC = new Date(startKoreaStr);
    const dateToUTC = new Date(endKoreaStr);

    // 매입처 리스트와 주문 통계 조회 (purchase_id FK 사용)
    const purchaseStats = await sql`
      SELECT 
        p.id as purchase_id,
        p.name as purchase_name,
        p.submit_type,
        p.email,
        p.kakaotalk,
        COUNT(DISTINCT ur.id) FILTER (
          WHERE ur.id IS NOT NULL 
          AND ur.row_data->>'주문상태' NOT IN ('취소')
        ) as total_orders,
        COUNT(DISTINCT ur.id) FILTER (
          WHERE ur.id IS NOT NULL 
          AND ur.is_ordered = true
          AND ur.row_data->>'주문상태' NOT IN ('취소')
        ) as ordered_count,
        COUNT(DISTINCT ur.id) FILTER (
          WHERE ur.id IS NOT NULL 
          AND (ur.is_ordered = false OR ur.is_ordered IS NULL)
          AND ur.row_data->>'주문상태' NOT IN ('취소')
        ) as unordered_count
      FROM purchase p
      LEFT JOIN upload_rows ur ON ur.purchase_id = p.id
      LEFT JOIN uploads u ON ur.upload_id = u.id AND u.company_id = ${companyId}
      WHERE p.company_id = ${companyId}
        AND (u.created_at IS NULL OR (
          u.created_at >= ${dateFromUTC.toISOString()}::timestamptz
          AND u.created_at <= ${dateToUTC.toISOString()}::timestamptz
        ))
      GROUP BY p.id, p.name, p.submit_type, p.email, p.kakaotalk
      ORDER BY p.name
    `;

    return NextResponse.json({
      success: true,
      data: purchaseStats.map((row: any) => ({
        id: row.purchase_id,
        name: row.purchase_name,
        submitType: row.submit_type || [],
        email: row.email,
        kakaotalk: row.kakaotalk,
        totalOrders: parseInt(row.total_orders) || 0,
        orderedCount: parseInt(row.ordered_count) || 0,
        unorderedCount: parseInt(row.unordered_count) || 0,
      })),
      period: {
        startDate: queryStartDate,
        endDate: queryEndDate,
      },
    });
  } catch (error: any) {
    console.error("매입처별 주문 통계 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500},
    );
  }
}
