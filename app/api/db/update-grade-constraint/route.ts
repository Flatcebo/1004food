import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

/**
 * users 테이블의 grade CHECK 제약조건에 '온라인' 추가
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

    await sql`BEGIN`;

    // 1단계: 모든 grade 관련 제약조건 찾기
    const existingConstraints = await sql`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'users'
        AND constraint_type = 'CHECK'
        AND constraint_name LIKE '%grade%'
    `;

    console.log("발견된 제약조건:", existingConstraints);

    // 2단계: 모든 grade 관련 제약조건 삭제 (여러 번 시도)
    for (const constraint of existingConstraints) {
      const constraintName = constraint.constraint_name;
      try {
        // CASCADE 없이 시도
        await sql.unsafe(`ALTER TABLE users DROP CONSTRAINT "${constraintName}"`);
        console.log(`제약조건 삭제 성공: ${constraintName}`);
      } catch (e1) {
        try {
          // CASCADE와 함께 시도
          await sql.unsafe(`ALTER TABLE users DROP CONSTRAINT "${constraintName}" CASCADE`);
          console.log(`제약조건 삭제 성공 (CASCADE): ${constraintName}`);
        } catch (e2) {
          // IF EXISTS와 함께 시도
          try {
            await sql.unsafe(`ALTER TABLE users DROP CONSTRAINT IF EXISTS "${constraintName}"`);
            console.log(`제약조건 삭제 시도 (IF EXISTS): ${constraintName}`);
          } catch (e3) {
            console.log(`제약조건 삭제 실패: ${constraintName}`, e3.message);
          }
        }
      }
    }

    // 3단계: users_grade_check가 여전히 있는지 확인하고 강제 삭제
    const checkExists = await sql`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints
        WHERE table_name = 'users'
          AND constraint_name = 'users_grade_check'
      )
    `;

    if (checkExists[0].exists) {
      try {
        await sql.unsafe(`ALTER TABLE users DROP CONSTRAINT users_grade_check`);
        console.log("users_grade_check 제약조건 삭제 완료");
      } catch (e) {
        try {
          await sql.unsafe(`ALTER TABLE users DROP CONSTRAINT users_grade_check CASCADE`);
          console.log("users_grade_check 제약조건 삭제 완료 (CASCADE)");
        } catch (e2) {
          console.log("users_grade_check 제약조건 삭제 실패, 계속 진행:", e2.message);
        }
      }
    }

    // 4단계: 새로운 제약조건 추가 (온라인 포함)
    try {
      await sql.unsafe(`
        ALTER TABLE users 
        ADD CONSTRAINT users_grade_check 
        CHECK (grade IN ('관리자', '직원', '납품업체', '온라인'))
      `);
      console.log("새로운 제약조건 추가 완료");
    } catch (e) {
      // 제약조건이 이미 존재하는 경우, 삭제 후 다시 추가
      console.log("제약조건 추가 실패, 재시도:", e.message);
      await sql.unsafe(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_grade_check CASCADE`);
      await sql.unsafe(`
        ALTER TABLE users 
        ADD CONSTRAINT users_grade_check 
        CHECK (grade IN ('관리자', '직원', '납품업체', '온라인'))
      `);
      console.log("제약조건 재추가 완료");
    }

    // 트랜잭션 없이 실행했으므로 COMMIT 불필요

    return NextResponse.json({
      success: true,
      message: "users 테이블의 grade 제약조건이 성공적으로 업데이트되었습니다. (온라인 추가)",
    });
  } catch (error: any) {
    console.error("제약조건 업데이트 실패:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "제약조건 업데이트 중 오류가 발생했습니다.",
      },
      {status: 500}
    );
  }
}
