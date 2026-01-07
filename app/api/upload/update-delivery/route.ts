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
      for (const item of deliveryData) {
        const {id, carrier, trackingNumber, orderStatus} = item;

        // 현재 row_data 가져오기 (company_id 필터링)
        const currentRow = await sql`
          SELECT ur.row_data 
          FROM upload_rows ur
          INNER JOIN uploads u ON ur.upload_id = u.id
          WHERE ur.id = ${id} AND u.company_id = ${companyId}
        `;

        if (currentRow.length === 0) {
          throw new Error(`ID ${id}에 해당하는 데이터를 찾을 수 없습니다.`);
        }

        const currentData = currentRow[0].row_data;

        // row_data 업데이트 (택배사, 운송장번호, 주문상태)
        const updatedData = {
          ...currentData,
          택배사: carrier,
          운송장번호: trackingNumber,
          주문상태: orderStatus,
        };

        await sql`
          UPDATE upload_rows ur
          SET row_data = ${JSON.stringify(updatedData)}
          FROM uploads u
          WHERE ur.upload_id = u.id 
            AND ur.id = ${id}
            AND u.company_id = ${companyId}
        `;
      }

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
