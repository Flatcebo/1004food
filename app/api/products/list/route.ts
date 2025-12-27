import {NextResponse} from "next/server";
import sql from "@/lib/db";

export async function GET(request: Request) {
  try {
    const {searchParams} = new URL(request.url);
    const countOnly = searchParams.get("count") === "true";

    if (countOnly) {
      // 상품 수만 조회
      const result = await sql`
        SELECT COUNT(*) as total FROM products
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
