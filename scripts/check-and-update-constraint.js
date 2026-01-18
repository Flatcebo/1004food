// 데이터베이스 제약조건 확인 및 업데이트 스크립트
import sql from '../lib/db.js';

async function checkAndUpdateConstraint() {
  try {
    console.log("🔍 현재 제약조건 확인 중...");
    
    // 현재 제약조건 확인
    const constraints = await sql`
      SELECT 
        constraint_name,
        check_clause
      FROM information_schema.check_constraints
      WHERE constraint_name LIKE '%grade%'
        AND constraint_schema = 'public'
    `;
    
    console.log("현재 제약조건:", constraints);
    
    // users 테이블의 grade 제약조건 확인
    const tableConstraints = await sql`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'users'
        AND constraint_type = 'CHECK'
        AND constraint_name LIKE '%grade%'
    `;
    
    console.log("users 테이블의 grade 제약조건:", tableConstraints);
    
    // 모든 grade 관련 제약조건 삭제
    console.log("\n🗑️  기존 제약조건 삭제 중...");
    for (const constraint of tableConstraints) {
      const constraintName = constraint.constraint_name;
      try {
        await sql.unsafe(`ALTER TABLE users DROP CONSTRAINT IF EXISTS "${constraintName}" CASCADE`);
        console.log(`✅ 제약조건 삭제: ${constraintName}`);
      } catch (e) {
        console.log(`⚠️  제약조건 삭제 실패 (이미 없을 수 있음): ${constraintName}`, e.message);
      }
    }
    
    // 새로운 제약조건 추가
    console.log("\n➕ 새로운 제약조건 추가 중...");
    await sql.unsafe(`
      ALTER TABLE users 
      ADD CONSTRAINT users_grade_check 
      CHECK (grade IN ('관리자', '직원', '납품업체', '온라인'))
    `);
    
    console.log("✅ 제약조건 업데이트 완료!");
    
    // 확인
    const newConstraints = await sql`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'users'
        AND constraint_type = 'CHECK'
        AND constraint_name = 'users_grade_check'
    `;
    
    console.log("\n✅ 최종 확인:", newConstraints);
    
    process.exit(0);
  } catch (error) {
    console.error("❌ 오류 발생:", error);
    process.exit(1);
  }
}

checkAndUpdateConstraint();
