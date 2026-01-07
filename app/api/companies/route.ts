import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

/**
 * GET /api/companies
 * 회사 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const companies = await sql`
      SELECT 
        id,
        name,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM companies
      ORDER BY created_at DESC
    `;

    return NextResponse.json({
      success: true,
      data: companies,
    });
  } catch (error: any) {
    console.error("회사 목록 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

/**
 * POST /api/companies
 * 새 회사 생성
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {name} = body;

    if (!name || name.trim() === "") {
      return NextResponse.json(
        {success: false, error: "회사명이 필요합니다."},
        {status: 400}
      );
    }

    const result = await sql`
      INSERT INTO companies (name)
      VALUES (${name.trim()})
      RETURNING 
        id,
        name,
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;

    return NextResponse.json({
      success: true,
      data: result[0],
    });
  } catch (error: any) {
    console.error("회사 생성 실패:", error);
    
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
