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
    const {fileName, rowCount, data, vendorName} = body;

    if (!fileName || !data || !Array.isArray(data)) {
      return NextResponse.json(
        {success: false, error: "필수 데이터가 누락되었습니다."},
        {status: 400}
      );
    }

    // uploads 테이블에 vendor_name 컬럼이 있는지 확인하고 없으면 추가
    try {
      const vendorNameColumnExists = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'uploads' 
        AND column_name = 'vendor_name'
      `;

      if (vendorNameColumnExists.length === 0) {
        await sql`
          ALTER TABLE uploads 
          ADD COLUMN vendor_name VARCHAR(255)
        `;
      }
    } catch (error) {
      console.error("vendor_name 컬럼 확인/추가 실패:", error);
    }

    // upload_rows 테이블에 mall_id 컬럼이 있는지 확인하고 없으면 추가
    try {
      const mallIdColumnExists = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'upload_rows' 
        AND column_name = 'mall_id'
      `;

      if (mallIdColumnExists.length === 0) {
        await sql`
          ALTER TABLE upload_rows 
          ADD COLUMN mall_id INTEGER REFERENCES mall(id) ON DELETE SET NULL
        `;

        // 인덱스 생성
        await sql`
          CREATE INDEX IF NOT EXISTS idx_upload_rows_mall_id ON upload_rows(mall_id)
        `;
      }
    } catch (error) {
      console.error("mall_id 컬럼 확인/추가 실패:", error);
    }

    // 한국 시간(KST) 생성 - NOW()에 9시간 추가 (company_id 포함)
    const uploadResult = await sql`
      INSERT INTO uploads (file_name, row_count, data, company_id, vendor_name, created_at)
      VALUES (${fileName}, ${rowCount}, ${JSON.stringify(
      data
    )}, ${companyId}, ${vendorName || null}, (NOW() + INTERVAL '9 hours'))
      RETURNING id, created_at
    `;

    const uploadId = uploadResult[0].id;
    const createdAt = uploadResult[0].created_at;

    // 업체명으로 mall 테이블에서 해당 mall 찾기
    let mallId: number | null = null;
    if (vendorName) {
      try {
        const trimmedVendorName = vendorName.trim();
        const mallResult = await sql`
          SELECT id FROM mall 
          WHERE name = ${trimmedVendorName}
          LIMIT 1
        `;
        if (mallResult.length > 0) {
          mallId = mallResult[0].id;
        } else {
          console.warn(
            `⚠️ 업체명 "${trimmedVendorName}"에 해당하는 mall을 찾을 수 없습니다.`
          );
        }
      } catch (error) {
        console.error("mall 조회 실패:", error);
      }
    } else {
      console.warn("⚠️ vendorName이 없습니다.");
    }

    // upload_rows 테이블에 vendor_name 컬럼이 있는지 확인하고 없으면 추가
    try {
      const vendorNameColumnExists = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'upload_rows' 
        AND column_name = 'vendor_name'
      `;

      if (vendorNameColumnExists.length === 0) {
        await sql`
          ALTER TABLE upload_rows 
          ADD COLUMN vendor_name VARCHAR(255)
        `;
      }
    } catch (error) {
      console.error("upload_rows vendor_name 컬럼 확인/추가 실패:", error);
    }

    // 각 행을 개별적으로 저장 (한국 시간, company_id 포함)
    const insertPromises = data.map(
      (row: any) =>
        sql`
        INSERT INTO upload_rows (upload_id, company_id, row_data, mall_id, vendor_name, created_at)
        VALUES (${uploadId}, ${companyId}, ${JSON.stringify(row)}, ${mallId}, ${
          vendorName || null
        }, (NOW() + INTERVAL '9 hours'))
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
