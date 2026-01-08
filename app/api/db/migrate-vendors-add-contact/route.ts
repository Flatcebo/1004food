import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest, validateCompanyId} from "@/lib/company";

/**
 * vendors 테이블에 전화번호, 담당자명, 이메일 컬럼 추가 마이그레이션
 */
export async function POST(request: NextRequest) {
  try {
    // 로그인한 사용자의 company_id 가져오기
    const companyId = await getCompanyIdFromRequest(request);

    if (!companyId) {
      return NextResponse.json(
        {
          success: false,
          error: "company_id가 필요합니다. 로그인 후 다시 시도해주세요.",
        },
        {status: 400}
      );
    }

    // company_id 유효성 확인
    const isValidCompany = await validateCompanyId(companyId);
    if (!isValidCompany) {
      return NextResponse.json(
        {
          success: false,
          error: "유효하지 않은 company_id입니다.",
        },
        {status: 400}
      );
    }

    await sql`BEGIN`;

    try {
      // 전화번호 컬럼 추가
      const phoneExists = await sql`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'vendors' 
          AND column_name = 'phone'
        )
      `;

      if (!phoneExists[0].exists) {
        await sql`
          ALTER TABLE vendors 
          ADD COLUMN phone VARCHAR(50)
        `;
        console.log("전화번호 컬럼 추가 완료");
      }

      // 담당자명 컬럼 추가
      const contactPersonExists = await sql`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'vendors' 
          AND column_name = 'contact_person'
        )
      `;

      if (!contactPersonExists[0].exists) {
        await sql`
          ALTER TABLE vendors 
          ADD COLUMN contact_person VARCHAR(255)
        `;
        console.log("담당자명 컬럼 추가 완료");
      }

      // 이메일 컬럼 추가
      const emailExists = await sql`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'vendors' 
          AND column_name = 'email'
        )
      `;

      if (!emailExists[0].exists) {
        await sql`
          ALTER TABLE vendors 
          ADD COLUMN email VARCHAR(255)
        `;
        console.log("이메일 컬럼 추가 완료");
      }

      await sql`COMMIT`;

      return NextResponse.json({
        success: true,
        message: "vendors 테이블에 전화번호, 담당자명, 이메일 컬럼이 성공적으로 추가되었습니다.",
      });
    } catch (error: any) {
      await sql`ROLLBACK`;
      throw error;
    }
  } catch (error: any) {
    console.error("vendors 컬럼 추가 실패:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        details: error.stack,
      },
      {status: 500}
    );
  }
}
