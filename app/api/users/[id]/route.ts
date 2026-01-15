import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import bcrypt from "bcryptjs";

/**
 * GET /api/users/[id]
 * 특정 사용자 조회
 */
export async function GET(
  request: NextRequest,
  {params}: {params: Promise<{id: string}>}
) {
  try {
    const {id} = await params;
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      return NextResponse.json(
        {success: false, error: "유효하지 않은 사용자 ID입니다."},
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

    let users;
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
        WHERE u.id = ${userId}
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
        WHERE u.id = ${userId}
      `;
    }

    if (users.length === 0) {
      return NextResponse.json(
        {success: false, error: "사용자를 찾을 수 없습니다."},
        {status: 404}
      );
    }

    return NextResponse.json({
      success: true,
      data: users[0],
    });
  } catch (error: any) {
    console.error("사용자 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

/**
 * PUT /api/users/[id]
 * 사용자 정보 수정
 */
export async function PUT(
  request: NextRequest,
  {params}: {params: Promise<{id: string}>}
) {
  try {
    const {id} = await params;
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      return NextResponse.json(
        {success: false, error: "유효하지 않은 사용자 ID입니다."},
        {status: 400}
      );
    }

    const body = await request.json();
    const {
      name,
      grade,
      position,
      role,
      password,
      isActive,
      assignedMallIds,
    } = body;

    // 사용자 존재 여부 확인
    const existing = await sql`
      SELECT id FROM users WHERE id = ${userId}
    `;

    if (existing.length === 0) {
      return NextResponse.json(
        {success: false, error: "사용자를 찾을 수 없습니다."},
        {status: 404}
      );
    }

    // 업데이트할 필드 구성
    const updateFields: any[] = [];
    let hasUpdates = false;

    if (name !== undefined) {
      updateFields.push(sql`name = ${name.trim()}`);
      hasUpdates = true;
    }
    if (grade !== undefined) {
      if (!["관리자", "직원", "납품업체"].includes(grade)) {
        return NextResponse.json(
          {success: false, error: "grade는 '관리자', '직원', '납품업체' 중 하나여야 합니다."},
          {status: 400}
        );
      }
      updateFields.push(sql`grade = ${grade}`);
      hasUpdates = true;
    }
    if (assignedMallIds !== undefined) {
      // assigned_vendor_ids 컬럼 존재 여부 확인 (기존 컬럼명 유지)
      const columnExists = await sql`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'users' 
          AND column_name = 'assigned_vendor_ids'
        )
      `;

      if (!columnExists[0]?.exists) {
        return NextResponse.json(
          {success: false, error: "assigned_vendor_ids 컬럼이 존재하지 않습니다. 마이그레이션을 실행해주세요."},
          {status: 400}
        );
      }

      // assignedMallIds가 배열인지 확인하고 JSONB로 변환 (mall ID를 vendor_ids 컬럼에 저장)
      if (!Array.isArray(assignedMallIds)) {
        return NextResponse.json(
          {success: false, error: "assignedMallIds는 배열이어야 합니다."},
          {status: 400}
        );
      }
      updateFields.push(sql`assigned_vendor_ids = ${JSON.stringify(assignedMallIds)}::jsonb`);
      hasUpdates = true;
    }
    if (position !== undefined) {
      updateFields.push(sql`position = ${position || null}`);
      hasUpdates = true;
    }
    if (role !== undefined) {
      updateFields.push(sql`role = ${role || null}`);
      hasUpdates = true;
    }
    if (password !== undefined && password !== "") {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateFields.push(sql`password = ${hashedPassword}`);
      hasUpdates = true;
    }
    if (isActive !== undefined) {
      updateFields.push(sql`is_active = ${isActive}`);
      hasUpdates = true;
    }

    if (!hasUpdates) {
      return NextResponse.json(
        {success: false, error: "수정할 필드가 없습니다."},
        {status: 400}
      );
    }

    updateFields.push(sql`updated_at = CURRENT_TIMESTAMP`);

    // assigned_mall_ids 컬럼 존재 여부 확인
    const columnExists = await sql`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'assigned_mall_ids'
      )
    `;

    const hasAssignedMallIds = columnExists[0]?.exists || false;

    // 동적 쿼리 생성
    let query = sql`
      UPDATE users
      SET ${updateFields[0]}
    `;

    for (let i = 1; i < updateFields.length; i++) {
      query = sql`${query}, ${updateFields[i]}`;
    }

    if (hasAssignedMallIds) {
      query = sql`${query} WHERE id = ${userId} RETURNING 
        id,
        company_id as "companyId",
        username,
        name,
        grade,
        position,
        role,
        is_active as "isActive",
        COALESCE(assigned_mall_ids, '[]'::jsonb) as "assignedMallIds",
        created_at as "createdAt",
        updated_at as "updatedAt"
      `;
    } else {
      query = sql`${query} WHERE id = ${userId} RETURNING 
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

    const result = await query;

    return NextResponse.json({
      success: true,
      data: result[0],
    });
  } catch (error: any) {
    console.error("사용자 수정 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

/**
 * DELETE /api/users/[id]
 * 사용자 삭제 (비활성화)
 */
export async function DELETE(
  request: NextRequest,
  {params}: {params: Promise<{id: string}>}
) {
  try {
    const {id} = await params;
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      return NextResponse.json(
        {success: false, error: "유효하지 않은 사용자 ID입니다."},
        {status: 400}
      );
    }

    // 사용자 존재 여부 확인
    const existing = await sql`
      SELECT id FROM users WHERE id = ${userId}
    `;

    if (existing.length === 0) {
      return NextResponse.json(
        {success: false, error: "사용자를 찾을 수 없습니다."},
        {status: 404}
      );
    }

    // 실제 삭제 대신 비활성화 (데이터 보존)
    await sql`
      UPDATE users
      SET is_active = FALSE,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${userId}
    `;

    return NextResponse.json({
      success: true,
      message: "사용자가 비활성화되었습니다.",
    });
  } catch (error: any) {
    console.error("사용자 삭제 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
