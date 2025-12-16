import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      type,
      postType,
      name,
      code,
      pkg,
      price,
      salePrice,
      postFee,
      purchase,
      billType,
      category,
      productType,
      sabangName,
      etc,
    } = body;

    if (!name || !code) {
      return NextResponse.json(
        {success: false, error: "상품명과 매핑코드는 필수입니다."},
        {status: 400}
      );
    }

    const result = await sql`
      INSERT INTO products (
        type, post_type, name, code, pkg, price, sale_price, post_fee,
        purchase, bill_type, category, product_type, sabang_name, etc
      ) VALUES (
        ${type || null},
        ${postType || null},
        ${name},
        ${code},
        ${pkg || null},
        ${price !== undefined && price !== null ? price : null},
        ${salePrice !== undefined && salePrice !== null ? salePrice : null},
        ${postFee !== undefined && postFee !== null ? postFee : null},
        ${purchase || null},
        ${billType || null},
        ${category || null},
        ${productType || null},
        ${sabangName || null},
        ${etc || null}
      )
      ON CONFLICT (name, code) DO UPDATE SET
        type = EXCLUDED.type,
        post_type = EXCLUDED.post_type,
        pkg = EXCLUDED.pkg,
        price = EXCLUDED.price,
        sale_price = EXCLUDED.sale_price,
        post_fee = EXCLUDED.post_fee,
        purchase = EXCLUDED.purchase,
        bill_type = EXCLUDED.bill_type,
        category = EXCLUDED.category,
        product_type = EXCLUDED.product_type,
        sabang_name = EXCLUDED.sabang_name,
        etc = EXCLUDED.etc,
          updated_at = (NOW() + INTERVAL '9 hours')
      RETURNING 
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
        etc
    `;

    return NextResponse.json({
      success: true,
      data: result[0],
    });
  } catch (error: any) {
    console.error("상품 생성 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

