import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest, getUserIdFromRequest} from "@/lib/company";

/**
 * 선택된 매입처 또는 모든 매입처에 미발주 주문 전송 API
 * purchaseIds: 선택된 매입처 ID 배열 (없으면 전체)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {startDate, endDate, purchaseIds} = body;

    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400},
      );
    }

    const userId = await getUserIdFromRequest(request);
    const today = new Date().toISOString().split("T")[0];
    const queryStartDate = startDate || today;
    const queryEndDate = endDate || today;

    // 전송 방법이 설정된 매입처 목록 조회 (선택된 매입처가 있으면 해당 매입처만)
    let purchases;
    if (purchaseIds && Array.isArray(purchaseIds) && purchaseIds.length > 0) {
      // 선택된 매입처만 조회
      purchases = await sql`
        SELECT id, name, submit_type, email, kakaotalk
        FROM purchase
        WHERE company_id = ${companyId}
          AND id = ANY(${purchaseIds})
          AND submit_type IS NOT NULL
          AND array_length(submit_type, 1) > 0
        ORDER BY name
      `;
    } else {
      // 전체 매입처 조회
      purchases = await sql`
        SELECT id, name, submit_type, email, kakaotalk
        FROM purchase
        WHERE company_id = ${companyId}
          AND submit_type IS NOT NULL
          AND array_length(submit_type, 1) > 0
        ORDER BY name
      `;
    }

    if (purchases.length === 0) {
      return NextResponse.json(
        {success: false, error: "전송 방법이 설정된 매입처가 없습니다."},
        {status: 404},
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
        console.log(
          `[KAKAOTALK] 전송: ${purchase.name} -> ${purchase.kakaotalk}`,
        );
        kakaoSent = ordersData.length;
        totalKakaoCount += kakaoSent;
      }

      // 이메일 전송: 다운로드 로직으로 발주서 생성 후 NCP 메일 API 전송
      let emailSendSuccess = false;
      if (submitTypes.includes("email") && purchase.email) {
        try {
          const orderIds = ordersData.map((o: any) => o.id);
          const base =
            process.env.NEXT_PUBLIC_BASE_URL ||
            (process.env.VERCEL_URL
              ? `https://${process.env.VERCEL_URL}`
              : null);
          const origin = base || new URL(request.url).origin;
          const companyIdHeader = String(companyId);

          // 1. 다운로드 API로 발주서 파일 생성 (템플릿/기본 외주 발주서)
          const downloadHeaders: Record<string, string> = {
            "Content-Type": "application/json",
            "company-id": companyIdHeader,
          };
          if (userId) downloadHeaders["user-id"] = userId;
          const downloadRes = await fetch(
            `${origin}/api/purchase-orders/download`,
            {
              method: "POST",
              headers: downloadHeaders,
              body: JSON.stringify({
                purchaseId: purchase.id,
                orderIds,
                startDate: queryStartDate,
                endDate: queryEndDate,
                forEmail: true,
              }),
            },
          );

          if (!downloadRes.ok) {
            const errData = await downloadRes.json().catch(() => ({}));
            throw new Error(errData.error || "발주서 생성 실패");
          }

          const blob = await downloadRes.blob();
          const contentDisp = downloadRes.headers.get("Content-Disposition");
          let fileName = `${purchase.name}_발주서.xlsx`;
          if (contentDisp) {
            const m = contentDisp.match(/filename\*=UTF-8''(.+)/);
            if (m) fileName = decodeURIComponent(m[1]);
          }

          // 2. 이메일 API로 전송 (nodemailer)
          const formData = new FormData();
          formData.append(
            "file",
            new Blob([await blob.arrayBuffer()], {
              type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            }),
            fileName,
          );
          formData.append("recipientEmail", purchase.email);
          formData.append("purchaseName", purchase.name);

          const mailRes = await fetch(`${origin}/api/ncp/mail`, {
            method: "POST",
            headers: {"company-id": companyIdHeader},
            body: formData,
          });

          const mailResult = await mailRes.json();
          if (!mailResult.success) {
            throw new Error(mailResult.error || "이메일 전송 실패");
          }

          emailSent = ordersData.length;
          totalEmailCount += emailSent;
          emailSendSuccess = true;
          console.log(
            `[EMAIL] 전송 완료: ${purchase.name} -> ${purchase.email}`,
          );
        } catch (emailErr: any) {
          console.error(`[EMAIL] 전송 실패: ${purchase.name}`, emailErr);
          results.push({
            purchaseName: purchase.name,
            kakaoSent,
            emailSent: 0,
            error: `이메일: ${emailErr?.message || "전송 실패"}`,
          });
          continue;
        }
      }

      // 발주 상태 업데이트 및 차수 정보 저장 (카카오/이메일 전송 시)
      const updatedOrderIds = ordersData.map((o: any) => o.id);
      const shouldUpdateBatch = kakaoSent > 0 || emailSendSuccess;
      if (updatedOrderIds.length > 0 && shouldUpdateBatch) {
        try {
          // 한국 시간 기준 오늘 날짜 계산
          // 한국 시간 계산
          const now = new Date();
          const koreaTimeMs = now.getTime() + 9 * 60 * 60 * 1000; // UTC + 9시간
          const koreaDate = new Date(koreaTimeMs);
          const batchDate = koreaDate.toISOString().split("T")[0];

          // 한국 시간을 PostgreSQL timestamp 형식으로 변환 (YYYY-MM-DD HH:mm:ss)
          const koreaYear = koreaDate.getUTCFullYear();
          const koreaMonth = String(koreaDate.getUTCMonth() + 1).padStart(
            2,
            "0",
          );
          const koreaDay = String(koreaDate.getUTCDate()).padStart(2, "0");
          const koreaHours = String(koreaDate.getUTCHours()).padStart(2, "0");
          const koreaMinutes = String(koreaDate.getUTCMinutes()).padStart(
            2,
            "0",
          );
          const koreaSeconds = String(koreaDate.getUTCSeconds()).padStart(
            2,
            "0",
          );
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
          totalSentCount += ordersData.length;

          console.log(
            `[BATCH] ${purchase.name}: ${newBatchNumber}차 발주 (${ordersData.length}건)`,
          );
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
      {status: 500},
    );
  }
}
