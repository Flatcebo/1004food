import {NextRequest, NextResponse} from "next/server";
import {getCompanyIdFromRequest} from "@/lib/company";
import {sendOrderSheetMail} from "@/lib/mailer";

/**
 * FormData 수신 (codes/ncp_mailer와 동일):
 * - file: Excel 발주서 파일 (Blob)
 * - recipientEmail: 수신자 이메일
 * - purchaseName: 매입처명
 * - companyName: 회사명 (선택, 발신자명용)
 * - fileName: 첨부파일명 (선택)
 *
 * nodemailer 사용 (NCP API 미사용)
 * companyId로 companies 테이블에서 smtp_email, n_app_pw 조회 후 MASTER_KEY로 복호화하여 사용
 */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const recipientEmail = formData.get("recipientEmail") as string | null;
    const purchaseName = formData.get("purchaseName") as string | null;
    const companyName = formData.get("companyName") as string | null;
    const fileName = formData.get("fileName") as string | null;

    if (!file || !recipientEmail) {
      return NextResponse.json(
        {success: false, error: "file과 recipientEmail이 필요합니다."},
        {status: 400},
      );
    }

    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "회사 정보가 필요합니다. 로그인 후 company-id 헤더가 올바르게 전달되는지 확인해주세요.",
        },
        {status: 400},
      );
    }

    const today = new Date().toISOString().split("T")[0];
    const attachmentFileName =
      fileName ||
      `${today}_${purchaseName || "발주서"}_발주서.xlsx`.replace(/\s/g, "_");

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    await sendOrderSheetMail({
      recipientEmail,
      fileBuffer,
      fileName: attachmentFileName,
      purchaseName: purchaseName || "매입처",
      senderName: companyName || undefined,
      companyId,
    });

    return NextResponse.json({
      success: true,
      message: "이메일 전송이 완료되었습니다.",
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("메일 전송 오류:", err);
    return NextResponse.json(
      {success: false, error: err?.message || "서버 오류가 발생했습니다."},
      {status: 500},
    );
  }
}
