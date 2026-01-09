import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

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

    const {searchParams} = new URL(request.url);
    const countOnly = searchParams.get("count") === "true";

    if (countOnly) {
      // 상품 수만 조회 (company_id 필터링)
      const result = await sql`
        SELECT COUNT(*) as total FROM products
        WHERE company_id = ${companyId}
      `;

      return NextResponse.json({
        success: true,
        total: parseInt(result[0].total),
      });
    }

    const products = await sql`
      SELECT
        id,
        type,
        post_type as "postType",
        name,
        code,
        pkg,
        price,
        sale_price as "salePrice",
        supply_price as "supplyPrice",
        post_fee as "postFee",
        purchase,
        bill_type as "billType",
        category,
        product_type as "productType",
        sabang_name as "sabangName",
        etc,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM products
      WHERE company_id = ${companyId}
      ORDER BY created_at DESC, id DESC
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
