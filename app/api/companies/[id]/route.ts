import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

/**
 * GET /api/companies/[id]
 * 특정 회사 조회
 */
export async function GET(
  request: NextRequest,
  {params}: {params: Promise<{id: string}>}
) {
  try {
    const {id} = await params;
    const companyId = parseInt(id, 10);

    if (isNaN(companyId)) {
      return NextResponse.json(
        {success: false, error: "유효하지 않은 회사 ID입니다."},
        {status: 400}
      );
    }

    const companies = await sql`
      SELECT 
        id,
        name,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM companies
      WHERE id = ${companyId}
    `;

    if (companies.length === 0) {
      return NextResponse.json(
        {success: false, error: "회사를 찾을 수 없습니다."},
        {status: 404}
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
      {status: 500}
    );
  }
}

/**
 * PUT /api/companies/[id]
 * 회사 정보 수정
 */
export async function PUT(
  request: NextRequest,
  {params}: {params: Promise<{id: string}>}
) {
  try {
    const {id} = await params;
    const companyId = parseInt(id, 10);

    if (isNaN(companyId)) {
      return NextResponse.json(
        {success: false, error: "유효하지 않은 회사 ID입니다."},
        {status: 400}
      );
    }

    const body = await request.json();
    const {name} = body;

    if (!name || name.trim() === "") {
      return NextResponse.json(
        {success: false, error: "회사명이 필요합니다."},
        {status: 400}
      );
    }

    const result = await sql`
      UPDATE companies
      SET name = ${name.trim()},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${companyId}
      RETURNING 
        id,
        name,
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;

    if (result.length === 0) {
      return NextResponse.json(
        {success: false, error: "회사를 찾을 수 없습니다."},
        {status: 404}
      );
    }

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
        {status: 409}
      );
    }

    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

/**
 * DELETE /api/companies/[id]
 * 회사 삭제
 */
export async function DELETE(
  request: NextRequest,
  {params}: {params: Promise<{id: string}>}
) {
  try {
    const {id} = await params;
    const companyId = parseInt(id, 10);

    if (isNaN(companyId)) {
      return NextResponse.json(
        {success: false, error: "유효하지 않은 회사 ID입니다."},
        {status: 400}
      );
    }

    // 회사 존재 여부 확인
    const existing = await sql`
      SELECT id FROM companies WHERE id = ${companyId}
    `;

    if (existing.length === 0) {
      return NextResponse.json(
        {success: false, error: "회사를 찾을 수 없습니다."},
        {status: 404}
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
      {status: 500}
    );
  }
}
