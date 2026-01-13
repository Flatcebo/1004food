import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

/**
 * GET /api/mall-promotions
 * 행사가 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const {searchParams} = new URL(request.url);
    const mallId = searchParams.get("mallId");

    let query = sql`
      SELECT 
        mp.id,
        mp.mall_id as "mallId",
        m.name as "mallName",
        mp.product_code as "productCode",
        mp.discount_rate as "discountRate",
        mp.event_price as "eventPrice",
        mp.created_at as "createdAt",
        mp.updated_at as "updatedAt"
      FROM mall_promotions mp
      INNER JOIN mall m ON mp.mall_id = m.id
      WHERE 1=1
    `;

    if (mallId) {
      query = sql`${query} AND mp.mall_id = ${parseInt(mallId)}`;
    }

    query = sql`
      ${query}
      ORDER BY m.name, mp.product_code
    `;

    const promotions = await query;

    return NextResponse.json({
      success: true,
      data: promotions,
    });
  } catch (error: any) {
    console.error("행사가 목록 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

/**
 * POST /api/mall-promotions
 * 행사가 생성
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {mallId, productCode, discountRate, eventPrice} = body;

    if (!mallId || !productCode) {
      return NextResponse.json(
        {success: false, error: "mallId와 productCode는 필수입니다."},
        {status: 400}
      );
    }

    // discountRate와 eventPrice 중 하나는 필수
    if (discountRate === null && eventPrice === null) {
      return NextResponse.json(
        {success: false, error: "할인율 또는 행사가 중 하나는 입력해야 합니다."},
        {status: 400}
      );
    }

    const result = await sql`
      INSERT INTO mall_promotions (
        mall_id,
        product_code,
        discount_rate,
        event_price
      ) VALUES (
        ${mallId},
        ${productCode},
        ${discountRate || null},
        ${eventPrice || null}
      )
      ON CONFLICT (mall_id, product_code) DO UPDATE SET
        discount_rate = EXCLUDED.discount_rate,
        event_price = EXCLUDED.event_price,
        updated_at = CURRENT_TIMESTAMP
      RETURNING 
        id,
        mall_id as "mallId",
        product_code as "productCode",
        discount_rate as "discountRate",
        event_price as "eventPrice",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;

    return NextResponse.json({
      success: true,
      data: result[0],
    });
  } catch (error: any) {
    console.error("행사가 생성 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

/**
 * DELETE /api/mall-promotions
 * 행사가 삭제
 */
export async function DELETE(request: NextRequest) {
  try {
    const {searchParams} = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        {success: false, error: "id는 필수입니다."},
        {status: 400}
      );
    }

    await sql`
      DELETE FROM mall_promotions
      WHERE id = ${parseInt(id)}
    `;

    return NextResponse.json({
      success: true,
      message: "행사가가 삭제되었습니다.",
    });
  } catch (error: any) {
    console.error("행사가 삭제 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
