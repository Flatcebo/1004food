import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import bcrypt from "bcryptjs";

/**
 * POST /api/auth/login
 * 사용자 로그인 API
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {username, password} = body;

    if (!username || !password) {
      return NextResponse.json(
        {success: false, error: "아이디와 비밀번호를 입력해주세요."},
        {status: 400}
      );
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

    // 사용자 조회 (username과 company_id로)
    let users;
    if (hasAssignedVendorIds) {
      users = await sql`
        SELECT 
          u.id,
          u.company_id,
          u.username,
          u.password,
          u.name,
          u.grade,
          u.position,
          u.role,
          u.is_active,
          u.assigned_vendor_ids,
          c.name as company_name
        FROM users u
        INNER JOIN companies c ON u.company_id = c.id
        WHERE u.username = ${username}
        AND u.is_active = TRUE
      `;
    } else {
      users = await sql`
        SELECT 
          u.id,
          u.company_id,
          u.username,
          u.password,
          u.name,
          u.grade,
          u.position,
          u.role,
          u.is_active,
          c.name as company_name
        FROM users u
        INNER JOIN companies c ON u.company_id = c.id
        WHERE u.username = ${username}
        AND u.is_active = TRUE
      `;
    }

    if (users.length === 0) {
      return NextResponse.json(
        {success: false, error: "아이디 또는 비밀번호가 올바르지 않습니다."},
        {status: 401}
      );
    }

    const user = users[0];

    // 비밀번호 확인
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return NextResponse.json(
        {success: false, error: "아이디 또는 비밀번호가 올바르지 않습니다."},
        {status: 401}
      );
    }

    // assigned_vendor_ids를 배열로 변환 (JSONB 타입 처리, mall ID가 저장됨)
    let assignedMallIds: number[] = [];
    if (hasAssignedVendorIds && user.assigned_vendor_ids) {
      try {
        // JSONB가 이미 파싱된 객체인 경우
        if (Array.isArray(user.assigned_vendor_ids)) {
          assignedMallIds = user.assigned_vendor_ids;
        } else if (typeof user.assigned_vendor_ids === 'string') {
          // 문자열인 경우 JSON 파싱
          assignedMallIds = JSON.parse(user.assigned_vendor_ids);
        }
      } catch (e) {
        console.error("assigned_vendor_ids 파싱 실패:", e);
        assignedMallIds = [];
      }
    }

    // 로그인 성공 - 민감한 정보 제외하고 반환
    return NextResponse.json({
      success: true,
      data: {
        id: user.id.toString(),
        companyId: user.company_id,
        companyName: user.company_name,
        name: user.name,
        grade: user.grade,
        position: user.position,
        role: user.role,
        assignedMallIds: assignedMallIds,
      },
    });
  } catch (error: any) {
    console.error("로그인 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message || "로그인 중 오류가 발생했습니다."},
      {status: 500}
    );
  }
}
