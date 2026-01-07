import {NextResponse} from "next/server";
import sql from "@/lib/db";

/**
 * 멀티테넌트 마이그레이션 스크립트
 * 
 * 1. companies 테이블 생성
 * 2. users 테이블 생성 (company_id FK, grade 포함)
 * 3. 모든 기존 테이블에 company_id FK 추가
 * 4. 기존 데이터를 기본 company에 할당
 */
export async function POST() {
  try {
    await sql`BEGIN`;

    // 1. companies 테이블 생성
    await sql`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 2. users 테이블 생성 (company_id FK, grade 포함)
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        username VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        grade VARCHAR(50) NOT NULL CHECK (grade IN ('관리자', '직원')),
        position VARCHAR(100),
        role VARCHAR(100),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id, username)
      )
    `;

    // 3. 기존 테이블들에 company_id 컬럼 추가 (없는 경우만)
    const tables = [
      'uploads',
      'upload_rows',
      'products',
      'purchase',
      'temp_files',
      'upload_sessions',
      'header_aliases',
      'temp_uploads',
      'temp_upload_files',
      'upload_templates'
    ];

    // upload_rows는 uploads를 통해 company_id를 상속받지만, 직접 FK를 가지는 것이 더 안전
    // upload_rows의 company_id는 uploads의 company_id와 동기화되어야 함

    // 각 테이블에 대해 개별적으로 처리
    const addCompanyIdColumn = async (tableName: string) => {
      // 테이블 존재 여부 확인
      const tableExists = await sql`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.tables 
          WHERE table_name = ${tableName}
        )
      `;

      if (!tableExists[0].exists) {
        console.log(`테이블 ${tableName}이 존재하지 않아 건너뜁니다.`);
        return;
      }

      const columnExists = await sql`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = ${tableName} 
          AND column_name = 'company_id'
        )
      `;

      if (!columnExists[0].exists) {
        // 각 테이블별로 개별 쿼리 실행
        switch (tableName) {
          case 'uploads':
            await sql`ALTER TABLE uploads ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE`;
            await sql`CREATE INDEX IF NOT EXISTS idx_uploads_company_id ON uploads(company_id)`;
            break;
          case 'upload_rows':
            await sql`ALTER TABLE upload_rows ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE`;
            await sql`CREATE INDEX IF NOT EXISTS idx_upload_rows_company_id ON upload_rows(company_id)`;
            break;
          case 'products':
            await sql`ALTER TABLE products ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE`;
            await sql`CREATE INDEX IF NOT EXISTS idx_products_company_id ON products(company_id)`;
            break;
          case 'purchase':
            await sql`ALTER TABLE purchase ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE`;
            await sql`CREATE INDEX IF NOT EXISTS idx_purchase_company_id ON purchase(company_id)`;
            break;
          case 'temp_files':
            await sql`ALTER TABLE temp_files ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE`;
            await sql`CREATE INDEX IF NOT EXISTS idx_temp_files_company_id ON temp_files(company_id)`;
            break;
          case 'upload_sessions':
            await sql`ALTER TABLE upload_sessions ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE`;
            await sql`CREATE INDEX IF NOT EXISTS idx_upload_sessions_company_id ON upload_sessions(company_id)`;
            break;
          case 'header_aliases':
            await sql`ALTER TABLE header_aliases ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE`;
            await sql`CREATE INDEX IF NOT EXISTS idx_header_aliases_company_id ON header_aliases(company_id)`;
            break;
          case 'temp_uploads':
            await sql`ALTER TABLE temp_uploads ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE`;
            await sql`CREATE INDEX IF NOT EXISTS idx_temp_uploads_company_id ON temp_uploads(company_id)`;
            break;
          case 'temp_upload_files':
            await sql`ALTER TABLE temp_upload_files ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE`;
            await sql`CREATE INDEX IF NOT EXISTS idx_temp_upload_files_company_id ON temp_upload_files(company_id)`;
            break;
          case 'upload_templates':
            await sql`ALTER TABLE upload_templates ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE`;
            await sql`CREATE INDEX IF NOT EXISTS idx_upload_templates_company_id ON upload_templates(company_id)`;
            break;
        }
      }
    };

    for (const tableName of tables) {
      await addCompanyIdColumn(tableName);
    }

    // 4. 기본 company 생성 (이미 존재하면 스킵)
    let defaultCompany;
    const existingCompany = await sql`
      SELECT id FROM companies WHERE name = '기본 회사' LIMIT 1
    `;

    if (existingCompany.length === 0) {
      const result = await sql`
        INSERT INTO companies (name) 
        VALUES ('기본 회사') 
        RETURNING id
      `;
      defaultCompany = result[0];
    } else {
      defaultCompany = existingCompany[0];
    }

    const defaultCompanyId = defaultCompany.id;

    // 5. 기존 데이터에 기본 company_id 할당 (NULL인 경우만)
    // uploads 먼저 업데이트
    await sql`UPDATE uploads SET company_id = ${defaultCompanyId} WHERE company_id IS NULL`;
    
    // upload_rows는 uploads를 통해 company_id를 가져옴
    await sql`
      UPDATE upload_rows ur
      SET company_id = u.company_id
      FROM uploads u
      WHERE ur.upload_id = u.id
      AND ur.company_id IS NULL
    `;
    // uploads에 company_id가 없는 경우 기본값 할당
    await sql`
      UPDATE upload_rows
      SET company_id = ${defaultCompanyId}
      WHERE company_id IS NULL
    `;
    
    // 나머지 테이블들 업데이트
    await sql`UPDATE products SET company_id = ${defaultCompanyId} WHERE company_id IS NULL`;
    await sql`UPDATE purchase SET company_id = ${defaultCompanyId} WHERE company_id IS NULL`;
    await sql`UPDATE temp_files SET company_id = ${defaultCompanyId} WHERE company_id IS NULL`;
    await sql`UPDATE upload_sessions SET company_id = ${defaultCompanyId} WHERE company_id IS NULL`;
    await sql`UPDATE header_aliases SET company_id = ${defaultCompanyId} WHERE company_id IS NULL`;
    await sql`UPDATE temp_uploads SET company_id = ${defaultCompanyId} WHERE company_id IS NULL`;
    // temp_upload_files는 temp_uploads를 통해 company_id를 가져올 수 있음
    await sql`
      UPDATE temp_upload_files tuf
      SET company_id = tu.company_id
      FROM temp_uploads tu
      WHERE tuf.temp_upload_id = tu.id
      AND tuf.company_id IS NULL
    `;
    await sql`UPDATE temp_upload_files SET company_id = ${defaultCompanyId} WHERE company_id IS NULL`;
    await sql`UPDATE upload_templates SET company_id = ${defaultCompanyId} WHERE company_id IS NULL`;

    // 6. company_id를 NOT NULL로 변경 (데이터가 모두 채워진 후)
    const setNotNull = async (tableName: string) => {
      try {
        switch (tableName) {
          case 'uploads':
            await sql`ALTER TABLE uploads ALTER COLUMN company_id SET NOT NULL`;
            break;
          case 'upload_rows':
            await sql`ALTER TABLE upload_rows ALTER COLUMN company_id SET NOT NULL`;
            break;
          case 'products':
            await sql`ALTER TABLE products ALTER COLUMN company_id SET NOT NULL`;
            break;
          case 'purchase':
            await sql`ALTER TABLE purchase ALTER COLUMN company_id SET NOT NULL`;
            break;
          case 'temp_files':
            await sql`ALTER TABLE temp_files ALTER COLUMN company_id SET NOT NULL`;
            break;
          case 'upload_sessions':
            await sql`ALTER TABLE upload_sessions ALTER COLUMN company_id SET NOT NULL`;
            break;
          case 'header_aliases':
            await sql`ALTER TABLE header_aliases ALTER COLUMN company_id SET NOT NULL`;
            break;
          case 'temp_uploads':
            await sql`ALTER TABLE temp_uploads ALTER COLUMN company_id SET NOT NULL`;
            break;
          case 'temp_upload_files':
            await sql`ALTER TABLE temp_upload_files ALTER COLUMN company_id SET NOT NULL`;
            break;
          case 'upload_templates':
            await sql`ALTER TABLE upload_templates ALTER COLUMN company_id SET NOT NULL`;
            break;
        }
      } catch (error: any) {
        // 이미 NOT NULL이거나 다른 이유로 실패할 수 있음
        console.log(`company_id NOT NULL 설정 실패 (${tableName}):`, error.message);
      }
    };

    for (const tableName of tables) {
      await setNotNull(tableName);
    }

    // 7. UNIQUE 제약조건 업데이트 (company_id 포함)
    // products 테이블의 UNIQUE 제약조건 업데이트
    try {
      // 기존 제약조건 확인 및 삭제
      const constraints = await sql`
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'products' 
        AND constraint_type = 'UNIQUE'
        AND constraint_name != 'products_pkey'
      `;

      for (const constraint of constraints) {
        await sql`
          ALTER TABLE products 
          DROP CONSTRAINT IF EXISTS ${sql(constraint.constraint_name)}
        `;
      }

      // 새로운 UNIQUE 제약조건 추가 (company_id 포함)
      await sql`
        ALTER TABLE products 
        ADD CONSTRAINT products_company_name_code_post_type_key 
        UNIQUE (company_id, name, code, post_type)
      `;
    } catch (error: any) {
      console.log("products UNIQUE 제약조건 업데이트:", error.message);
    }

    // purchase 테이블의 UNIQUE 제약조건 업데이트
    try {
      await sql`
        ALTER TABLE purchase 
        DROP CONSTRAINT IF EXISTS purchase_name_key
      `;
      await sql`
        ALTER TABLE purchase 
        ADD CONSTRAINT purchase_company_name_key 
        UNIQUE (company_id, name)
      `;
    } catch (error: any) {
      console.log("purchase UNIQUE 제약조건 업데이트:", error.message);
    }

    // header_aliases 테이블의 UNIQUE 제약조건 업데이트
    try {
      await sql`
        ALTER TABLE header_aliases 
        DROP CONSTRAINT IF EXISTS header_aliases_column_key_key
      `;
      await sql`
        ALTER TABLE header_aliases 
        ADD CONSTRAINT header_aliases_company_column_key_key 
        UNIQUE (company_id, column_key)
      `;
    } catch (error: any) {
      console.log("header_aliases UNIQUE 제약조건 업데이트:", error.message);
    }

    await sql`COMMIT`;

    return NextResponse.json({
      success: true,
      message: "멀티테넌트 마이그레이션이 성공적으로 완료되었습니다.",
      defaultCompanyId,
    });
  } catch (error: any) {
    await sql`ROLLBACK`;
    console.error("멀티테넌트 마이그레이션 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
