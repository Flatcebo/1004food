import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

export async function PUT(request: NextRequest) {
  try {
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
    const updateFields: any = {};

    if (
      updates.type !== undefined &&
      updates.type !== null &&
      updates.type !== ""
    ) {
      updateFields.type = updates.type;
    }
    if (
      updates.postType !== undefined &&
      updates.postType !== null &&
      updates.postType !== ""
    ) {
      updateFields.post_type = updates.postType || "";
    }
    if (
      updates.pkg !== undefined &&
      updates.pkg !== null &&
      updates.pkg !== ""
    ) {
      updateFields.pkg = updates.pkg;
    }
    if (
      updates.price !== undefined &&
      updates.price !== null &&
      updates.price !== ""
    ) {
      const priceValue =
        typeof updates.price === "number"
          ? updates.price
          : parseFloat(String(updates.price));
      if (!isNaN(priceValue)) {
        updateFields.price = priceValue;
      }
    }
    if (
      updates.salePrice !== undefined &&
      updates.salePrice !== null &&
      updates.salePrice !== ""
    ) {
      const salePriceValue =
        typeof updates.salePrice === "number"
          ? updates.salePrice
          : parseFloat(String(updates.salePrice));
      if (!isNaN(salePriceValue)) {
        updateFields.sale_price = salePriceValue;
      }
    }
    if (
      updates.postFee !== undefined &&
      updates.postFee !== null &&
      updates.postFee !== ""
    ) {
      const postFeeValue =
        typeof updates.postFee === "number"
          ? updates.postFee
          : parseFloat(String(updates.postFee));
      if (!isNaN(postFeeValue)) {
        updateFields.post_fee = postFeeValue;
      }
    }
    if (
      updates.purchase !== undefined &&
      updates.purchase !== null &&
      updates.purchase !== ""
    ) {
      updateFields.purchase = updates.purchase;
    }
    if (
      updates.billType !== undefined &&
      updates.billType !== null &&
      updates.billType !== ""
    ) {
      updateFields.bill_type = updates.billType;
    }
    if (
      updates.category !== undefined &&
      updates.category !== null &&
      updates.category !== ""
    ) {
      updateFields.category = updates.category;
    }
    if (
      updates.productType !== undefined &&
      updates.productType !== null &&
      updates.productType !== ""
    ) {
      updateFields.product_type = updates.productType;
    }
    if (
      updates.sabangName !== undefined &&
      updates.sabangName !== null &&
      updates.sabangName !== ""
    ) {
      updateFields.sabang_name = updates.sabangName;
    }
    if (
      updates.etc !== undefined &&
      updates.etc !== null &&
      updates.etc !== ""
    ) {
      updateFields.etc = updates.etc;
    }

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json({
        success: true,
        message: "수정할 필드가 없습니다.",
        count: 0,
      });
    }

    // 각 필드를 개별적으로 업데이트 (안전하고 확실한 방법)
    const updatePromises: Promise<any>[] = [];
    const updatedIdsSet = new Set<number>();

    if (updateFields.type !== undefined) {
      const result = await sql`
        UPDATE products 
        SET type = ${updateFields.type}, updated_at = (NOW() + INTERVAL '9 hours')
        WHERE id = ANY(${ids}::int[])
        RETURNING id
      `;
      result.forEach((row: any) => updatedIdsSet.add(row.id));
    }
    if (updateFields.post_type !== undefined) {
      const result = await sql`
        UPDATE products 
        SET post_type = ${updateFields.post_type}, updated_at = (NOW() + INTERVAL '9 hours')
        WHERE id = ANY(${ids}::int[])
        RETURNING id
      `;
      result.forEach((row: any) => updatedIdsSet.add(row.id));
    }
    if (updateFields.pkg !== undefined) {
      const result = await sql`
        UPDATE products 
        SET pkg = ${updateFields.pkg}, updated_at = (NOW() + INTERVAL '9 hours')
        WHERE id = ANY(${ids}::int[])
        RETURNING id
      `;
      result.forEach((row: any) => updatedIdsSet.add(row.id));
    }
    if (updateFields.price !== undefined) {
      const result = await sql`
        UPDATE products 
        SET price = ${updateFields.price}, updated_at = (NOW() + INTERVAL '9 hours')
        WHERE id = ANY(${ids}::int[])
        RETURNING id
      `;
      result.forEach((row: any) => updatedIdsSet.add(row.id));
    }
    if (updateFields.sale_price !== undefined) {
      const result = await sql`
        UPDATE products 
        SET sale_price = ${updateFields.sale_price}, updated_at = (NOW() + INTERVAL '9 hours')
        WHERE id = ANY(${ids}::int[])
        RETURNING id
      `;
      result.forEach((row: any) => updatedIdsSet.add(row.id));
    }
    if (updateFields.post_fee !== undefined) {
      const result = await sql`
        UPDATE products 
        SET post_fee = ${updateFields.post_fee}, updated_at = (NOW() + INTERVAL '9 hours')
        WHERE id = ANY(${ids}::int[])
        RETURNING id
      `;
      result.forEach((row: any) => updatedIdsSet.add(row.id));
    }
    if (updateFields.purchase !== undefined) {
      const result = await sql`
        UPDATE products 
        SET purchase = ${updateFields.purchase}, updated_at = (NOW() + INTERVAL '9 hours')
        WHERE id = ANY(${ids}::int[])
        RETURNING id
      `;
      result.forEach((row: any) => updatedIdsSet.add(row.id));
    }
    if (updateFields.bill_type !== undefined) {
      const result = await sql`
        UPDATE products 
        SET bill_type = ${updateFields.bill_type}, updated_at = (NOW() + INTERVAL '9 hours')
        WHERE id = ANY(${ids}::int[])
        RETURNING id
      `;
      result.forEach((row: any) => updatedIdsSet.add(row.id));
    }
    if (updateFields.category !== undefined) {
      const result = await sql`
        UPDATE products 
        SET category = ${updateFields.category}, updated_at = (NOW() + INTERVAL '9 hours')
        WHERE id = ANY(${ids}::int[])
        RETURNING id
      `;
      result.forEach((row: any) => updatedIdsSet.add(row.id));
    }
    if (updateFields.product_type !== undefined) {
      const result = await sql`
        UPDATE products 
        SET product_type = ${updateFields.product_type}, updated_at = (NOW() + INTERVAL '9 hours')
        WHERE id = ANY(${ids}::int[])
        RETURNING id
      `;
      result.forEach((row: any) => updatedIdsSet.add(row.id));
    }
    if (updateFields.sabang_name !== undefined) {
      const result = await sql`
        UPDATE products 
        SET sabang_name = ${updateFields.sabang_name}, updated_at = (NOW() + INTERVAL '9 hours')
        WHERE id = ANY(${ids}::int[])
        RETURNING id
      `;
      result.forEach((row: any) => updatedIdsSet.add(row.id));
    }
    if (updateFields.etc !== undefined) {
      const result = await sql`
        UPDATE products 
        SET etc = ${updateFields.etc}, updated_at = (NOW() + INTERVAL '9 hours')
        WHERE id = ANY(${ids}::int[])
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
