import {NextResponse} from "next/server";
import sql from "@/lib/db";

/**
 * companies 테이블에 SMTP 메일 발송용 컬럼 추가
 * - smtp_email: SMTP 발송 이메일 주소
 * - n_app_pw: 네이버 앱 비밀번호 (암호화하여 저장)
 */
export async function POST() {
  try {
    // smtp_email 컬럼 추가
    const smtpEmailExists = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'companies' AND column_name = 'smtp_email'
      )
    `;
    if (!smtpEmailExists[0].exists) {
      await sql`
        ALTER TABLE companies ADD COLUMN smtp_email VARCHAR(255)
      `;
      console.log("companies.smtp_email 컬럼 추가 완료");
    }

    // n_app_pw 컬럼 추가 (암호화된 비밀번호 저장용 TEXT)
    const nAppPwExists = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'companies' AND column_name = 'n_app_pw'
      )
    `;
    if (!nAppPwExists[0].exists) {
      await sql`
        ALTER TABLE companies ADD COLUMN n_app_pw TEXT
      `;
      console.log("companies.n_app_pw 컬럼 추가 완료");
    }

    return NextResponse.json({
      success: true,
      message: "companies SMTP 컬럼 마이그레이션이 완료되었습니다.",
    });
  } catch (error: any) {
    console.error("마이그레이션 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500},
    );
  }
}
