import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

/**
 * users 테이블에 last_login_at 필드 추가 마이그레이션 스크립트
 *
 * 작업 내용:
 * 1. users 테이블에 last_login_at TIMESTAMP 필드 추가
 */
export async function POST(request: NextRequest) {
  try {
    await sql`BEGIN`;

    // 1. users 테이블에 last_login_at 필드 추가
    console.log("users 테이블에 last_login_at 필드 추가 중...");

    // 컬럼이 이미 존재하는지 확인
    const columnExists = await sql`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'last_login_at'
      )
    `;

    if (!columnExists[0].exists) {
      await sql`
        ALTER TABLE users 
        ADD COLUMN last_login_at TIMESTAMP
      `;
      console.log("last_login_at 필드 추가 완료");
    } else {
      console.log("last_login_at 필드가 이미 존재합니다.");
    }

    await sql`COMMIT`;

    return NextResponse.json({
      success: true,
      message: "users 테이블에 last_login_at 필드 추가가 성공적으로 완료되었습니다.",
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
