import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

/**
 * 매입처 목록 조회 API
 */
export async function GET(request: NextRequest) {
  try {
    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400}
      );
    }

    // URL 파라미터 추출
    const {searchParams} = new URL(request.url);
    const search = searchParams.get("search");

    // 매입처 목록 조회
    let purchases;
    if (search) {
      purchases = await sql`
        SELECT id, name, submit_type, email, kakaotalk, created_at, updated_at
        FROM purchase
        WHERE company_id = ${companyId}
          AND name ILIKE ${"%" + search + "%"}
        ORDER BY name
      `;
    } else {
      purchases = await sql`
        SELECT id, name, submit_type, email, kakaotalk, created_at, updated_at
        FROM purchase
        WHERE company_id = ${companyId}
        ORDER BY name
      `;
    }

    return NextResponse.json({
      success: true,
      data: purchases.map((row: any) => ({
        id: row.id,
        name: row.name,
        submitType: row.submit_type || [],
        email: row.email,
        kakaotalk: row.kakaotalk,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error: any) {
    console.error("매입처 목록 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
