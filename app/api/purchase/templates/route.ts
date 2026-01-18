import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

// 한국 시간(KST, UTC+9)을 반환하는 함수 - 정확한 한국 시간 문자열 생성
function getKoreaTimeString(): string {
  const now = new Date();
  const koreaTimeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // 한국 시간으로 포맷팅
  const parts = koreaTimeFormatter.formatToParts(now);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  const hour = parts.find(p => p.type === 'hour')?.value;
  const minute = parts.find(p => p.type === 'minute')?.value;
  const second = parts.find(p => p.type === 'second')?.value;
  
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/**
 * GET /api/purchase/templates
 * purchase 테이블의 템플릿 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400}
      );
    }

    // purchase 테이블에 template_headers 컬럼이 없으면 추가
    try {
      await sql`
        ALTER TABLE purchase 
        ADD COLUMN IF NOT EXISTS template_headers JSONB
      `;
    } catch (error: any) {
      // 컬럼이 이미 존재하거나 다른 오류인 경우 무시
      console.log("템플릿 컬럼 확인:", error.message);
    }

    const results = await sql`
      SELECT id, name, template_headers, created_at, updated_at
      FROM purchase
      WHERE company_id = ${companyId}
      ORDER BY name
    `;

    return NextResponse.json({
      success: true,
      data: results,
    });
  } catch (error: any) {
    console.error("템플릿 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

/**
 * PUT /api/purchase/templates
 * purchase 테이블의 특정 업체에 템플릿 저장
 * 
 * templateHeaders 구조:
 * [
 *   {
 *     column_key: string,      // 내부 매핑용 고유 키 (예: "vendor", "productName" 등)
 *     column_label: string,    // 헤더 Alias의 기본 라벨
 *     display_name: string     // 사용자가 변경한 헤더명 (엑셀 다운로드 시 헤더로 사용)
 *   },
 *   ...
 * ]
 * 
 * 다운로드 시 사용 방법:
 * 1. display_name을 엑셀 파일의 헤더로 사용
 * 2. column_key를 사용하여 DB의 주문 데이터를 매핑
 *    예: column_key가 "vendor"이면 row["업체명"] 또는 row["vendor_name"] 등에서 데이터 가져오기
 */
export async function PUT(request: NextRequest) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400}
      );
    }

    const body = await request.json();
    const {purchaseId, templateHeaders} = body;

    if (!purchaseId || !templateHeaders) {
      return NextResponse.json(
        {success: false, error: "purchaseId와 templateHeaders가 필요합니다."},
        {status: 400}
      );
    }

    // purchase 테이블에 template_headers 컬럼이 없으면 추가
    try {
      await sql`
        ALTER TABLE purchase 
        ADD COLUMN IF NOT EXISTS template_headers JSONB
      `;
    } catch (error: any) {
      // 컬럼이 이미 존재하거나 다른 오류인 경우 무시
      console.log("템플릿 컬럼 확인:", error.message);
    }

    // 한국 시간 생성
    const koreaTimeString = getKoreaTimeString();

    // 템플릿 저장
    const result = await sql`
      UPDATE purchase
      SET template_headers = ${JSON.stringify(templateHeaders)},
          updated_at = ${koreaTimeString}::TIMESTAMP
      WHERE id = ${purchaseId} AND company_id = ${companyId}
      RETURNING id, name, template_headers, updated_at
    `;

    if (result.length === 0) {
      return NextResponse.json(
        {success: false, error: "해당 업체를 찾을 수 없습니다."},
        {status: 404}
      );
    }

    return NextResponse.json({
      success: true,
      data: result[0],
    });
  } catch (error: any) {
    console.error("템플릿 저장 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

/**
 * DELETE /api/purchase/templates
 * purchase 테이블의 특정 업체 템플릿 삭제 (template_headers를 NULL로 설정)
 */
export async function DELETE(request: NextRequest) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400}
      );
    }

    const {searchParams} = new URL(request.url);
    const purchaseId = searchParams.get("purchaseId");

    if (!purchaseId) {
      return NextResponse.json(
        {success: false, error: "purchaseId가 필요합니다."},
        {status: 400}
      );
    }

    // 한국 시간 생성
    const koreaTimeString = getKoreaTimeString();

    // 템플릿 삭제 (template_headers를 NULL로 설정)
    const result = await sql`
      UPDATE purchase
      SET template_headers = NULL,
          updated_at = ${koreaTimeString}::TIMESTAMP
      WHERE id = ${purchaseId} AND company_id = ${companyId}
      RETURNING id, name, template_headers, updated_at
    `;

    if (result.length === 0) {
      return NextResponse.json(
        {success: false, error: "해당 업체를 찾을 수 없습니다."},
        {status: 404}
      );
    }

    return NextResponse.json({
      success: true,
      message: "템플릿이 성공적으로 삭제되었습니다.",
      data: result[0],
    });
  } catch (error: any) {
    console.error("템플릿 삭제 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
