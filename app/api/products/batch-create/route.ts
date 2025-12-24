import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {products} = body;

    if (!products || !Array.isArray(products)) {
      return NextResponse.json(
        {success: false, error: "상품 배열이 필요합니다."},
        {status: 400}
      );
    }

    if (products.length === 0) {
      return NextResponse.json({
        success: true,
        message: "저장할 상품이 없습니다.",
        count: 0,
      });
    }

    // 각 상품을 DB에 저장 (중복 시 업데이트)
    const insertPromises = products.map((product: any) => {
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
      } = product;

      console.log("product >>>", product);

      if (!name || !code) {
        return Promise.resolve(null);
      }

      return sql`
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
      `;
    });

    await Promise.all(insertPromises.filter((p) => p !== null));

    return NextResponse.json({
      success: true,
      message: `${products.length}개의 상품이 성공적으로 저장되었습니다.`,
      count: products.length,
    });
  } catch (error: any) {
    console.error("상품 일괄 저장 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
