import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest, validateCompanyId} from "@/lib/company";

/**
 * users 테이블에 assigned_vendor_ids 필드 추가 및 grade에 '납품업체' 추가 마이그레이션 스크립트
 *
 * 작업 내용:
 * 1. users 테이블에 assigned_vendor_ids JSON 필드 추가
 * 2. users 테이블의 grade CHECK 제약조건 수정 ('납품업체' 추가)
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

    // 1. users 테이블에 assigned_vendor_ids 필드 추가
    console.log("users 테이블에 assigned_vendor_ids 필드 추가 중...");

    // 컬럼이 이미 존재하는지 확인
    const columnExists = await sql`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'assigned_vendor_ids'
      )
    `;

    if (!columnExists[0].exists) {
      await sql`
        ALTER TABLE users 
        ADD COLUMN assigned_vendor_ids JSONB DEFAULT '[]'::jsonb
      `;
      console.log("assigned_vendor_ids 필드 추가 완료");
    } else {
      console.log("assigned_vendor_ids 필드가 이미 존재합니다.");
    }

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

    // 새로운 제약조건 추가 (납품업체, 온라인 포함)
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
        CHECK (grade IN ('관리자', '직원', '납품업체', '온라인'))
      `;
      console.log("users 테이블의 grade 제약조건 수정 완료");
    } else {
      // 기존 제약조건이 있으면 삭제하고 다시 추가 (온라인 포함)
      await sql.unsafe(`
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_grade_check
      `);
      await sql`
        ALTER TABLE users 
        ADD CONSTRAINT users_grade_check 
        CHECK (grade IN ('관리자', '직원', '납품업체', '온라인'))
      `;
      console.log("users 테이블의 grade 제약조건 업데이트 완료 (온라인 추가)");
    }

    await sql`COMMIT`;

    return NextResponse.json({
      success: true,
      message:
        "users 테이블에 assigned_vendor_ids 필드 추가 및 grade 제약조건 수정이 성공적으로 완료되었습니다.",
    });
  } catch (error: any) {
    await sql`ROLLBACK`;
    console.error("마이그레이션 실패:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "마이그레이션 중 오류가 발생했습니다.",
      },
      {status: 500}
    );
  }
}
