import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

export async function POST(request: NextRequest) {
  try {
    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400}
      );
    }

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

    // UNIQUE 제약조건 확인 및 생성
    let hasUniqueConstraint = false;
    try {
      const constraintExists = await sql`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.table_constraints 
          WHERE table_name = 'products' 
          AND constraint_name = 'products_company_name_code_post_type_key'
          AND constraint_type = 'UNIQUE'
        )
      `;

      if (constraintExists[0].exists) {
        hasUniqueConstraint = true;
      } else {
        // 기존 UNIQUE 제약조건 확인 및 삭제
        const constraints = await sql`
          SELECT constraint_name 
          FROM information_schema.table_constraints 
          WHERE table_name = 'products' 
          AND constraint_type = 'UNIQUE'
          AND constraint_name != 'products_pkey'
        `;

        for (const constraint of constraints) {
          await sql`
            ALTER TABLE products 
            DROP CONSTRAINT IF EXISTS ${sql(constraint.constraint_name)}
          `;
        }

        // 새로운 UNIQUE 제약조건 추가 (company_id 포함)
        try {
          await sql`
            ALTER TABLE products 
            ADD CONSTRAINT products_company_name_code_post_type_key 
            UNIQUE (company_id, name, code, post_type)
          `;
          hasUniqueConstraint = true;
        } catch (addError: any) {
          console.log("UNIQUE 제약조건 추가 실패:", addError.message);
          // 제약조건 추가 실패 시 ON CONFLICT 없이 진행
        }
      }
    } catch (error: any) {
      console.log("UNIQUE 제약조건 확인 실패:", error.message);
      // 제약조건 확인 실패 시 ON CONFLICT 없이 진행
    }

    // 각 상품을 DB에 저장 (중복 시 업데이트, company_id 포함)
    if (hasUniqueConstraint) {
      // 제약조건이 있으면 ON CONFLICT 사용
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

        if (!name || !code) {
          return Promise.resolve(null);
        }

        // 택배사가 null이면 빈 문자열로 변환
        const normalizedPostType = postType || "";

        return sql`
          INSERT INTO products (
            company_id, type, post_type, name, code, pkg, price, sale_price, post_fee,
            purchase, bill_type, category, product_type, sabang_name, etc
          ) VALUES (
            ${companyId},
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
          ON CONFLICT (company_id, name, code, post_type) DO UPDATE SET
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
        `;
      });

      await Promise.all(insertPromises.filter((p) => p !== null));
    } else {
      // 제약조건이 없으면 각 상품을 순차적으로 처리
      for (const product of products) {
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

        if (!name || !code) {
          continue;
        }

        // 택배사가 null이면 빈 문자열로 변환
        const normalizedPostType = postType || "";

        // 기존 상품 확인
        const existing = await sql`
          SELECT id FROM products 
          WHERE company_id = ${companyId}
            AND name = ${name}
            AND code = ${code}
            AND post_type = ${normalizedPostType}
          LIMIT 1
        `;

        if (existing.length > 0) {
          // 업데이트
          await sql`
            UPDATE products SET
              type = ${type || null},
              pkg = ${pkg || null},
              price = ${price !== undefined && price !== null ? price : null},
              sale_price = ${
                salePrice !== undefined && salePrice !== null ? salePrice : null
              },
              post_fee = ${
                postFee !== undefined && postFee !== null ? postFee : null
              },
              purchase = ${purchase || null},
              bill_type = ${billType || null},
              category = ${category || null},
              product_type = ${productType || null},
              sabang_name = ${sabangName || null},
              etc = ${etc || null},
              updated_at = (NOW() + INTERVAL '9 hours')
            WHERE id = ${existing[0].id}
          `;
        } else {
          // 새로 INSERT
          await sql`
            INSERT INTO products (
              company_id, type, post_type, name, code, pkg, price, sale_price, post_fee,
              purchase, bill_type, category, product_type, sabang_name, etc
            ) VALUES (
              ${companyId},
              ${type || null},
              ${normalizedPostType},
              ${name},
              ${code},
              ${pkg || null},
              ${price !== undefined && price !== null ? price : null},
              ${
                salePrice !== undefined && salePrice !== null ? salePrice : null
              },
              ${postFee !== undefined && postFee !== null ? postFee : null},
              ${purchase || null},
              ${billType || null},
              ${category || null},
              ${productType || null},
              ${sabangName || null},
              ${etc || null}
            )
          `;
        }
      }
    }

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
