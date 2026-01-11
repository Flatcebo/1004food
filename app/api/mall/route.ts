import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

/**
 * GET /api/mall
 * 쇼핑몰 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    // company_id 추출 (필요한 경우)
    const companyId = await getCompanyIdFromRequest(request);

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
