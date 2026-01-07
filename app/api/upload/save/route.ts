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

    const body = await request.json();
    const {fileName, rowCount, data} = body;

    if (!fileName || !data || !Array.isArray(data)) {
      return NextResponse.json(
        {success: false, error: "필수 데이터가 누락되었습니다."},
        {status: 400}
      );
    }

    // 한국 시간(KST) 생성 - NOW()에 9시간 추가 (company_id 포함)
    const uploadResult = await sql`
      INSERT INTO uploads (file_name, row_count, data, company_id, created_at)
      VALUES (${fileName}, ${rowCount}, ${JSON.stringify(
      data
    )}, ${companyId}, (NOW() + INTERVAL '9 hours'))
      RETURNING id, created_at
    `;

    const uploadId = uploadResult[0].id;
    const createdAt = uploadResult[0].created_at;

    // 각 행을 개별적으로 저장 (한국 시간, company_id 포함)
    const insertPromises = data.map(
      (row: any) =>
        sql`
        INSERT INTO upload_rows (upload_id, company_id, row_data, created_at)
        VALUES (${uploadId}, ${companyId}, ${JSON.stringify(
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
