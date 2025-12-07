import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// 한국 시간(KST, UTC+9)을 반환하는 함수
function getKoreaTime(): Date {
  const now = new Date();
  // UTC 시간에 9시간을 더해서 한국 시간으로 변환
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const koreaTime = new Date(utcTime + (9 * 3600000));
  return koreaTime;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileName, rowCount, data } = body;

    if (!fileName || !data || !Array.isArray(data)) {
      return NextResponse.json(
        { success: false, error: "필수 데이터가 누락되었습니다." },
        { status: 400 }
      );
    }

    // 한국 시간 생성
    const koreaTime = getKoreaTime();

    // 업로드 메타데이터 저장
    const uploadResult = await sql`
      INSERT INTO uploads (file_name, row_count, data, created_at)
      VALUES (${fileName}, ${rowCount}, ${JSON.stringify(data)}, ${koreaTime.toISOString()}::timestamp)
      RETURNING id, created_at
    `;

    const uploadId = uploadResult[0].id;
    const createdAt = uploadResult[0].created_at;

    // 각 행을 개별적으로 저장
    const insertPromises = data.map((row: any) =>
      sql`
        INSERT INTO upload_rows (upload_id, row_data, created_at)
        VALUES (${uploadId}, ${JSON.stringify(row)}, ${koreaTime.toISOString()}::timestamp)
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
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

