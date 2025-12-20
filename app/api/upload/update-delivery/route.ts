import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
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

        // 현재 row_data 가져오기
        const currentRow = await sql`
          SELECT row_data FROM upload_rows WHERE id = ${id}
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
          UPDATE upload_rows
          SET row_data = ${JSON.stringify(updatedData)}
          WHERE id = ${id}
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
