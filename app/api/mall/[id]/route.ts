import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

/**
 * GET /api/mall/[id]
 * 특정 쇼핑몰 조회
 */
export async function GET(
  request: NextRequest,
  {params}: {params: Promise<{id: string}>}
) {
  try {
    const {id} = await params;
    const mallId = parseInt(id, 10);

    if (isNaN(mallId)) {
      return NextResponse.json(
        {success: false, error: "유효하지 않은 쇼핑몰 ID입니다."},
        {status: 400}
      );
    }

    const malls = await sql`
      SELECT 
        id,
        code,
        name,
        company_name as "companyName",
        representative_name as "representativeName",
        business_number as "businessNumber",
        market_category as "marketCategory",
        postal_code as "postalCode",
        address1,
        address2,
        business_type as "businessType",
        business_category as "businessCategory",
        registration_date as "registrationDate",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM mall
      WHERE id = ${mallId}
    `;

    if (malls.length === 0) {
      return NextResponse.json(
        {success: false, error: "쇼핑몰을 찾을 수 없습니다."},
        {status: 404}
      );
    }

    // 담당자 조회 (assigned_vendor_ids에 이 mall id가 포함된 사용자들)
    const assignedUsers = await sql`
      SELECT 
        u.id,
        u.name,
        u.grade,
        u.position,
        u.role
      FROM users u
      WHERE u.assigned_vendor_ids @> ${JSON.stringify([mallId])}::jsonb
      AND u.is_active = TRUE
      ORDER BY u.name
    `;

    return NextResponse.json({
      success: true,
      data: {
        ...malls[0],
        assignedUsers: assignedUsers.map((u: any) => ({
          id: u.id,
          name: u.name,
          grade: u.grade,
          position: u.position,
          role: u.role,
        })),
      },
    });
  } catch (error: any) {
    console.error("쇼핑몰 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

/**
 * PUT /api/mall/[id]
 * 쇼핑몰 정보 수정 (이름, 담당자, market_category)
 */
export async function PUT(
  request: NextRequest,
  {params}: {params: Promise<{id: string}>}
) {
  try {
    const {id} = await params;
    const mallId = parseInt(id, 10);

    if (isNaN(mallId)) {
      return NextResponse.json(
        {success: false, error: "유효하지 않은 쇼핑몰 ID입니다."},
        {status: 400}
      );
    }

    const body = await request.json();
    const {name, marketCategory, assignedUserIds} = body;

    // 쇼핑몰 존재 여부 확인
    const existing = await sql`
      SELECT id FROM mall WHERE id = ${mallId}
    `;

    if (existing.length === 0) {
      return NextResponse.json(
        {success: false, error: "쇼핑몰을 찾을 수 없습니다."},
        {status: 404}
      );
    }

    // 업데이트할 필드 구성
    const updateFields: any[] = [];
    let hasUpdates = false;

    if (name !== undefined && name !== null) {
      updateFields.push(sql`name = ${name.trim()}`);
      hasUpdates = true;
    }

    if (marketCategory !== undefined) {
      updateFields.push(sql`market_category = ${marketCategory || null}`);
      hasUpdates = true;
    }

    if (!hasUpdates && assignedUserIds === undefined) {
      return NextResponse.json(
        {success: false, error: "수정할 필드가 없습니다."},
        {status: 400}
      );
    }

    // mall 정보 업데이트
    if (hasUpdates) {
      updateFields.push(sql`updated_at = CURRENT_TIMESTAMP`);
      
      let updateQuery = sql`
        UPDATE mall
        SET ${updateFields[0]}
      `;

      for (let i = 1; i < updateFields.length; i++) {
        updateQuery = sql`${updateQuery}, ${updateFields[i]}`;
      }

      updateQuery = sql`${updateQuery} WHERE id = ${mallId}`;
      await updateQuery;
    }

    // 담당자 설정 업데이트
    if (assignedUserIds !== undefined) {
      if (!Array.isArray(assignedUserIds)) {
        return NextResponse.json(
          {success: false, error: "assignedUserIds는 배열이어야 합니다."},
          {status: 400}
        );
      }

      // assigned_vendor_ids 컬럼 존재 여부 확인
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

      // 모든 사용자의 assigned_vendor_ids에서 이 mall id 제거
      await sql`
        UPDATE users
        SET assigned_vendor_ids = (
          SELECT jsonb_agg(elem)
          FROM jsonb_array_elements(assigned_vendor_ids) elem
          WHERE elem::int != ${mallId}
        )
        WHERE assigned_vendor_ids @> ${JSON.stringify([mallId])}::jsonb
      `;

      // 새로 지정된 사용자들에게 이 mall id 추가
      if (assignedUserIds.length > 0) {
        for (const userId of assignedUserIds) {
          const userIdNum = parseInt(userId, 10);
          if (isNaN(userIdNum)) continue;

          // 사용자의 현재 assigned_vendor_ids 가져오기
          const userResult = await sql`
            SELECT assigned_vendor_ids
            FROM users
            WHERE id = ${userIdNum}
          `;

          if (userResult.length > 0) {
            let currentIds: number[] = [];
            try {
              currentIds = Array.isArray(userResult[0].assigned_vendor_ids)
                ? userResult[0].assigned_vendor_ids
                : JSON.parse(userResult[0].assigned_vendor_ids || "[]");
            } catch (e) {
              currentIds = [];
            }

            // 이미 포함되어 있지 않으면 추가
            if (!currentIds.includes(mallId)) {
              currentIds.push(mallId);
              await sql`
                UPDATE users
                SET assigned_vendor_ids = ${JSON.stringify(currentIds)}::jsonb,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ${userIdNum}
              `;
            }
          }
        }
      }
    }

    // 업데이트된 쇼핑몰 정보 반환
    const updatedMall = await sql`
      SELECT 
        id,
        code,
        name,
        company_name as "companyName",
        representative_name as "representativeName",
        business_number as "businessNumber",
        market_category as "marketCategory",
        postal_code as "postalCode",
        address1,
        address2,
        business_type as "businessType",
        business_category as "businessCategory",
        registration_date as "registrationDate",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM mall
      WHERE id = ${mallId}
    `;

    // 담당자 조회
    const assignedUsers = await sql`
      SELECT 
        u.id,
        u.name,
        u.grade,
        u.position,
        u.role
      FROM users u
      WHERE u.assigned_vendor_ids @> ${JSON.stringify([mallId])}::jsonb
      AND u.is_active = TRUE
      ORDER BY u.name
    `;

    return NextResponse.json({
      success: true,
      data: {
        ...updatedMall[0],
        assignedUsers: assignedUsers.map((u: any) => ({
          id: u.id,
          name: u.name,
          grade: u.grade,
          position: u.position,
          role: u.role,
        })),
      },
    });
  } catch (error: any) {
    console.error("쇼핑몰 수정 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
