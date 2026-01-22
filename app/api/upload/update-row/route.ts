import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

export async function PUT(request: NextRequest) {
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
    const {rowId, rowData} = body;

    if (!rowId || !rowData) {
      return NextResponse.json(
        {success: false, error: "rowId와 rowData가 필요합니다."},
        {status: 400}
      );
    }

    // 기존 row_data 조회 (company_id 필터링)
    const existingRow = await sql`
      SELECT ur.row_data
      FROM upload_rows ur
      INNER JOIN uploads u ON ur.upload_id = u.id
      WHERE ur.id = ${rowId} AND u.company_id = ${companyId}
    `;

    if (existingRow.length === 0) {
      return NextResponse.json(
        {success: false, error: "해당 행을 찾을 수 없습니다."},
        {status: 404}
      );
    }

    const currentRowData = existingRow[0].row_data;

    // 기존 row_data를 복사하고 업데이트할 필드만 변경
    const updatedRowData: any = {
      ...currentRowData,
      ...rowData,
    };

    // row_data 업데이트
    const result = await sql`
      UPDATE upload_rows ur
      SET row_data = ${JSON.stringify(updatedRowData)}::jsonb
      FROM uploads u
      WHERE ur.upload_id = u.id 
        AND ur.id = ${rowId}
        AND u.company_id = ${companyId}
      RETURNING ur.id
    `;

    if (result.length === 0) {
      return NextResponse.json(
        {success: false, error: "업데이트 실패"},
        {status: 500}
      );
    }

    return NextResponse.json({
      success: true,
      data: result[0],
    });
  } catch (error: any) {
    console.error("행 데이터 업데이트 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
