import {NextResponse} from "next/server";
import sql from "@/lib/db";

export async function GET() {
  try {
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
      ORDER BY name ASC
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

