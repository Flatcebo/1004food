import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

/**
 * 매입처별 주문 전송 API (카카오톡/이메일)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {purchaseId, orderIds, sendType, startDate, endDate} = body;

    if (!purchaseId || !sendType) {
      return NextResponse.json(
        {success: false, error: "purchaseId와 sendType이 필요합니다."},
        {status: 400},
      );
    }

    if (!["kakaotalk", "email"].includes(sendType)) {
      return NextResponse.json(
        {success: false, error: "유효하지 않은 sendType입니다."},
        {status: 400},
      );
    }

    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400},
      );
    }

    // 매입처 정보 조회
    const purchaseResult = await sql`
      SELECT id, name, submit_type, email, kakaotalk
      FROM purchase
      WHERE id = ${purchaseId} AND company_id = ${companyId}
    `;

    if (purchaseResult.length === 0) {
      return NextResponse.json(
        {success: false, error: "매입처를 찾을 수 없습니다."},
        {status: 404},
      );
    }

    const purchase = purchaseResult[0];

    // 전송 방법 확인
    if (sendType === "kakaotalk" && !purchase.kakaotalk) {
      return NextResponse.json(
        {success: false, error: "카카오톡 정보가 등록되지 않았습니다."},
        {status: 400},
      );
    }

    if (sendType === "email" && !purchase.email) {
      return NextResponse.json(
        {success: false, error: "이메일 정보가 등록되지 않았습니다."},
        {status: 400},
      );
    }

    // 주문 데이터 조회
    let ordersData;
    if (orderIds && orderIds.length > 0) {
      ordersData = await sql`
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
        WHERE ur.id = ANY(${orderIds})
          AND pr.purchase = ${purchase.name}
        ORDER BY ur.id
      `;
    } else {
      ordersData = await sql`
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
          AND u.created_at >= ${startDate}::date
          AND u.created_at < (${endDate}::date + INTERVAL '1 day')
        ORDER BY ur.id
      `;
    }

    if (ordersData.length === 0) {
      return NextResponse.json(
        {success: false, error: "전송할 주문이 없습니다."},
        {status: 404},
      );
    }

    // TODO: 실제 카카오톡/이메일 전송 로직 구현
    // 현재는 전송 시뮬레이션만 수행
    console.log(`[${sendType.toUpperCase()}] 전송 시작`);
    console.log(`매입처: ${purchase.name}`);
    console.log(
      `전송 대상: ${sendType === "kakaotalk" ? purchase.kakaotalk : purchase.email}`,
    );
    console.log(`주문 건수: ${ordersData.length}건`);

    // 발주 상태 업데이트 및 차수 정보 저장
    const updatedOrderIds = ordersData.map((o: any) => o.id);
    if (updatedOrderIds.length > 0) {
      try {
        // 한국 시간 계산
        const now = new Date();
        const koreaTimeMs = now.getTime() + 9 * 60 * 60 * 1000; // UTC + 9시간
        const koreaDate = new Date(koreaTimeMs);
        const batchDate = koreaDate.toISOString().split("T")[0];

        // 한국 시간을 PostgreSQL timestamp 형식으로 변환 (YYYY-MM-DD HH:mm:ss)
        const koreaYear = koreaDate.getUTCFullYear();
        const koreaMonth = String(koreaDate.getUTCMonth() + 1).padStart(2, "0");
        const koreaDay = String(koreaDate.getUTCDate()).padStart(2, "0");
        const koreaHours = String(koreaDate.getUTCHours()).padStart(2, "0");
        const koreaMinutes = String(koreaDate.getUTCMinutes()).padStart(2, "0");
        const koreaSeconds = String(koreaDate.getUTCSeconds()).padStart(2, "0");
        const koreaTimestamp = `${koreaYear}-${koreaMonth}-${koreaDay} ${koreaHours}:${koreaMinutes}:${koreaSeconds}`;

        // 해당 매입처의 오늘 마지막 batch_number 조회
        const lastBatchResult = await sql`
          SELECT COALESCE(MAX(batch_number), 0) as last_batch
          FROM order_batches
          WHERE company_id = ${companyId}
            AND purchase_id = ${purchase.id}
            AND batch_date = ${batchDate}::date
        `;
        const lastBatchNumber = lastBatchResult[0]?.last_batch || 0;
        const newBatchNumber = lastBatchNumber + 1;

        // 새 batch 생성 (한국 시간으로 created_at 설정)
        const newBatchResult = await sql`
          INSERT INTO order_batches (company_id, purchase_id, batch_number, batch_date, created_at)
          VALUES (
            ${companyId}, 
            ${purchase.id}, 
            ${newBatchNumber}, 
            ${batchDate}::date,
            ${koreaTimestamp}::timestamp
          )
          RETURNING id
        `;
        const newBatchId = newBatchResult[0]?.id;

        // upload_rows 업데이트 (is_ordered = true, order_batch_id 설정)
        await sql`
          UPDATE upload_rows ur
          SET is_ordered = true,
              order_batch_id = ${newBatchId}
          FROM uploads u
          WHERE ur.upload_id = u.id 
            AND u.company_id = ${companyId}
            AND ur.id = ANY(${updatedOrderIds})
        `;

        console.log(
          `[${sendType.toUpperCase()}] ${purchase.name}: ${newBatchNumber}차 발주 (${updatedOrderIds.length}건)`,
        );
      } catch (updateError) {
        console.error("발주 상태 업데이트 실패:", updateError);
      }
    }

    return NextResponse.json({
      success: true,
      message: `${ordersData.length}건의 주문이 ${sendType === "kakaotalk" ? "카카오톡" : "이메일"}으로 전송되었습니다.`,
      sentCount: ordersData.length,
      recipient: sendType === "kakaotalk" ? purchase.kakaotalk : purchase.email,
    });
  } catch (error: any) {
    console.error("전송 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500},
    );
  }
}
