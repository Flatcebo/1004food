import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import bcrypt from "bcryptjs";

/**
 * GET /api/vendors/[id]
 * 특정 납품업체 조회
 */
export async function GET(
  request: NextRequest,
  {params}: {params: Promise<{id: string}>}
) {
  try {
    const {id} = await params;
    const vendorId = parseInt(id, 10);

    if (isNaN(vendorId)) {
      return NextResponse.json(
        {success: false, error: "유효하지 않은 납품업체 ID입니다."},
        {status: 400}
      );
    }

    const vendors = await sql`
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
      WHERE v.id = ${vendorId}
    `;

    if (vendors.length === 0) {
      return NextResponse.json(
        {success: false, error: "납품업체를 찾을 수 없습니다."},
        {status: 404}
      );
    }

    return NextResponse.json({
      success: true,
      data: vendors[0],
    });
  } catch (error: any) {
    console.error("납품업체 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

/**
 * PUT /api/vendors/[id]
 * 납품업체 정보 수정
 */
export async function PUT(
  request: NextRequest,
  {params}: {params: Promise<{id: string}>}
) {
  try {
    const {id} = await params;
    const vendorId = parseInt(id, 10);

    if (isNaN(vendorId)) {
      return NextResponse.json(
        {success: false, error: "유효하지 않은 납품업체 ID입니다."},
        {status: 400}
      );
    }

    const body = await request.json();
    const {name, password} = body;

    // 사용자 존재 여부 확인
    const existing = await sql`
      SELECT id FROM vendors WHERE id = ${vendorId}
    `;

    if (existing.length === 0) {
      return NextResponse.json(
        {success: false, error: "납품업체를 찾을 수 없습니다."},
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
    if (password !== undefined && password !== "") {
      if (password.length < 6) {
        return NextResponse.json(
          {success: false, error: "비밀번호는 최소 6자 이상이어야 합니다."},
          {status: 400}
        );
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      updateFields.push(sql`password = ${hashedPassword}`);
      hasUpdates = true;
    }

    if (!hasUpdates) {
      return NextResponse.json(
        {success: false, error: "수정할 필드가 없습니다."},
        {status: 400}
      );
    }

    updateFields.push(sql`updated_at = CURRENT_TIMESTAMP`);

    // 동적 쿼리 생성
    let query = sql`
      UPDATE vendors
      SET ${updateFields[0]}
    `;

    for (let i = 1; i < updateFields.length; i++) {
      query = sql`${query}, ${updateFields[i]}`;
    }

    query = sql`${query} WHERE id = ${vendorId} RETURNING 
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

    const result = await query;

    return NextResponse.json({
      success: true,
      data: result[0],
    });
  } catch (error: any) {
    console.error("납품업체 수정 실패:", error);

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

/**
 * DELETE /api/vendors/[id]
 * 납품업체 삭제
 */
export async function DELETE(
  request: NextRequest,
  {params}: {params: Promise<{id: string}>}
) {
  try {
    const {id} = await params;
    const vendorId = parseInt(id, 10);

    if (isNaN(vendorId)) {
      return NextResponse.json(
        {success: false, error: "유효하지 않은 납품업체 ID입니다."},
        {status: 400}
      );
    }

    // 납품업체 존재 여부 확인
    const existing = await sql`
      SELECT id FROM vendors WHERE id = ${vendorId}
    `;

    if (existing.length === 0) {
      return NextResponse.json(
        {success: false, error: "납품업체를 찾을 수 없습니다."},
        {status: 404}
      );
    }

    // 삭제
    await sql`DELETE FROM vendors WHERE id = ${vendorId}`;

    return NextResponse.json({
      success: true,
      message: "납품업체가 삭제되었습니다.",
    });
  } catch (error: any) {
    console.error("납품업체 삭제 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
