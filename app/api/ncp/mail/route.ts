import {NextRequest, NextResponse} from "next/server";
import * as crypto from "crypto";
import {getCompanyIdFromRequest} from "@/lib/company";
import sql from "@/lib/db";

function makeSignature(timestamp: string, method: string, uri: string) {
  const accessKey = process.env.NEXT_PUBLIC_NCP_ACCESS_KEY_ID!;
  const secretKey = process.env.NEXT_PUBLIC_NCP_SECRET_KEY!;
  const space = " ";
  const newLine = "\n";
  const message =
    method + space + uri + newLine + timestamp + newLine + accessKey;
  return crypto
    .createHmac("sha256", secretKey)
    .update(message)
    .digest("base64");
}

/**
 * FormData 수신:
 * - file: Excel 발주서 파일 (Blob)
 * - recipientEmail: 수신자 이메일
 * - purchaseName: 매입처명
 * - companyName: 회사명 (선택, 발신자명용)
 * - fileName: 첨부파일명 (선택)
 */
export async function POST(request: NextRequest) {
  const accessKey = process.env.NEXT_PUBLIC_NCP_ACCESS_KEY_ID;
  const secretKey = process.env.NEXT_PUBLIC_NCP_SECRET_KEY;

  if (!accessKey || !secretKey) {
    return NextResponse.json(
      {success: false, error: "NCP 메일 API 설정이 없습니다."},
      {status: 500},
    );
  }

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
    let senderName = companyName || "1004food";
    if (companyId) {
      try {
        const companyResult = await sql`
          SELECT name FROM companies WHERE id = ${companyId} LIMIT 1
        `;
        if (companyResult.length > 0) {
          senderName = companyResult[0].name;
        }
      } catch (e) {
        console.error("회사명 조회 실패:", e);
      }
    }

    const timestamp = Date.now().toString();
    const today = new Date().toISOString().split("T")[0];
    const attachmentFileName =
      fileName ||
      `${today}_${purchaseName || "발주서"}_발주서.xlsx`.replace(/\s/g, "_");

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // 1. NCP 파일 업로드 API로 파일 업로드
    const uploadFormData = new FormData();
    uploadFormData.append(
      "fileList",
      new Blob([fileBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      attachmentFileName,
    );

    const fResponse = await fetch(
      "https://mail.apigw.ntruss.com/api/v1/files",
      {
        method: "POST",
        headers: {
          "x-ncp-apigw-timestamp": timestamp,
          "x-ncp-iam-access-key": accessKey,
          "x-ncp-apigw-signature-v2": makeSignature(
            timestamp,
            "POST",
            "/api/v1/files",
          ),
        },
        body: uploadFormData,
      },
    );

    if (!fResponse.ok) {
      const errText = await fResponse.text();
      console.error("NCP 파일 업로드 실패:", errText);
      return NextResponse.json(
        {success: false, error: "파일 업로드에 실패했습니다."},
        {status: 500},
      );
    }

    const fData = await fResponse.json();
    const tempRequestId = fData.tempRequestId;
    if (!tempRequestId) {
      return NextResponse.json(
        {success: false, error: "파일 업로드 응답 형식 오류"},
        {status: 500},
      );
    }

    // 2. 업로드된 파일 ID 조회
    const getFResponse = await fetch(
      `https://mail.apigw.ntruss.com/api/v1/files/${tempRequestId}`,
      {
        method: "GET",
        headers: {
          "x-ncp-apigw-timestamp": timestamp,
          "x-ncp-iam-access-key": accessKey,
          "x-ncp-apigw-signature-v2": makeSignature(
            timestamp,
            "GET",
            `/api/v1/files/${tempRequestId}`,
          ),
        },
      },
    );

    if (!getFResponse.ok) {
      const errText = await getFResponse.text();
      console.error("NCP 파일 조회 실패:", errText);
      return NextResponse.json(
        {success: false, error: "파일 ID 조회에 실패했습니다."},
        {status: 500},
      );
    }

    const getFData = await getFResponse.json();
    const fileId = getFData?.files?.[0]?.fileId;
    if (!fileId) {
      return NextResponse.json(
        {success: false, error: "파일 ID를 찾을 수 없습니다."},
        {status: 500},
      );
    }

    const senderAddress =
      process.env.NCP_MAIL_SENDER_ADDRESS || "noreply@1004net.cloud";
    const replyTo = process.env.NCP_MAIL_REPLY_TO || "bravesky88@naver.com";
    const multiLine = "<br/>";

    const mailBody = {
      senderAddress,
      senderName,
      title: `날짜_${purchaseName || "업체명"}_${purchaseName || "매입처명"}_발주서`,
      replyTo,
      body:
        "회신은 아래 메일로 부탁드립니다." +
        multiLine +
        `<span style='color: blue; font-size: 20px;'>${replyTo}</span>` +
        multiLine +
        "발주서 내용입니다.",
      recipients: [
        {
          address: recipientEmail,
          name: purchaseName || "매입처",
          type: "R",
        },
      ],
      attachFileIds: [fileId],
      individual: true,
      advertising: false,
    };

    const mailResponse = await fetch(
      "https://mail.apigw.ntruss.com/api/v1/mails",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ncp-apigw-timestamp": timestamp,
          "x-ncp-iam-access-key": accessKey,
          "x-ncp-apigw-signature-v2": makeSignature(
            timestamp,
            "POST",
            "/api/v1/mails",
          ),
        },
        body: JSON.stringify(mailBody),
      },
    );

    const mailData = await mailResponse.json();

    if (!mailResponse.ok) {
      console.error("NCP 메일 전송 실패:", mailData);
      return NextResponse.json(
        {
          success: false,
          error: mailData?.message || "메일 전송에 실패했습니다.",
        },
        {status: 500},
      );
    }

    return NextResponse.json({
      success: true,
      message: "이메일 전송이 완료되었습니다.",
    });
  } catch (error: any) {
    console.error("NCP 메일 전송 오류:", error);
    return NextResponse.json(
      {success: false, error: error?.message || "서버 오류가 발생했습니다."},
      {status: 500},
    );
  }
}
