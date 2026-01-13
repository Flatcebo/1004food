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

    const {deliveryData} = await request.json();

    if (!deliveryData || !Array.isArray(deliveryData)) {
      return NextResponse.json(
        {success: false, error: "deliveryData가 필요합니다."},
        {status: 400}
      );
    }

    // 트랜잭션 시작
    await sql`BEGIN`;

    try {
      // 배치 처리: jsonb_set을 사용하여 SELECT 없이 직접 업데이트 (성능 최적화)
      // 각 항목마다 개별 UPDATE 쿼리 실행하되, SELECT 쿼리는 제거하여 성능 향상
      const updatePromises = deliveryData.map((item: any) => {
        const {id, carrier, trackingNumber, orderStatus} = item;
        
        // jsonb_set을 사용하여 SELECT 없이 직접 업데이트
        return sql`
          UPDATE upload_rows ur
          SET row_data = jsonb_set(
            jsonb_set(
              jsonb_set(
                row_data,
                '{택배사}',
                to_jsonb(${carrier}::text)
              ),
              '{운송장번호}',
              to_jsonb(${trackingNumber}::text)
            ),
            '{주문상태}',
            to_jsonb(${orderStatus}::text)
          )
          FROM uploads u
          WHERE ur.upload_id = u.id 
            AND ur.id = ${id}
            AND u.company_id = ${companyId}
        `;
      });

      // 모든 업데이트를 병렬로 실행 (트랜잭션 내에서도 가능)
      await Promise.all(updatePromises);

      await sql`COMMIT`;

      return NextResponse.json({
        success: true,
        message: `${deliveryData.length}건의 운송장 정보가 업데이트되었습니다.`,
      });
    } catch (error) {
      await sql`ROLLBACK`;
      throw error;
    }
  } catch (error: any) {
    console.error("운송장 정보 업데이트 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
