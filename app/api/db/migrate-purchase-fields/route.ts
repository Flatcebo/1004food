import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

/**
 * purchase 테이블에 submit_type, email, kakaotalk 칼럼 추가
 * upload_rows 테이블에 purchase_id FK 추가
 */
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

    await sql`BEGIN`;

    // 1. purchase 테이블에 submit_type 칼럼 추가 (email, kakaotalk 또는 둘 다 가능)
    const submitTypeColumnExists = await sql`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'purchase' 
        AND column_name = 'submit_type'
      )
    `;

    if (!submitTypeColumnExists[0].exists) {
      await sql`
        ALTER TABLE purchase 
        ADD COLUMN submit_type TEXT[] DEFAULT '{}'
      `;
      console.log("purchase 테이블에 submit_type 칼럼 추가 완료");
    }

    // 2. purchase 테이블에 email 칼럼 추가
    const emailColumnExists = await sql`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'purchase' 
        AND column_name = 'email'
      )
    `;

    if (!emailColumnExists[0].exists) {
      await sql`
        ALTER TABLE purchase 
        ADD COLUMN email VARCHAR(255)
      `;
      console.log("purchase 테이블에 email 칼럼 추가 완료");
    }

    // 3. purchase 테이블에 kakaotalk 칼럼 추가
    const kakaotalkColumnExists = await sql`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'purchase' 
        AND column_name = 'kakaotalk'
      )
    `;

    if (!kakaotalkColumnExists[0].exists) {
      await sql`
        ALTER TABLE purchase 
        ADD COLUMN kakaotalk VARCHAR(255)
      `;
      console.log("purchase 테이블에 kakaotalk 칼럼 추가 완료");
    }

    // 4. upload_rows 테이블에 purchase_id FK 추가
    const purchaseIdColumnExists = await sql`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'upload_rows' 
        AND column_name = 'purchase_id'
      )
    `;

    if (!purchaseIdColumnExists[0].exists) {
      await sql`
        ALTER TABLE upload_rows 
        ADD COLUMN purchase_id INTEGER REFERENCES purchase(id) ON DELETE SET NULL
      `;
      
      // 인덱스 생성
      await sql`
        CREATE INDEX IF NOT EXISTS idx_upload_rows_purchase_id 
        ON upload_rows(purchase_id)
      `;
      console.log("upload_rows 테이블에 purchase_id 칼럼 추가 완료");
    }

    // 5. upload_rows 테이블에 is_ordered 칼럼 추가 (발주 여부)
    const isOrderedColumnExists = await sql`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'upload_rows' 
        AND column_name = 'is_ordered'
      )
    `;

    if (!isOrderedColumnExists[0].exists) {
      await sql`
        ALTER TABLE upload_rows 
        ADD COLUMN is_ordered BOOLEAN DEFAULT FALSE
      `;
      
      // 인덱스 생성
      await sql`
        CREATE INDEX IF NOT EXISTS idx_upload_rows_is_ordered 
        ON upload_rows(is_ordered)
      `;
      console.log("upload_rows 테이블에 is_ordered 칼럼 추가 완료");
    }

    await sql`COMMIT`;

    return NextResponse.json({
      success: true,
      message: "마이그레이션이 성공적으로 완료되었습니다.",
      details: {
        submitTypeAdded: !submitTypeColumnExists[0].exists,
        emailAdded: !emailColumnExists[0].exists,
        kakaotalkAdded: !kakaotalkColumnExists[0].exists,
        purchaseIdAdded: !purchaseIdColumnExists[0].exists,
        isOrderedAdded: !isOrderedColumnExists[0].exists,
      },
    });
  } catch (error: any) {
    await sql`ROLLBACK`;
    console.error("마이그레이션 실패:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        details: error.stack,
      },
      {status: 500}
    );
  }
}
