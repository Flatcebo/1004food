import {NextResponse} from "next/server";
import sql from "@/lib/db";
import bcrypt from "bcryptjs";

/**
 * POST /api/users/seed
 * 기본 사용자 생성 (개발/테스트용)
 * 
 * 기본 회사에 관리자, 직원 계정을 생성합니다.
 */
export async function POST() {
  try {
    // 기본 회사 조회
    const companies = await sql`
      SELECT id FROM companies WHERE name = '기본 회사' LIMIT 1
    `;

    if (companies.length === 0) {
      return NextResponse.json(
        {success: false, error: "기본 회사를 찾을 수 없습니다. 먼저 마이그레이션을 실행해주세요."},
        {status: 404}
      );
    }

    const companyId = companies[0].id;

    // 기본 비밀번호 해싱 (모두 "password123")
    const defaultPassword = await bcrypt.hash("password123", 10);

    // 기본 사용자들 생성
    const defaultUsers = [
      {
        username: "admin",
        password: defaultPassword,
        name: "관리자",
        grade: "관리자" as const,
        position: "관리자",
        role: "시스템 관리자",
      },
      {
        username: "employee",
        password: defaultPassword,
        name: "직원",
        grade: "직원" as const,
        position: "사원",
        role: "일반 사용자",
      },
    ];

    const createdUsers = [];

    for (const user of defaultUsers) {
      try {
        // 이미 존재하는지 확인
        const existing = await sql`
          SELECT id FROM users 
          WHERE company_id = ${companyId} AND username = ${user.username}
        `;

        if (existing.length > 0) {
          console.log(`사용자 ${user.username}는 이미 존재합니다.`);
          continue;
        }

        const result = await sql`
          INSERT INTO users (
            company_id, username, password, name, grade, position, role
          )
          VALUES (
            ${companyId},
            ${user.username},
            ${user.password},
            ${user.name},
            ${user.grade},
            ${user.position},
            ${user.role}
          )
          RETURNING 
            id,
            username,
            name,
            grade,
            position,
            role
        `;

        createdUsers.push(result[0]);
      } catch (error: any) {
        console.error(`사용자 ${user.username} 생성 실패:`, error.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: `${createdUsers.length}명의 기본 사용자가 생성되었습니다.`,
      data: createdUsers,
      defaultPassword: "password123", // 개발용으로만 노출
    });
  } catch (error: any) {
    console.error("기본 사용자 생성 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
