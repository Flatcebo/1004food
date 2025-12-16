import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {fileName, rowCount, data} = body;

    if (!fileName || !data || !Array.isArray(data)) {
      return NextResponse.json(
        {success: false, error: "필수 데이터가 누락되었습니다."},
        {status: 400}
      );
    }

    // 한국 시간(KST) 생성 - NOW()에 9시간 추가
    const uploadResult = await sql`
      INSERT INTO uploads (file_name, row_count, data, created_at)
      VALUES (${fileName}, ${rowCount}, ${JSON.stringify(
      data
    )}, (NOW() + INTERVAL '9 hours'))
      RETURNING id, created_at
    `;

    const uploadId = uploadResult[0].id;
    const createdAt = uploadResult[0].created_at;

    // 각 행을 개별적으로 저장 (한국 시간)
    const insertPromises = data.map(
      (row: any) =>
        sql`
        INSERT INTO upload_rows (upload_id, row_data, created_at)
        VALUES (${uploadId}, ${JSON.stringify(
          row
        )}, (NOW() + INTERVAL '9 hours'))
        RETURNING id
      `
    );

    const rowResults = await Promise.all(insertPromises);

    return NextResponse.json({
      success: true,
      uploadId,
      createdAt,
      rowIds: rowResults.map((r) => r[0].id),
      message: "데이터가 성공적으로 저장되었습니다.",
    });
  } catch (error: any) {
    console.error("데이터 저장 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
