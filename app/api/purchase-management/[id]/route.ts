import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

/**
 * 매입처 상세 조회 API
 */
export async function GET(
  request: NextRequest,
  {params}: {params: Promise<{id: string}>}
) {
  try {
    const {id} = await params;
    const purchaseId = parseInt(id);

    if (isNaN(purchaseId)) {
      return NextResponse.json(
        {success: false, error: "유효하지 않은 매입처 ID입니다."},
        {status: 400}
      );
    }

    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400}
      );
    }

    // 매입처 조회
    const result = await sql`
      SELECT id, name, submit_type, email, kakaotalk, template_headers, created_at, updated_at
      FROM purchase
      WHERE id = ${purchaseId} AND company_id = ${companyId}
    `;

    if (result.length === 0) {
      return NextResponse.json(
        {success: false, error: "매입처를 찾을 수 없습니다."},
        {status: 404}
      );
    }

    const purchase = result[0];
    return NextResponse.json({
      success: true,
      data: {
        id: purchase.id,
        name: purchase.name,
        submitType: purchase.submit_type || [],
        email: purchase.email,
        kakaotalk: purchase.kakaotalk,
        templateHeaders: purchase.template_headers,
        createdAt: purchase.created_at,
        updatedAt: purchase.updated_at,
      },
    });
  } catch (error: any) {
    console.error("매입처 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

/**
 * 매입처 수정 API
 */
export async function PUT(
  request: NextRequest,
  {params}: {params: Promise<{id: string}>}
) {
  try {
    const {id} = await params;
    const purchaseId = parseInt(id);

    if (isNaN(purchaseId)) {
      return NextResponse.json(
        {success: false, error: "유효하지 않은 매입처 ID입니다."},
        {status: 400}
      );
    }

    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400}
      );
    }

    const body = await request.json();
    const {name, email, kakaotalk, submitType} = body;

    // 매입처 존재 확인
    const existingResult = await sql`
      SELECT id FROM purchase
      WHERE id = ${purchaseId} AND company_id = ${companyId}
    `;

    if (existingResult.length === 0) {
      return NextResponse.json(
        {success: false, error: "매입처를 찾을 수 없습니다."},
        {status: 404}
      );
    }

    // 매입처 수정
    await sql`
      UPDATE purchase
      SET 
        name = COALESCE(${name}, name),
        email = ${email},
        kakaotalk = ${kakaotalk},
        submit_type = ${submitType || []},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${purchaseId} AND company_id = ${companyId}
    `;

    return NextResponse.json({
      success: true,
      message: "매입처가 수정되었습니다.",
    });
  } catch (error: any) {
    console.error("매입처 수정 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

/**
 * 매입처 삭제 API
 */
export async function DELETE(
  request: NextRequest,
  {params}: {params: Promise<{id: string}>}
) {
  try {
    const {id} = await params;
    const purchaseId = parseInt(id);

    if (isNaN(purchaseId)) {
      return NextResponse.json(
        {success: false, error: "유효하지 않은 매입처 ID입니다."},
        {status: 400}
      );
    }

    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400}
      );
    }

    // 매입처 삭제
    const result = await sql`
      DELETE FROM purchase
      WHERE id = ${purchaseId} AND company_id = ${companyId}
      RETURNING id
    `;

    if (result.length === 0) {
      return NextResponse.json(
        {success: false, error: "매입처를 찾을 수 없습니다."},
        {status: 404}
      );
    }

    return NextResponse.json({
      success: true,
      message: "매입처가 삭제되었습니다.",
    });
  } catch (error: any) {
    console.error("매입처 삭제 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
