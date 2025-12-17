import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function POST() {
  try {
    // upload_rows 테이블에 shop_name 컬럼이 있는지 확인
    const columnExists = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'upload_rows' 
      AND column_name = 'shop_name'
    `;

    if (columnExists.length === 0) {
      // shop_name 컬럼 추가
      await sql`
        ALTER TABLE upload_rows 
        ADD COLUMN shop_name VARCHAR(255)
      `;
      console.log("✅ upload_rows 테이블에 shop_name 컬럼 추가 완료");
    } else {
      console.log("ℹ️ upload_rows 테이블에 shop_name 컬럼이 이미 존재합니다");
    }

    // 기존 데이터에서 쇼핑몰명 추출하여 업데이트
    const existingRows = await sql`
      SELECT id, row_data 
      FROM upload_rows 
      WHERE shop_name IS NULL OR shop_name = ''
    `;

    let updatedCount = 0;
    for (const row of existingRows) {
      const rowData = row.row_data;
      const shopName = rowData?.["쇼핑몰명"] || rowData?.["쇼핑몰명(1)"] || "";
      
      if (shopName) {
        await sql`
          UPDATE upload_rows 
          SET shop_name = ${shopName}
          WHERE id = ${row.id}
        `;
        updatedCount++;
      }
    }

    // 인덱스 생성 (검색 성능 향상)
    await sql`
      CREATE INDEX IF NOT EXISTS idx_upload_rows_shop_name ON upload_rows(shop_name)
    `;

    return NextResponse.json({
      success: true,
      message: `쇼핑몰명 컬럼이 성공적으로 추가되었습니다. ${updatedCount}개 행 업데이트됨.`,
      updatedCount,
    });
  } catch (error: any) {
    console.error("쇼핑몰명 컬럼 추가 실패:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
