import {NextResponse} from "next/server";
import sql from "@/lib/db";

/**
 * companies 테이블과의 외래키 제약조건 확인
 */
export async function GET() {
  try {
    const tables = ['temp_uploads', 'temp_upload_files', 'upload_templates'];
    const results: any = {};

    for (const tableName of tables) {
      // 테이블 존재 여부 확인
      const tableExists = await sql`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.tables 
          WHERE table_name = ${tableName}
        )
      `;

      if (!tableExists[0].exists) {
        results[tableName] = {
          exists: false,
          hasCompanyId: false,
          hasForeignKey: false
        };
        continue;
      }

      // company_id 컬럼 존재 여부 확인
      const columnExists = await sql`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = ${tableName} 
          AND column_name = 'company_id'
        )
      `;

      // 외래키 제약조건 확인
      const fkExists = await sql`
        SELECT 
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.table_name = ${tableName}
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'company_id'
      `;

      // 인덱스 확인
      const indexExists = await sql`
        SELECT EXISTS (
          SELECT 1 
          FROM pg_indexes 
          WHERE tablename = ${tableName}
          AND indexname = ${`idx_${tableName}_company_id`}
        )
      `;

      // 데이터 개수 확인
      let dataCount: any;
      let nullCount: any;
      
      if (tableName === 'temp_uploads') {
        dataCount = await sql`SELECT COUNT(*) as count FROM temp_uploads`;
        nullCount = await sql`SELECT COUNT(*) as count FROM temp_uploads WHERE company_id IS NULL`;
      } else if (tableName === 'temp_upload_files') {
        dataCount = await sql`SELECT COUNT(*) as count FROM temp_upload_files`;
        nullCount = await sql`SELECT COUNT(*) as count FROM temp_upload_files WHERE company_id IS NULL`;
      } else if (tableName === 'upload_templates') {
        dataCount = await sql`SELECT COUNT(*) as count FROM upload_templates`;
        nullCount = await sql`SELECT COUNT(*) as count FROM upload_templates WHERE company_id IS NULL`;
      }

      results[tableName] = {
        exists: true,
        hasCompanyId: columnExists[0].exists,
        hasForeignKey: fkExists.length > 0,
        foreignKey: fkExists.length > 0 ? {
          constraintName: fkExists[0].constraint_name,
          columnName: fkExists[0].column_name,
          referencesTable: fkExists[0].foreign_table_name,
          referencesColumn: fkExists[0].foreign_column_name
        } : null,
        hasIndex: indexExists[0].exists,
        dataCount: parseInt(dataCount[0].count),
        nullCompanyIdCount: parseInt(nullCount[0].count)
      };
    }

    return NextResponse.json({
      success: true,
      results
    });
  } catch (error: any) {
    console.error("외래키 확인 실패:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        details: error.stack
      },
      {status: 500}
    );
  }
}
