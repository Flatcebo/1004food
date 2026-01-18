// 데이터베이스 제약조건 업데이트 스크립트
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

async function updateGradeConstraint() {
  try {
    console.log("🔄 users 테이블의 grade 제약조건 업데이트 중...");
    
    const response = await fetch(`${BASE_URL}/api/db/update-grade-constraint`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const result = await response.json();

    if (result.success) {
      console.log("✅ 제약조건 업데이트 완료!");
      console.log("📝 메시지:", result.message);
    } else {
      console.error("❌ 제약조건 업데이트 실패:", result.error);
      console.log("\n💡 대안: 데이터베이스에 직접 다음 SQL을 실행하세요:");
      console.log(`
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_grade_check;
ALTER TABLE users ADD CONSTRAINT users_grade_check CHECK (grade IN ('관리자', '직원', '납품업체', '온라인'));
      `);
    }
  } catch (error) {
    console.error("❌ 오류 발생:", error.message);
    console.log("\n💡 서버가 실행 중인지 확인하거나, 데이터베이스에 직접 다음 SQL을 실행하세요:");
    console.log(`
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_grade_check;
ALTER TABLE users ADD CONSTRAINT users_grade_check CHECK (grade IN ('관리자', '직원', '납품업체', '온라인'));
    `);
  }
}

updateGradeConstraint();
