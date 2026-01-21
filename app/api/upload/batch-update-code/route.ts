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
    const {rowIds, codeData} = body;

    if (!rowIds || !Array.isArray(rowIds) || rowIds.length === 0) {
      return NextResponse.json(
        {success: false, error: "rowIds 배열이 필요합니다."},
        {status: 400}
      );
    }

    if (!codeData) {
      return NextResponse.json(
        {success: false, error: "codeData가 필요합니다."},
        {status: 400}
      );
    }

    // 트랜잭션 시작
    await sql`BEGIN`;

    try {
      let updatedCount = 0;

      // 각 행에 대해 매핑코드 및 관련 데이터 업데이트
      for (const rowId of rowIds) {
        // 기존 row_data 조회 (company_id 필터링)
        const existingRow = await sql`
          SELECT ur.row_data
          FROM upload_rows ur
          INNER JOIN uploads u ON ur.upload_id = u.id
          WHERE ur.id = ${rowId} AND u.company_id = ${companyId}
        `;

        if (existingRow.length === 0) {
          continue; // 해당 행을 찾을 수 없으면 스킵
        }

        const currentRowData = existingRow[0].row_data;
        const currentProductName = currentRowData?.상품명 || "";

        // 기존 row_data를 복사하고 선택한 매핑코드의 모든 필드를 업데이트
        // 단, 상품명은 기존 것을 유지
        const updatedRowData: any = {
          ...currentRowData,
          매핑코드: codeData.code,
          내외주: codeData.type,
          택배사: codeData.postType,
          합포수량: codeData.pkg,
          가격: codeData.price,
          택배비: codeData.postFee,
          기타: codeData.etc || "",
          상품명: currentProductName, // 기존 상품명 유지
        };

        // 선택한 상품 ID가 있으면 저장
        if (codeData.productId) {
          updatedRowData.productId = codeData.productId;
        }

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

        if (result.length > 0) {
          updatedCount++;
        }
      }

      await sql`COMMIT`;

      return NextResponse.json({
        success: true,
        updatedCount,
      });
    } catch (error) {
      await sql`ROLLBACK`;
      throw error;
    }
  } catch (error: any) {
    console.error("일괄 매핑코드 업데이트 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
