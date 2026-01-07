import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import bcrypt from "bcryptjs";

/**
 * POST /api/auth/register
 * 회원가입 API
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      companyId,
      username,
      password,
      name,
      grade,
      position,
      role,
    } = body;

    // 필수 필드 검증
    if (!username || !password || !name || !grade) {
      return NextResponse.json(
        {
          success: false,
          error: "username, password, name, grade는 필수입니다.",
        },
        {status: 400}
      );
    }

    // grade 유효성 검증
    if (!["관리자", "직원"].includes(grade)) {
      return NextResponse.json(
        {success: false, error: "grade는 '관리자', '직원' 중 하나여야 합니다."},
        {status: 400}
      );
    }

    // 비밀번호 길이 검증
    if (password.length < 6) {
      return NextResponse.json(
        {success: false, error: "비밀번호는 최소 6자 이상이어야 합니다."},
        {status: 400}
      );
    }

    // companyId가 없으면 기본 회사 사용
    let finalCompanyId = companyId;
    if (!finalCompanyId) {
      const defaultCompany = await sql`
        SELECT id FROM companies WHERE name = '기본 회사' LIMIT 1
      `;
      if (defaultCompany.length === 0) {
        return NextResponse.json(
          {success: false, error: "기본 회사를 찾을 수 없습니다. 먼저 마이그레이션을 실행해주세요."},
          {status: 404}
        );
      }
      finalCompanyId = defaultCompany[0].id;
    } else {
      // 회사 존재 여부 확인
      const company = await sql`
        SELECT id FROM companies WHERE id = ${finalCompanyId}
      `;

      if (company.length === 0) {
        return NextResponse.json(
          {success: false, error: "회사를 찾을 수 없습니다."},
          {status: 404}
        );
      }
    }

    // 중복 사용자명 확인
    const existingUser = await sql`
      SELECT id FROM users 
      WHERE company_id = ${finalCompanyId} AND username = ${username.trim()}
    `;

    if (existingUser.length > 0) {
      return NextResponse.json(
        {success: false, error: "이미 존재하는 사용자명입니다."},
        {status: 409}
      );
    }

    // 비밀번호 해싱
    const hashedPassword = await bcrypt.hash(password, 10);

    // 사용자 생성
    const result = await sql`
      INSERT INTO users (
        company_id, username, password, name, grade, position, role
      )
      VALUES (
        ${finalCompanyId},
        ${username.trim()},
        ${hashedPassword},
        ${name.trim()},
        ${grade},
        ${position || null},
        ${role || null}
      )
      RETURNING 
        id,
        company_id as "companyId",
        username,
        name,
        grade,
        position,
        role
    `;

    return NextResponse.json({
      success: true,
      message: "회원가입이 완료되었습니다.",
      data: result[0],
    });
  } catch (error: any) {
    console.error("회원가입 실패:", error);
    
    // UNIQUE 제약조건 위반
    if (error.message && error.message.includes("unique")) {
      return NextResponse.json(
        {success: false, error: "이미 존재하는 사용자명입니다."},
        {status: 409}
      );
    }

    return NextResponse.json(
      {success: false, error: error.message || "회원가입 중 오류가 발생했습니다."},
      {status: 500}
    );
  }
}
