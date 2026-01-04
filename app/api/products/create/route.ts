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

    // 택배사가 null이면 빈 문자열로 변환 (NULL은 UNIQUE 제약조건에서 서로 다른 값으로 취급되므로)
    const normalizedPostType = postType || "";
    const normalizedSabangName = sabangName || null;

    // 조건부 삭제 로직: 상품명, 사방넷명, 매핑코드가 모두 동일한 경우
    // 택배사가 공란이 아닌 상품만 남기고, 상품명과 사방넷명이 동일한 상품 중 택배사가 공란인 것만 삭제
    if (name && code && normalizedSabangName) {
      try {
        // 1. 같은 상품명, 사방넷명, 매핑코드를 가진 상품들 찾기
        const duplicateProducts = await sql`
          SELECT id, post_type, name, sabang_name, code
          FROM products
          WHERE name = ${name}
            AND sabang_name = ${normalizedSabangName}
            AND code = ${code}
        `;

        if (duplicateProducts.length > 0) {
          // 2. 삭제할 상품 ID 목록 (택배사가 공란인 상품들만)
          const deleteIds = duplicateProducts
            .filter((p: any) => !p.post_type || p.post_type.trim() === "")
            .map((p: any) => p.id);

          // 3. 택배사가 공란인 상품들 삭제
          if (deleteIds.length > 0) {
            await sql`
              DELETE FROM products
              WHERE id = ANY(${deleteIds}::int[])
            `;
            console.log(
              `✅ 조건부 삭제: ${deleteIds.length}개 상품 삭제 (상품명/사방넷명/매핑코드 동일, 택배사 공란)`
            );
          }
        }

        // 4. 상품명과 사방넷명이 동일한 모든 상품 찾기 (매핑코드 무관)
        const sameNameSabangProducts = await sql`
          SELECT id, post_type, code
          FROM products
          WHERE name = ${name}
            AND sabang_name = ${normalizedSabangName}
            AND code != ${code}
        `;

        // 5. 삭제할 상품 ID 목록 (상품명, 사방넷명 동일하지만 매핑코드 다른 상품 중 택배사 공란만)
        const deleteIdsFromSameName = sameNameSabangProducts
          .filter((p: any) => !p.post_type || p.post_type.trim() === "")
          .map((p: any) => p.id);

        // 6. 상품명과 사방넷명이 동일한 상품 중 택배사가 공란인 것들 삭제
        if (deleteIdsFromSameName.length > 0) {
          await sql`
            DELETE FROM products
            WHERE id = ANY(${deleteIdsFromSameName}::int[])
          `;
          console.log(
            `✅ 조건부 삭제: ${deleteIdsFromSameName.length}개 상품 삭제 (상품명/사방넷명 동일, 택배사 공란)`
          );
        }
      } catch (deleteError: any) {
        console.error("조건부 삭제 중 오류 발생:", deleteError);
        // 삭제 실패해도 계속 진행 (기존 동작 유지)
      }
    }

    const result = await sql`
      INSERT INTO products (
        type, post_type, name, code, pkg, price, sale_price, post_fee,
        purchase, bill_type, category, product_type, sabang_name, etc
      ) VALUES (
        ${type || null},
        ${normalizedPostType},
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
      ON CONFLICT (name, code, post_type) DO UPDATE SET
        type = EXCLUDED.type,
        post_type = COALESCE(EXCLUDED.post_type, ''),
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
