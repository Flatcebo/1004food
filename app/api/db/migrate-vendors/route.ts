import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import bcrypt from "bcryptjs";
import {getCompanyIdFromRequest, validateCompanyId} from "@/lib/company";

/**
 * vendors 테이블 생성 및 users 테이블의 grade 제약조건 수정 마이그레이션 스크립트
 *
 * 작업 내용:
 * 1. vendors 테이블 생성 (company_id FK, name, template 포함)
 * 2. users 테이블의 grade CHECK 제약조건 수정 (납품업체 제거)
 * 3. 기존 '납품업체' grade를 가진 사용자 데이터 처리
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

    // vendors 테이블은 각 회사별로 독립적인 데이터를 가지므로
    // 로그인한 사용자의 company_id를 사용하여 해당 회사의 vendors 테이블을 설정합니다.

    // 1. vendors 테이블 생성
    console.log("vendors 테이블 생성 중...");

    // 기존 vendors 테이블이 있는지 확인
    const vendorsTableExists = await sql`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_name = 'vendors'
      )
    `;

    if (!vendorsTableExists[0].exists) {
      // 새로 생성
      await sql`
        CREATE TABLE vendors (
          id SERIAL PRIMARY KEY,
          company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          username VARCHAR(255) NOT NULL,
          password VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          template TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(company_id, username)
        )
      `;
    } else {
      // 기존 테이블에 username, password 컬럼 추가 (없는 경우만)
      const usernameExists = await sql`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'vendors' 
          AND column_name = 'username'
        )
      `;

      if (!usernameExists[0].exists) {
        const defaultPassword = await bcrypt.hash("password123", 10);

        await sql`
          ALTER TABLE vendors 
          ADD COLUMN username VARCHAR(255),
          ADD COLUMN password VARCHAR(255)
        `;

        // 기존 데이터에 임시 username과 password 설정
        await sql`
          UPDATE vendors 
          SET username = name || '_' || id::text,
              password = ${defaultPassword}
          WHERE username IS NULL
        `;

        // NOT NULL 제약조건 추가
        await sql`
          ALTER TABLE vendors 
          ALTER COLUMN username SET NOT NULL,
          ALTER COLUMN password SET NOT NULL
        `;

        // UNIQUE 제약조건 수정 (name 대신 username)
        await sql`
          ALTER TABLE vendors 
          DROP CONSTRAINT IF EXISTS vendors_company_id_name_key
        `;

        await sql`
          ALTER TABLE vendors 
          ADD CONSTRAINT vendors_company_id_username_key 
          UNIQUE(company_id, username)
        `;
      }
    }

    // 인덱스 생성
    await sql`
      CREATE INDEX IF NOT EXISTS idx_vendors_company_id 
      ON vendors(company_id)
    `;

    console.log("vendors 테이블 생성 완료");

    // 2. users 테이블의 grade CHECK 제약조건 수정
    console.log("users 테이블의 grade 제약조건 수정 중...");

    // 기존 제약조건 찾기 및 삭제
    const existingConstraints = await sql`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'users'
        AND constraint_type = 'CHECK'
        AND constraint_name LIKE '%grade%'
    `;

    for (const constraint of existingConstraints) {
      const constraintName = constraint.constraint_name;
      await sql.unsafe(`
        ALTER TABLE users DROP CONSTRAINT IF EXISTS "${constraintName}"
      `);
    }

    // 기존 '납품업체' grade를 가진 사용자 확인
    const vendorUsers = await sql`
      SELECT id, name FROM users WHERE grade = '납품업체'
    `;

    // 새로운 제약조건 추가 (납품업체 제외) - 이미 존재하는지 확인
    const constraintExists = await sql`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints
        WHERE table_name = 'users'
          AND constraint_name = 'users_grade_check'
      )
    `;

    if (!constraintExists[0].exists) {
      await sql`
        ALTER TABLE users 
        ADD CONSTRAINT users_grade_check 
        CHECK (grade IN ('관리자', '직원'))
      `;
    }

    console.log("users 테이블의 grade 제약조건 수정 완료");

    // 3. 기존 '납품업체' grade를 가진 사용자 처리
    // 이 사용자들은 vendors 테이블로 마이그레이션할 수 있지만,
    // 사용자가 명시적으로 요청하지 않았으므로 일단 경고만 표시
    if (vendorUsers.length > 0) {
      console.warn(
        `경고: ${vendorUsers.length}명의 '납품업체' grade 사용자가 있습니다. 이들은 수동으로 처리해야 합니다.`
      );
    }

    await sql`COMMIT`;

    return NextResponse.json({
      success: true,
      message:
        "vendors 테이블 생성 및 users 테이블 수정이 성공적으로 완료되었습니다.",
      companyId: companyId,
      vendorUsersCount: vendorUsers.length,
      warning:
        vendorUsers.length > 0
          ? `${vendorUsers.length}명의 '납품업체' grade 사용자가 있습니다. 이들은 수동으로 vendors 테이블로 마이그레이션해야 합니다.`
          : null,
    });
  } catch (error: any) {
    await sql`ROLLBACK`;
    console.error("vendor 마이그레이션 실패:", error);
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
