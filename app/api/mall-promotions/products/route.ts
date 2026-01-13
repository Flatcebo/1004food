import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

/**
 * GET /api/mall-promotions/products
 * 상품 목록 조회 (code 중복 제거, 사방넷명 표시)
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

    // code 중복 제거하여 조회 (대표 하나만)
    // 사방넷명이 있는 것을 우선 선택, 없으면 첫 번째 것 선택
    const products = await sql`
      SELECT DISTINCT ON (code)
        code,
        COALESCE(sabang_name, name) as "displayName",
        sabang_name as "sabangName",
        name,
        sale_price as "salePrice"
      FROM products
      WHERE company_id = ${companyId}
        AND code IS NOT NULL
        AND code != ''
      ORDER BY code, 
        CASE WHEN sabang_name IS NOT NULL AND sabang_name != '' THEN 0 ELSE 1 END,
        id
    `;

    return NextResponse.json({
      success: true,
      data: products,
    });
  } catch (error: any) {
    console.error("상품 목록 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
