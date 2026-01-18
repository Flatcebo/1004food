import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import bcrypt from "bcryptjs";
import {getCompanyIdFromRequest} from "@/lib/company";

/**
 * GET /api/users
 * 사용자 목록 조회 (company_id 필터링)
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

    // assigned_vendor_ids 컬럼 존재 여부 확인 (기존 컬럼명 유지)
    const columnExists = await sql`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'assigned_vendor_ids'
      )
    `;

    const hasAssignedVendorIds = columnExists[0]?.exists || false;

    let users;
    if (companyId) {
      if (hasAssignedVendorIds) {
        users = await sql`
          SELECT 
            u.id,
            u.company_id as "companyId",
            u.username,
            u.name,
            u.grade,
            u.position,
            u.role,
            u.is_active as "isActive",
            u.created_at as "createdAt",
            u.updated_at as "updatedAt",
            COALESCE(u.assigned_vendor_ids, '[]'::jsonb) as "assignedMallIds",
            c.name as "companyName"
          FROM users u
          INNER JOIN companies c ON u.company_id = c.id
          WHERE u.company_id = ${companyId}
          ORDER BY u.created_at DESC
        `;
      } else {
        users = await sql`
          SELECT 
            u.id,
            u.company_id as "companyId",
            u.username,
            u.name,
            u.grade,
            u.position,
            u.role,
            u.is_active as "isActive",
            u.created_at as "createdAt",
            u.updated_at as "updatedAt",
            '[]'::jsonb as "assignedMallIds",
            c.name as "companyName"
          FROM users u
          INNER JOIN companies c ON u.company_id = c.id
          WHERE u.company_id = ${companyId}
          ORDER BY u.created_at DESC
        `;
      }
    } else {
      // company_id가 없으면 모든 사용자 조회 (관리자용)
      if (hasAssignedVendorIds) {
        users = await sql`
          SELECT 
            u.id,
            u.company_id as "companyId",
            u.username,
            u.name,
            u.grade,
            u.position,
            u.role,
            u.is_active as "isActive",
            u.created_at as "createdAt",
            u.updated_at as "updatedAt",
            COALESCE(u.assigned_vendor_ids, '[]'::jsonb) as "assignedMallIds",
            c.name as "companyName"
          FROM users u
          INNER JOIN companies c ON u.company_id = c.id
          ORDER BY u.company_id, u.created_at DESC
        `;
      } else {
        users = await sql`
          SELECT 
            u.id,
            u.company_id as "companyId",
            u.username,
            u.name,
            u.grade,
            u.position,
            u.role,
            u.is_active as "isActive",
            u.created_at as "createdAt",
            u.updated_at as "updatedAt",
            '[]'::jsonb as "assignedMallIds",
            c.name as "companyName"
          FROM users u
          INNER JOIN companies c ON u.company_id = c.id
          ORDER BY u.company_id, u.created_at DESC
        `;
      }
    }

    return NextResponse.json({
      success: true,
      data: users,
    });
  } catch (error: any) {
    console.error("사용자 목록 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message || "알 수 없는 오류가 발생했습니다."},
      {status: 500}
    );
  }
}

/**
 * POST /api/users
 * 새 사용자 생성
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
    if (!companyId || !username || !password || !name || !grade) {
      return NextResponse.json(
        {
          success: false,
          error: "companyId, username, password, name, grade는 필수입니다.",
        },
        {status: 400}
      );
    }

    // grade 유효성 검증
    if (!["관리자", "직원", "납품업체", "온라인"].includes(grade)) {
      return NextResponse.json(
        {success: false, error: "grade는 '관리자', '직원', '납품업체', '온라인' 중 하나여야 합니다."},
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

    // assigned_vendor_ids 컬럼 존재 여부 확인 (기존 컬럼명 유지)
    const columnExists = await sql`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'assigned_vendor_ids'
      )
    `;

    const hasAssignedVendorIds = columnExists[0]?.exists || false;

    // 사용자 생성
    let result;
    if (hasAssignedVendorIds) {
      result = await sql`
        INSERT INTO users (
          company_id, username, password, name, grade, position, role, assigned_vendor_ids
        )
        VALUES (
          ${companyId},
          ${username.trim()},
          ${hashedPassword},
          ${name.trim()},
          ${grade},
          ${position || null},
          ${role || null},
          '[]'::jsonb
        )
        RETURNING 
          id,
          company_id as "companyId",
          username,
          name,
          grade,
          position,
          role,
          is_active as "isActive",
          COALESCE(assigned_vendor_ids, '[]'::jsonb) as "assignedMallIds",
          created_at as "createdAt",
          updated_at as "updatedAt"
      `;
    } else {
      result = await sql`
        INSERT INTO users (
          company_id, username, password, name, grade, position, role
        )
        VALUES (
          ${companyId},
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
          role,
          is_active as "isActive",
          '[]'::jsonb as "assignedMallIds",
          created_at as "createdAt",
          updated_at as "updatedAt"
      `;
    }

    return NextResponse.json({
      success: true,
      data: result[0],
    });
  } catch (error: any) {
    console.error("사용자 생성 실패:", error);
    
    // UNIQUE 제약조건 위반
    if (error.message && error.message.includes("unique")) {
      return NextResponse.json(
        {success: false, error: "이미 존재하는 사용자명입니다."},
        {status: 409}
      );
    }

    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
