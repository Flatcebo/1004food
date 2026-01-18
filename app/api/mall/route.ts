import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest, getUserIdFromRequest} from "@/lib/company";

// 시작 코드 번호 가져오기
async function getStartCodeNumber(): Promise<number> {
  try {
    const result = await sql`
      SELECT code 
      FROM mall 
      WHERE code LIKE 'shop%' 
      ORDER BY CAST(SUBSTRING(code FROM 5) AS INTEGER) DESC 
      LIMIT 1
    `;

    if (result.length === 0) {
      return 1;
    }

    const lastCode = result[0].code;
    const match = lastCode.match(/shop(\d+)/);
    
    if (match) {
      return parseInt(match[1], 10) + 1;
    }

    return 1;
  } catch (error) {
    console.error("시작 코드 번호 조회 실패:", error);
    return 1;
  }
}

/**
 * GET /api/mall
 * 쇼핑몰 목록 조회
 * - grade가 "납품업체"인 경우: market_category가 "협력사"인 것만 표시
 * - grade가 "온라인"인 경우: market_category가 "협력사"가 아닌 것만 표시
 */
export async function GET(request: NextRequest) {
  try {
    // company_id 추출 (필요한 경우)
    const companyId = await getCompanyIdFromRequest(request);

    // user_id 추출 및 grade 확인
    const userId = await getUserIdFromRequest(request);
    let userGrade: string | null = null;

    if (userId && companyId) {
      try {
        const userResult = await sql`
          SELECT grade
          FROM users
          WHERE id = ${userId} AND company_id = ${companyId}
        `;
        
        if (userResult.length > 0) {
          userGrade = userResult[0].grade;
        }
      } catch (error) {
        console.error("사용자 정보 조회 실패:", error);
      }
    }

    const {searchParams} = new URL(request.url);
    const search = searchParams.get("search");
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    let query = sql`
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
      WHERE 1=1
    `;


    if (search) {
      query = sql`
        ${query}
        AND (
          name ILIKE ${`%${search}%`}
          OR company_name ILIKE ${`%${search}%`}
          OR code ILIKE ${`%${search}%`}
        )
      `;
    }

    query = sql`
      ${query}
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const malls = await query;

    // 각 쇼핑몰의 담당자 조회
    if (malls.length > 0) {
      const mallIds = malls.map((m: any) => m.id);
      
      // 모든 사용자의 assigned_vendor_ids를 조회하여 mall별 담당자 매핑
      const allUsers = await sql`
        SELECT 
          id,
          name,
          grade,
          position,
          role,
          assigned_vendor_ids
        FROM users
        WHERE assigned_vendor_ids IS NOT NULL
        AND is_active = TRUE
      `;

      // mall별 담당자 매핑 생성
      const mallAssignedUsersMap: {[key: number]: any[]} = {};
      
      allUsers.forEach((user: any) => {
        let assignedMallIds: number[] = [];
        try {
          assignedMallIds = Array.isArray(user.assigned_vendor_ids)
            ? user.assigned_vendor_ids
            : JSON.parse(user.assigned_vendor_ids || "[]");
        } catch (e) {
          assignedMallIds = [];
        }

        assignedMallIds.forEach((mallId: number) => {
          if (mallIds.includes(mallId)) {
            if (!mallAssignedUsersMap[mallId]) {
              mallAssignedUsersMap[mallId] = [];
            }
            mallAssignedUsersMap[mallId].push({
              id: user.id,
              name: user.name,
              grade: user.grade,
              position: user.position,
              role: user.role,
            });
          }
        });
      });

      // malls에 담당자 정보 추가
      malls.forEach((mall: any) => {
        mall.assignedUsers = mallAssignedUsersMap[mall.id] || [];
      });
    }

    // 전체 개수 조회
    let countQuery = sql`
      SELECT COUNT(*) as total FROM mall WHERE 1=1
    `;


    if (search) {
      countQuery = sql`
        ${countQuery}
        AND (
          name ILIKE ${`%${search}%`}
          OR company_name ILIKE ${`%${search}%`}
          OR code ILIKE ${`%${search}%`}
        )
      `;
    }

    const countResult = await countQuery;
    const total = parseInt(countResult[0].total, 10);

    return NextResponse.json({
      success: true,
      data: malls,
      pagination: {
        total,
        limit,
        offset,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error("쇼핑몰 목록 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

/**
 * POST /api/mall
 * 쇼핑몰 신규 등록
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {name, marketCategory, assignedUserIds} = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        {success: false, error: "쇼핑몰명은 필수입니다."},
        {status: 400}
      );
    }

    // 코드 생성
    const codeNumber = await getStartCodeNumber();
    const code = `shop${String(codeNumber).padStart(4, "0")}`;

    // 쇼핑몰 생성
    const result = await sql`
      INSERT INTO mall (
        code,
        name,
        market_category,
        created_at,
        updated_at
      ) VALUES (
        ${code},
        ${name.trim()},
        ${marketCategory || null},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      RETURNING 
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
    `;

    const newMall = result[0];

    // 담당자 설정
    if (assignedUserIds && Array.isArray(assignedUserIds) && assignedUserIds.length > 0) {
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
          if (!currentIds.includes(newMall.id)) {
            currentIds.push(newMall.id);
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

    // 담당자 조회
    const assignedUsers = await sql`
      SELECT 
        u.id,
        u.name,
        u.grade,
        u.position,
        u.role
      FROM users u
      WHERE u.assigned_vendor_ids @> ${JSON.stringify([newMall.id])}::jsonb
      AND u.is_active = TRUE
      ORDER BY u.name
    `;

    return NextResponse.json({
      success: true,
      data: {
        ...newMall,
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
    console.error("쇼핑몰 생성 실패:", error);
    
    // UNIQUE 제약조건 위반 (코드 중복)
    if (error.code === '23505' || error.message?.includes('unique')) {
      return NextResponse.json(
        {success: false, error: "이미 존재하는 쇼핑몰 코드입니다. 다시 시도해주세요."},
        {status: 409}
      );
    }

    return NextResponse.json(
      {success: false, error: error.message || "쇼핑몰 생성에 실패했습니다."},
      {status: 500}
    );
  }
}
