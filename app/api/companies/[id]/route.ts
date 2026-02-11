import {NextRequest, NextResponse} from "next/server";
import {encrypt} from "@/lib/crypto";
import sql from "@/lib/db";

/**
 * GET /api/companies/[id]
 * 특정 회사 조회 (n_app_pw는 절대 반환하지 않음)
 */
export async function GET(
  request: NextRequest,
  {params}: {params: Promise<{id: string}>},
) {
  try {
    const {id} = await params;
    const companyId = parseInt(id, 10);

    if (isNaN(companyId)) {
      return NextResponse.json(
        {success: false, error: "유효하지 않은 회사 ID입니다."},
        {status: 400},
      );
    }

    const companies = await sql`
      SELECT 
        id,
        name,
        smtp_email as "smtpEmail",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM companies
      WHERE id = ${companyId}
    `;

    if (companies.length === 0) {
      return NextResponse.json(
        {success: false, error: "회사를 찾을 수 없습니다."},
        {status: 404},
      );
    }

    return NextResponse.json({
      success: true,
      data: companies[0],
    });
  } catch (error: any) {
    console.error("회사 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500},
    );
  }
}

/**
 * PUT /api/companies/[id]
 * 회사 정보 수정 (smtp_email, n_app_pw 포함, n_app_pw는 암호화 저장)
 */
export async function PUT(
  request: NextRequest,
  {params}: {params: Promise<{id: string}>},
) {
  try {
    const {id} = await params;
    const companyId = parseInt(id, 10);

    if (isNaN(companyId)) {
      return NextResponse.json(
        {success: false, error: "유효하지 않은 회사 ID입니다."},
        {status: 400},
      );
    }

    const body = await request.json();
    const {name, smtpEmail, nAppPw} = body;

    if (!name || name.trim() === "") {
      return NextResponse.json(
        {success: false, error: "회사명이 필요합니다."},
        {status: 400},
      );
    }

    // 기존 값 조회 (smtp_email, n_app_pw 미제공 시 유지)
    const existing = await sql`
      SELECT smtp_email, n_app_pw FROM companies WHERE id = ${companyId}
    `;
    if (existing.length === 0) {
      return NextResponse.json(
        {success: false, error: "회사를 찾을 수 없습니다."},
        {status: 404},
      );
    }

    const newSmtpEmail =
      smtpEmail !== undefined
        ? smtpEmail?.trim() || null
        : existing[0].smtp_email;
    const newNAppPw =
      nAppPw !== undefined
        ? nAppPw === ""
          ? null
          : encrypt(nAppPw)
        : existing[0].n_app_pw;

    const result = await sql`
      UPDATE companies
      SET 
        name = ${name.trim()},
        smtp_email = ${newSmtpEmail},
        n_app_pw = ${newNAppPw},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${companyId}
      RETURNING id, name, smtp_email as "smtpEmail", created_at as "createdAt", updated_at as "updatedAt"
    `;

    return NextResponse.json({
      success: true,
      data: result[0],
    });
  } catch (error: any) {
    console.error("회사 수정 실패:", error);

    // UNIQUE 제약조건 위반
    if (error.message && error.message.includes("unique")) {
      return NextResponse.json(
        {success: false, error: "이미 존재하는 회사명입니다."},
        {status: 409},
      );
    }

    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500},
    );
  }
}

/**
 * DELETE /api/companies/[id]
 * 회사 삭제
 */
export async function DELETE(
  request: NextRequest,
  {params}: {params: Promise<{id: string}>},
) {
  try {
    const {id} = await params;
    const companyId = parseInt(id, 10);

    if (isNaN(companyId)) {
      return NextResponse.json(
        {success: false, error: "유효하지 않은 회사 ID입니다."},
        {status: 400},
      );
    }

    // 회사 존재 여부 확인
    const existing = await sql`
      SELECT id FROM companies WHERE id = ${companyId}
    `;

    if (existing.length === 0) {
      return NextResponse.json(
        {success: false, error: "회사를 찾을 수 없습니다."},
        {status: 404},
      );
    }

    // CASCADE로 인해 관련 데이터도 함께 삭제됨
    await sql`DELETE FROM companies WHERE id = ${companyId}`;

    return NextResponse.json({
      success: true,
      message: "회사가 삭제되었습니다.",
    });
  } catch (error: any) {
    console.error("회사 삭제 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500},
    );
  }
}
