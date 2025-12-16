import {NextResponse} from "next/server";
import sql from "@/lib/db";
import fs from "fs";
import path from "path";

// codes.json 파일 읽기
const codesDataPath = path.join(process.cwd(), "public", "data", "mapping", "codes.json");
const codesData = JSON.parse(fs.readFileSync(codesDataPath, "utf-8"));

export async function POST() {
  try {
    // 기존 데이터 삭제 (선택사항 - 필요시 주석 처리)
    await sql`TRUNCATE TABLE products RESTART IDENTITY CASCADE`;

    // codes.json 데이터를 DB에 삽입
    const insertPromises = codesData.map((item: any) => {
      return sql`
        INSERT INTO products (
          type, post_type, name, code, pkg, price, sale_price, post_fee,
          purchase, bill_type, category, product_type, sabang_name, etc
        ) VALUES (
          ${item.type || null},
          ${item.postType || null},
          ${item.name},
          ${item.code},
          ${item.pkg || null},
          ${item.price !== undefined && item.price !== null ? item.price : null},
          ${item.salePrice !== undefined && item.salePrice !== null ? item.salePrice : null},
          ${item.postFee !== undefined && item.postFee !== null ? item.postFee : null},
          ${item.purchase || null},
          ${item.billType || null},
          ${item.category || null},
          ${item.productType || null},
          ${item.sabangName || null},
          ${item.etc || null}
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

    await Promise.all(insertPromises);

    return NextResponse.json({
      success: true,
      message: `${codesData.length}개의 상품 데이터가 성공적으로 시딩되었습니다.`,
    });
  } catch (error: any) {
    console.error("상품 데이터 시딩 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

