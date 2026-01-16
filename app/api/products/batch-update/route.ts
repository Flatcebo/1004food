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

export async function PUT(request: NextRequest) {
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
    const {ids, updates} = body;

    // console.log("일괄 수정 요청 받음:", {ids, updates});

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      console.error("유효하지 않은 ids:", ids);
      return NextResponse.json(
        {success: false, error: "수정할 상품 ID 배열이 필요합니다."},
        {status: 400}
      );
    }

    if (!updates || typeof updates !== "object") {
      console.error("유효하지 않은 updates:", updates);
      return NextResponse.json(
        {success: false, error: "수정할 필드 정보가 필요합니다."},
        {status: 400}
      );
    }

    // 업데이트할 필드만 추출 및 정규화
    // null 값도 업데이트하도록 수정 (빈 문자열은 null로 변환)
    const updateFields: any = {};

    if (updates.type !== undefined) {
      updateFields.type =
        updates.type === "" || updates.type === null ? null : updates.type;
    }
    if (updates.postType !== undefined) {
      updateFields.post_type =
        updates.postType === "" || updates.postType === null
          ? ""
          : updates.postType;
    }
    if (updates.pkg !== undefined) {
      updateFields.pkg =
        updates.pkg === "" || updates.pkg === null ? null : updates.pkg;
    }
    if (updates.price !== undefined) {
      if (updates.price === "" || updates.price === null) {
        updateFields.price = null;
      } else {
        const priceValue =
          typeof updates.price === "number"
            ? updates.price
            : parseFloat(String(updates.price));
        if (!isNaN(priceValue)) {
          updateFields.price = priceValue;
        } else {
          updateFields.price = null;
        }
      }
    }
    if (updates.salePrice !== undefined) {
      if (updates.salePrice === "" || updates.salePrice === null) {
        updateFields.sale_price = null;
      } else {
        const salePriceValue =
          typeof updates.salePrice === "number"
            ? updates.salePrice
            : parseFloat(String(updates.salePrice));
        if (!isNaN(salePriceValue)) {
          updateFields.sale_price = salePriceValue;
        } else {
          updateFields.sale_price = null;
        }
      }
    }
    if (updates.postFee !== undefined) {
      if (updates.postFee === "" || updates.postFee === null) {
        updateFields.post_fee = null;
      } else {
        const postFeeValue =
          typeof updates.postFee === "number"
            ? updates.postFee
            : parseFloat(String(updates.postFee));
        if (!isNaN(postFeeValue)) {
          updateFields.post_fee = postFeeValue;
        } else {
          updateFields.post_fee = null;
        }
      }
    }
    if (updates.purchase !== undefined) {
      updateFields.purchase =
        updates.purchase === "" || updates.purchase === null
          ? null
          : updates.purchase;
    }
    if (updates.billType !== undefined) {
      updateFields.bill_type =
        updates.billType === "" || updates.billType === null
          ? null
          : updates.billType;
    }
    if (updates.category !== undefined) {
      updateFields.category =
        updates.category === "" || updates.category === null
          ? null
          : updates.category;
    }
    if (updates.productType !== undefined) {
      updateFields.product_type =
        updates.productType === "" || updates.productType === null
          ? null
          : updates.productType;
    }
    if (updates.sabangName !== undefined) {
      updateFields.sabang_name =
        updates.sabangName === "" || updates.sabangName === null
          ? null
          : updates.sabangName;
    }
    if (updates.etc !== undefined) {
      updateFields.etc =
        updates.etc === "" || updates.etc === null ? null : updates.etc;
    }

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json({
        success: true,
        message: "수정할 필드가 없습니다.",
        count: 0,
      });
    }

    // 한국 시간 생성
    const koreaTime = getKoreaTime();

    // 각 필드를 개별적으로 업데이트 (안전하고 확실한 방법)
    const updatePromises: Promise<any>[] = [];
    const updatedIdsSet = new Set<number>();

    if (updateFields.type !== undefined) {
      const result = await sql`
        UPDATE products 
        SET type = ${updateFields.type}, updated_at = ${koreaTime.toISOString()}::timestamp
        WHERE id = ANY(${ids}::int[]) AND company_id = ${companyId}
        RETURNING id
      `;
      result.forEach((row: any) => updatedIdsSet.add(row.id));
    }
    if (updateFields.post_type !== undefined) {
      const result = await sql`
        UPDATE products 
        SET post_type = ${updateFields.post_type}, updated_at = ${koreaTime.toISOString()}::timestamp
        WHERE id = ANY(${ids}::int[]) AND company_id = ${companyId}
        RETURNING id
      `;
      result.forEach((row: any) => updatedIdsSet.add(row.id));
    }
    if (updateFields.pkg !== undefined) {
      const result = await sql`
        UPDATE products 
        SET pkg = ${updateFields.pkg}, updated_at = ${koreaTime.toISOString()}::timestamp
        WHERE id = ANY(${ids}::int[]) AND company_id = ${companyId}
        RETURNING id
      `;
      result.forEach((row: any) => updatedIdsSet.add(row.id));
    }
    if (updateFields.price !== undefined) {
      const result = await sql`
        UPDATE products 
        SET price = ${updateFields.price}, updated_at = ${koreaTime.toISOString()}::timestamp
        WHERE id = ANY(${ids}::int[]) AND company_id = ${companyId}
        RETURNING id
      `;
      result.forEach((row: any) => updatedIdsSet.add(row.id));
    }
    if (updateFields.sale_price !== undefined) {
      const result = await sql`
        UPDATE products 
        SET sale_price = ${updateFields.sale_price}, updated_at = ${koreaTime.toISOString()}::timestamp
        WHERE id = ANY(${ids}::int[]) AND company_id = ${companyId}
        RETURNING id
      `;
      result.forEach((row: any) => updatedIdsSet.add(row.id));
    }
    if (updateFields.post_fee !== undefined) {
      const result = await sql`
        UPDATE products 
        SET post_fee = ${updateFields.post_fee}, updated_at = ${koreaTime.toISOString()}::timestamp
        WHERE id = ANY(${ids}::int[]) AND company_id = ${companyId}
        RETURNING id
      `;
      result.forEach((row: any) => updatedIdsSet.add(row.id));
    }
    if (updateFields.purchase !== undefined) {
      const result = await sql`
        UPDATE products 
        SET purchase = ${updateFields.purchase}, updated_at = ${koreaTime.toISOString()}::timestamp
        WHERE id = ANY(${ids}::int[]) AND company_id = ${companyId}
        RETURNING id
      `;
      result.forEach((row: any) => updatedIdsSet.add(row.id));
    }
    if (updateFields.bill_type !== undefined) {
      const result = await sql`
        UPDATE products 
        SET bill_type = ${updateFields.bill_type}, updated_at = ${koreaTime.toISOString()}::timestamp
        WHERE id = ANY(${ids}::int[]) AND company_id = ${companyId}
        RETURNING id
      `;
      result.forEach((row: any) => updatedIdsSet.add(row.id));
    }
    if (updateFields.category !== undefined) {
      const result = await sql`
        UPDATE products 
        SET category = ${updateFields.category}, updated_at = ${koreaTime.toISOString()}::timestamp
        WHERE id = ANY(${ids}::int[]) AND company_id = ${companyId}
        RETURNING id
      `;
      result.forEach((row: any) => updatedIdsSet.add(row.id));
    }
    if (updateFields.product_type !== undefined) {
      const result = await sql`
        UPDATE products 
        SET product_type = ${updateFields.product_type}, updated_at = ${koreaTime.toISOString()}::timestamp
        WHERE id = ANY(${ids}::int[]) AND company_id = ${companyId}
        RETURNING id
      `;
      result.forEach((row: any) => updatedIdsSet.add(row.id));
    }
    if (updateFields.sabang_name !== undefined) {
      const result = await sql`
        UPDATE products 
        SET sabang_name = ${updateFields.sabang_name}, updated_at = ${koreaTime.toISOString()}::timestamp
        WHERE id = ANY(${ids}::int[]) AND company_id = ${companyId}
        RETURNING id
      `;
      result.forEach((row: any) => updatedIdsSet.add(row.id));
    }
    if (updateFields.etc !== undefined) {
      const result = await sql`
        UPDATE products 
        SET etc = ${updateFields.etc}, updated_at = ${koreaTime.toISOString()}::timestamp
        WHERE id = ANY(${ids}::int[]) AND company_id = ${companyId}
        RETURNING id
      `;
      result.forEach((row: any) => updatedIdsSet.add(row.id));
    }

    console.log("일괄 수정 완료:", {
      ids,
      updateFields,
      updatedCount: updatedIdsSet.size,
    });

    const count = updatedIdsSet.size;

    return NextResponse.json({
      success: true,
      message: `${count}개의 상품이 성공적으로 수정되었습니다.`,
      count: count,
    });
  } catch (error: any) {
    console.error("상품 일괄 수정 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
