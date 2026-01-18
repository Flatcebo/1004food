import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

/**
 * users 테이블의 grade CHECK 제약조건 확인
 */
export async function GET(request: NextRequest) {
  try {
    // 현재 제약조건 확인
    const constraints = await sql`
      SELECT 
        tc.constraint_name,
        cc.check_clause
      FROM information_schema.table_constraints tc
      JOIN information_schema.check_constraints cc 
        ON tc.constraint_name = cc.constraint_name
      WHERE tc.table_name = 'users'
        AND tc.constraint_type = 'CHECK'
        AND tc.constraint_name LIKE '%grade%'
    `;

    // 제약조건 정의 확인
    const constraintDef = await sql`
      SELECT 
        conname as constraint_name,
        pg_get_constraintdef(oid) as constraint_definition
      FROM pg_constraint
      WHERE conrelid = 'users'::regclass
        AND contype = 'c'
        AND conname LIKE '%grade%'
    `;

    return NextResponse.json({
      success: true,
      data: {
        constraints: constraints,
        constraintDefinitions: constraintDef,
        message: constraints.length > 0 
          ? `현재 ${constraints.length}개의 grade 제약조건이 있습니다.`
          : "grade 제약조건이 없습니다."
      },
    });
  } catch (error: any) {
    console.error("제약조건 확인 실패:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "제약조건 확인 중 오류가 발생했습니다.",
      },
      {status: 500}
    );
  }
}
