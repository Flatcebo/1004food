import nodemailer from "nodemailer";
import sql from "@/lib/db";
import {decrypt} from "@/lib/crypto";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * companies 테이블에서 회사별 SMTP 정보 조회 및 복호화 (MASTER_KEY 사용)
 * @throws 정보가 없거나 복호화 실패 시 명확한 에러 메시지
 */
async function getCompanySmtpCredentials(companyId: number): Promise<{
  smtpEmail: string;
  appPassword: string;
  senderName: string;
}> {
  const rows = await sql`
    SELECT name, smtp_email, n_app_pw
    FROM companies
    WHERE id = ${companyId}
    LIMIT 1
  `;

  if (!rows || rows.length === 0) {
    throw new Error(
      `해당 회사(ID: ${companyId})를 찾을 수 없습니다. 회사가 삭제되었거나 존재하지 않습니다.`,
    );
  }

  const c = rows[0];
  const companyName = c.name || `회사 ${companyId}`;

  if (!c.smtp_email || String(c.smtp_email).trim() === "") {
    throw new Error(
      `해당 회사(ID: ${companyId}, ${companyName})에 SMTP 이메일이 설정되지 않았습니다. 회사 설정에서 메일 발송용 이메일을 등록해주세요.`,
    );
  }

  if (!c.n_app_pw || String(c.n_app_pw).trim() === "") {
    throw new Error(
      `해당 회사(ID: ${companyId}, ${companyName})에 앱 비밀번호가 설정되지 않았습니다. 회사 설정에서 네이버 앱 비밀번호를 등록해주세요.`,
    );
  }

  let appPassword: string;
  try {
    appPassword = decrypt(c.n_app_pw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `앱 비밀번호 복호화에 실패했습니다. MASTER_KEY 환경 변수가 올바른지 확인해주세요. (${msg})`,
    );
  }

  return {
    smtpEmail: c.smtp_email,
    appPassword,
    senderName: companyName,
  };
}

/** codes/ncp_mailer와 동일한 형식의 발주서 이메일 발송 (nodemailer) */
export interface SendOrderSheetParams {
  recipientEmail: string;
  fileBuffer: Buffer;
  fileName: string;
  purchaseName?: string | null;
  senderName?: string | null;
  /** 회사 ID (companies 테이블에서 smtp_email, n_app_pw 조회 후 MASTER_KEY로 복호화) */
  companyId?: number | null;
}

export async function sendOrderSheetMail(params: SendOrderSheetParams) {
  const {
    recipientEmail,
    fileBuffer,
    fileName,
    purchaseName,
    senderName,
    companyId,
  } = params;

  const toName = purchaseName;

  if (!companyId) {
    throw new Error(
      "회사 ID(companyId)가 필요합니다. 메일 발송을 위해 해당 회사의 SMTP 설정이 필요합니다.",
    );
  }

  const credentials = await getCompanySmtpCredentials(companyId);
  const useEmail = credentials.smtpEmail;
  const usePass = credentials.appPassword;
  const fromName = senderName ?? credentials.senderName;

  const transporter = nodemailer.createTransport({
    host: "smtp.naver.com",
    port: 465,
    secure: true,
    auth: {user: useEmail, pass: usePass},
  });

  const replyTo = process.env.MAIL_REPLY_TO || useEmail;

  const subject = `날짜_${fromName}_${toName}_발주서`.replace(/\s/g, "_");
  const htmlBody = [
    "회신은 아래 메일로 부탁드립니다.<br/>",
    `<span style='color: blue; font-size: 20px;'>${replyTo}</span><br/>`,
    "발주서 내용입니다.",
  ].join("");

  await transporter.sendMail({
    from: {
      name: fromName,
      address: useEmail,
    },
    to: {name: toName ?? "unknown", address: recipientEmail},
    replyTo,
    subject,
    text: "회신은 아래 메일로 부탁드립니다.\n발주서 내용입니다.",
    html: htmlBody,
    attachments: [
      {
        filename: fileName.replace(/\s/g, "_"),
        content: fileBuffer,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ],
  });
}

export async function sendBulkMail(
  recipients: string[],
  options: {companyId: number} | {smtpEmail: string; appPassword: string},
) {
  let smtpEmail: string;
  let appPassword: string;

  if ("companyId" in options && options.companyId) {
    const creds = await getCompanySmtpCredentials(options.companyId);
    smtpEmail = creds.smtpEmail;
    appPassword = creds.appPassword;
  } else if ("smtpEmail" in options && "appPassword" in options) {
    smtpEmail = options.smtpEmail;
    appPassword = options.appPassword;
  } else {
    throw new Error(
      "sendBulkMail에는 companyId 또는 (smtpEmail, appPassword)가 필요합니다.",
    );
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.naver.com",
    port: 465,
    secure: true,
    auth: {user: smtpEmail, pass: appPassword},
  });

  for (const email of recipients) {
    await transporter.sendMail({
      from: {name: "1004food", address: smtpEmail},
      to: email,
      subject: "발주서 전달드립니다",
      text: "첨부된 발주서를 확인해주세요.",
    });
    await sleep(2000);
  }
}
