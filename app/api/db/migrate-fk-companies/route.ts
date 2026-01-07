import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest, validateCompanyId} from "@/lib/company";

/**
 * companies 테이블과 외래키 연동 마이그레이션 스크립트
 *
 * 대상 테이블:
 * - temp_upload_files
 * - temp_uploads
 * - upload_templates
 *
 * 작업 내용:
 * 1. 각 테이블에 company_id 컬럼 추가 (없는 경우)
 * 2. 외래키 제약조건 추가 (없는 경우)
 * 3. 기존 데이터에 로그인한 사용자의 company_id 할당
 * 4. 인덱스 생성
 */
export async function POST(request: NextRequest) {
  try {
    // 로그인한 사용자의 company_id 가져오기
    const companyId = await getCompanyIdFromRequest(request);

    if (!companyId) {
      return NextResponse.json(
        {
          success: false,
          error: "company_id가 필요합니다. 로그인 후 다시 시도해주세요.",
        },
        {status: 400}
      );
    }

    // company_id 유효성 확인
    const isValidCompany = await validateCompanyId(companyId);
    if (!isValidCompany) {
      return NextResponse.json(
        {
          success: false,
          error: "유효하지 않은 company_id입니다.",
        },
        {status: 400}
      );
    }

    await sql`BEGIN`;

    // companies 테이블이 없으면 생성
    await sql`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // company_id로 회사 정보 확인
    const company = await sql`
      SELECT id FROM companies WHERE id = ${companyId} LIMIT 1
    `;

    if (company.length === 0) {
      await sql`ROLLBACK`;
      return NextResponse.json(
        {
          success: false,
          error: "회사 정보를 찾을 수 없습니다.",
        },
        {status: 404}
      );
    }

    const defaultCompanyId = company[0].id;

    // 1. temp_uploads 테이블 처리
    console.log("temp_uploads 테이블 처리 중...");
    const tempUploadsExists = await sql`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_name = 'temp_uploads'
      )
    `;

    if (tempUploadsExists[0].exists) {
      // company_id 컬럼 존재 여부 확인
      const columnExists = await sql`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'temp_uploads' 
          AND column_name = 'company_id'
        )
      `;

      if (!columnExists[0].exists) {
        // 컬럼 추가 (외래키 포함)
        await sql`
          ALTER TABLE temp_uploads 
          ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE
        `;
        console.log("temp_uploads에 company_id 컬럼 추가됨");
      } else {
        // 컬럼은 있지만 외래키 제약조건 확인
        const fkExists = await sql`
          SELECT EXISTS (
            SELECT 1 
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu 
              ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = 'temp_uploads'
              AND tc.constraint_type = 'FOREIGN KEY'
              AND kcu.column_name = 'company_id'
          )
        `;

        if (!fkExists[0].exists) {
          // 외래키 제약조건 추가
          await sql`
            ALTER TABLE temp_uploads 
            ADD CONSTRAINT temp_uploads_company_id_fkey 
            FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
          `;
          console.log("temp_uploads에 외래키 제약조건 추가됨");
        }
      }

      // 기존 데이터에 기본 company_id 할당
      await sql`
        UPDATE temp_uploads 
        SET company_id = ${defaultCompanyId} 
        WHERE company_id IS NULL
      `;

      // 인덱스 생성
      await sql`
        CREATE INDEX IF NOT EXISTS idx_temp_uploads_company_id 
        ON temp_uploads(company_id)
      `;
    }

    // 2. temp_upload_files 테이블 처리
    console.log("temp_upload_files 테이블 처리 중...");
    const tempUploadFilesExists = await sql`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_name = 'temp_upload_files'
      )
    `;

    if (tempUploadFilesExists[0].exists) {
      // company_id 컬럼 존재 여부 확인
      const columnExists = await sql`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'temp_upload_files' 
          AND column_name = 'company_id'
        )
      `;

      if (!columnExists[0].exists) {
        // 컬럼 추가 (외래키 포함)
        await sql`
          ALTER TABLE temp_upload_files 
          ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE
        `;
        console.log("temp_upload_files에 company_id 컬럼 추가됨");
      } else {
        // 컬럼은 있지만 외래키 제약조건 확인
        const fkExists = await sql`
          SELECT EXISTS (
            SELECT 1 
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu 
              ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = 'temp_upload_files'
              AND tc.constraint_type = 'FOREIGN KEY'
              AND kcu.column_name = 'company_id'
          )
        `;

        if (!fkExists[0].exists) {
          // 외래키 제약조건 추가
          await sql`
            ALTER TABLE temp_upload_files 
            ADD CONSTRAINT temp_upload_files_company_id_fkey 
            FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
          `;
          console.log("temp_upload_files에 외래키 제약조건 추가됨");
        }
      }

      // temp_uploads를 통해 company_id 가져오기 (가능한 경우)
      await sql`
        UPDATE temp_upload_files tuf
        SET company_id = tu.company_id
        FROM temp_uploads tu
        WHERE tuf.temp_upload_id = tu.id
          AND tuf.company_id IS NULL
          AND tu.company_id IS NOT NULL
      `;

      // 나머지 데이터에 기본 company_id 할당
      await sql`
        UPDATE temp_upload_files 
        SET company_id = ${defaultCompanyId} 
        WHERE company_id IS NULL
      `;

      // 인덱스 생성
      await sql`
        CREATE INDEX IF NOT EXISTS idx_temp_upload_files_company_id 
        ON temp_upload_files(company_id)
      `;
    }

    // 3. upload_templates 테이블 처리
    console.log("upload_templates 테이블 처리 중...");
    const uploadTemplatesExists = await sql`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_name = 'upload_templates'
      )
    `;

    if (uploadTemplatesExists[0].exists) {
      // company_id 컬럼 존재 여부 확인
      const columnExists = await sql`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'upload_templates' 
          AND column_name = 'company_id'
        )
      `;

      if (!columnExists[0].exists) {
        // 컬럼 추가 (외래키 포함)
        await sql`
          ALTER TABLE upload_templates 
          ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE
        `;
        console.log("upload_templates에 company_id 컬럼 추가됨");
      } else {
        // 컬럼은 있지만 외래키 제약조건 확인
        const fkExists = await sql`
          SELECT EXISTS (
            SELECT 1 
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu 
              ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = 'upload_templates'
              AND tc.constraint_type = 'FOREIGN KEY'
              AND kcu.column_name = 'company_id'
          )
        `;

        if (!fkExists[0].exists) {
          // 외래키 제약조건 추가
          await sql`
            ALTER TABLE upload_templates 
            ADD CONSTRAINT upload_templates_company_id_fkey 
            FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
          `;
          console.log("upload_templates에 외래키 제약조건 추가됨");
        }
      }

      // 기존 데이터에 기본 company_id 할당
      await sql`
        UPDATE upload_templates 
        SET company_id = ${defaultCompanyId} 
        WHERE company_id IS NULL
      `;

      // 인덱스 생성
      await sql`
        CREATE INDEX IF NOT EXISTS idx_upload_templates_company_id 
        ON upload_templates(company_id)
      `;
    }

    await sql`COMMIT`;

    return NextResponse.json({
      success: true,
      message: "companies 테이블과의 외래키 연동이 성공적으로 완료되었습니다.",
      companyId: defaultCompanyId,
      tables: ["temp_uploads", "temp_upload_files", "upload_templates"],
    });
  } catch (error: any) {
    await sql`ROLLBACK`;
    console.error("외래키 연동 마이그레이션 실패:", error);
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
