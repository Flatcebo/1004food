import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

// 한국 시간(KST, UTC+9)을 반환하는 함수
function getKoreaTime(): Date {
  const now = new Date();
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
  const koreaTime = new Date(utcTime + 9 * 3600000);
  return koreaTime;
}

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
    
    // 한국 시간 생성
    const koreaTime = getKoreaTime();

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

    // 조건부 삭제 로직: 상품명, 사방넷명, 매핑코드가 모두 동일한 경우
    // 택배사가 공란이 아닌 상품만 남기고, 상품명과 사방넷명이 동일한 상품 중 택배사가 공란인 것만 삭제
    if (name && code && normalizedSabangName) {
      try {
        // 1. 같은 상품명, 사방넷명, 매핑코드를 가진 상품들 찾기 (company_id 필터링)
        const duplicateProducts = await sql`
          SELECT id, post_type, name, sabang_name, code
          FROM products
          WHERE name = ${name}
            AND sabang_name = ${normalizedSabangName}
            AND code = ${code}
            AND company_id = ${companyId}
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

        // 4. 상품명과 사방넷명이 동일한 모든 상품 찾기 (매핑코드 무관, company_id 필터링)
        const sameNameSabangProducts = await sql`
          SELECT id, post_type, code
          FROM products
          WHERE name = ${name}
            AND sabang_name = ${normalizedSabangName}
            AND code != ${code}
            AND company_id = ${companyId}
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

    let result;
    if (hasUniqueConstraint) {
      // 제약조건이 있으면 ON CONFLICT 사용
      result = await sql`
        INSERT INTO products (
          company_id, type, post_type, name, code, pkg, price, sale_price, post_fee,
          purchase, bill_type, category, product_type, sabang_name, etc,
          created_at, updated_at
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
          ${etc || null},
          ${koreaTime.toISOString()}::timestamp,
          ${koreaTime.toISOString()}::timestamp
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
          updated_at = ${koreaTime.toISOString()}::timestamp
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
    } else {
      // 제약조건이 없으면 중복 체크 후 INSERT 또는 UPDATE
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
        result = await sql`
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
      } else {
        // 새로 INSERT
        result = await sql`
          INSERT INTO products (
            company_id, type, post_type, name, code, pkg, price, sale_price, post_fee,
            purchase, bill_type, category, product_type, sabang_name, etc,
            created_at, updated_at
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
            ${etc || null},
            ${koreaTime.toISOString()}::timestamp,
            ${koreaTime.toISOString()}::timestamp
          )
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
      }
    }

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
