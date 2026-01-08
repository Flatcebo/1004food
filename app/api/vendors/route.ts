import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import bcrypt from "bcryptjs";
import {getCompanyIdFromRequest} from "@/lib/company";

/**
 * GET /api/vendors
 * 납품업체 목록 조회 (company_id 필터링)
 */
export async function GET(request: NextRequest) {
  try {
    // company_id 추출 (쿼리 파라미터 또는 헤더에서)
    const {searchParams} = new URL(request.url);
    const companyIdParam = searchParams.get("company_id");

    let companyId: number | null = null;
    if (companyIdParam) {
      companyId = parseInt(companyIdParam, 10);
      if (isNaN(companyId)) {
        return NextResponse.json(
          {success: false, error: "유효하지 않은 company_id입니다."},
          {status: 400}
        );
      }
    } else {
      // 헤더에서 가져오기 시도
      companyId = await getCompanyIdFromRequest(request);
    }

    let vendors;
    if (companyId) {
      vendors = await sql`
        SELECT 
          v.id,
          v.company_id as "companyId",
          v.username,
          v.name,
          v.template,
          v.phone,
          v.contact_person as "contactPerson",
          v.email,
          v.created_at as "createdAt",
          v.updated_at as "updatedAt",
          c.name as "companyName"
        FROM vendors v
        INNER JOIN companies c ON v.company_id = c.id
        WHERE v.company_id = ${companyId}
        ORDER BY v.created_at DESC
      `;
    } else {
      // company_id가 없으면 모든 납품업체 조회 (관리자용)
      vendors = await sql`
        SELECT 
          v.id,
          v.company_id as "companyId",
          v.username,
          v.name,
          v.template,
          v.phone,
          v.contact_person as "contactPerson",
          v.email,
          v.created_at as "createdAt",
          v.updated_at as "updatedAt",
          c.name as "companyName"
        FROM vendors v
        INNER JOIN companies c ON v.company_id = c.id
        ORDER BY v.company_id, v.created_at DESC
      `;
    }

    return NextResponse.json({
      success: true,
      data: vendors,
    });
  } catch (error: any) {
    console.error("납품업체 목록 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

/**
 * POST /api/vendors
 * 새 납품업체 생성
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {companyId, username, password, name, email, phone, contactPerson} =
      body;

    // 필수 필드 검증
    if (!companyId || !username || !password || !name) {
      return NextResponse.json(
        {
          success: false,
          error: "companyId, username, password, name은 필수입니다.",
        },
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

    // 이메일 형식 검증 (입력된 경우)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json(
        {success: false, error: "올바른 이메일 형식을 입력해주세요."},
        {status: 400}
      );
    }

    // 회사 존재 여부 확인
    const company = await sql`
      SELECT id FROM companies WHERE id = ${companyId}
    `;

    if (company.length === 0) {
      return NextResponse.json(
        {success: false, error: "회사를 찾을 수 없습니다."},
        {status: 404}
      );
    }

    // 비밀번호 해싱
    const hashedPassword = await bcrypt.hash(password, 10);

    // 전화번호, 담당자명, 이메일 처리 (입력값이 있으면 사용, 없으면 기본값 생성)
    const finalPhone = phone?.trim() || null;
    const finalContactPerson = contactPerson?.trim() || null;
    const finalEmail = email?.trim() || null;

    // 납품업체 생성
    const result = await sql`
      INSERT INTO vendors (
        company_id, username, password, name, phone, contact_person, email
      )
      VALUES (
        ${companyId},
        ${username.trim()},
        ${hashedPassword},
        ${name.trim()},
        ${finalPhone},
        ${finalContactPerson},
        ${finalEmail}
      )
      RETURNING 
        id,
        company_id as "companyId",
        username,
        name,
        template,
        phone,
        contact_person as "contactPerson",
        email,
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;

    return NextResponse.json({
      success: true,
      data: result[0],
    });
  } catch (error: any) {
    console.error("납품업체 생성 실패:", error);

    // UNIQUE 제약조건 위반
    if (error.message && error.message.includes("unique")) {
      return NextResponse.json(
        {success: false, error: "이미 존재하는 아이디입니다."},
        {status: 409}
      );
    }

    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
