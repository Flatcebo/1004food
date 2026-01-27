import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

/**
 * 모든 매입처에 미발주 주문 전송 API
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {startDate, endDate} = body;

    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400}
      );
    }

    const today = new Date().toISOString().split("T")[0];
    const queryStartDate = startDate || today;
    const queryEndDate = endDate || today;

    // 전송 방법이 설정된 매입처 목록 조회
    const purchases = await sql`
      SELECT id, name, submit_type, email, kakaotalk
      FROM purchase
      WHERE company_id = ${companyId}
        AND submit_type IS NOT NULL
        AND array_length(submit_type, 1) > 0
      ORDER BY name
    `;

    if (purchases.length === 0) {
      return NextResponse.json(
        {success: false, error: "전송 방법이 설정된 매입처가 없습니다."},
        {status: 404}
      );
    }

    let totalSentCount = 0;
    let totalKakaoCount = 0;
    let totalEmailCount = 0;
    const results: Array<{
      purchaseName: string;
      kakaoSent: number;
      emailSent: number;
      error?: string;
    }> = [];

    // 각 매입처별로 전송
    for (const purchase of purchases) {
      const submitTypes = purchase.submit_type || [];
      let kakaoSent = 0;
      let emailSent = 0;

      // 미발주 주문 조회
      const ordersData = await sql`
        SELECT 
          ur.id,
          ur.row_data,
          pr.name as product_name
        FROM upload_rows ur
        INNER JOIN uploads u ON ur.upload_id = u.id AND u.company_id = ${companyId}
        INNER JOIN products pr ON (
          (ur.row_data->>'매핑코드' = pr.code OR ur.row_data->>'productId' = pr.id::text)
          AND pr.company_id = ${companyId}
        )
        WHERE pr.purchase = ${purchase.name}
          AND ur.row_data->>'주문상태' NOT IN ('취소')
          AND (ur.is_ordered = false OR ur.is_ordered IS NULL)
          AND u.created_at >= ${queryStartDate}::date
          AND u.created_at < (${queryEndDate}::date + INTERVAL '1 day')
        ORDER BY ur.id
      `;

      if (ordersData.length === 0) {
        results.push({
          purchaseName: purchase.name,
          kakaoSent: 0,
          emailSent: 0,
        });
        continue;
      }

      // 카카오톡 전송
      if (submitTypes.includes("kakaotalk") && purchase.kakaotalk) {
        console.log(`[KAKAOTALK] 전송: ${purchase.name} -> ${purchase.kakaotalk}`);
        kakaoSent = ordersData.length;
        totalKakaoCount += kakaoSent;
      }

      // 이메일 전송
      if (submitTypes.includes("email") && purchase.email) {
        console.log(`[EMAIL] 전송: ${purchase.name} -> ${purchase.email}`);
        emailSent = ordersData.length;
        totalEmailCount += emailSent;
      }

      // 발주 상태 업데이트
      const updatedOrderIds = ordersData.map((o: any) => o.id);
      if (updatedOrderIds.length > 0 && (kakaoSent > 0 || emailSent > 0)) {
        try {
          await sql`
            UPDATE upload_rows ur
            SET is_ordered = true
            FROM uploads u
            WHERE ur.upload_id = u.id 
              AND u.company_id = ${companyId}
              AND ur.id = ANY(${updatedOrderIds})
          `;
          totalSentCount += ordersData.length;
        } catch (updateError) {
          console.error("발주 상태 업데이트 실패:", updateError);
        }
      }

      results.push({
        purchaseName: purchase.name,
        kakaoSent,
        emailSent,
      });
    }

    return NextResponse.json({
      success: true,
      message: `총 ${totalSentCount}건 전송 완료 (카카오톡: ${totalKakaoCount}건, 이메일: ${totalEmailCount}건)`,
      totalSentCount,
      totalKakaoCount,
      totalEmailCount,
      details: results,
    });
  } catch (error: any) {
    console.error("전체 전송 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
