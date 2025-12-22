import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

// 세션 목록 조회
export async function GET(request: NextRequest) {
  try {
    const {searchParams} = new URL(request.url);
    const userId = searchParams.get('userId');

    let sessions;
    try {
      if (userId) {
        // 특정 사용자의 세션만 조회
        sessions = await sql`
          SELECT
            session_id as "sessionId",
            session_name as "sessionName",
            created_at as "createdAt",
            updated_at as "updatedAt",
            COALESCE(user_id, null) as "userId"
          FROM upload_sessions
          WHERE COALESCE(user_id, '') = ${userId} OR user_id IS NULL
          ORDER BY updated_at DESC
        `;
      } else {
        // 모든 세션 조회 (기본 동작)
        sessions = await sql`
          SELECT
            session_id as "sessionId",
            session_name as "sessionName",
            created_at as "createdAt",
            updated_at as "updatedAt",
            COALESCE(user_id, null) as "userId"
          FROM upload_sessions
          ORDER BY updated_at DESC
        `;
      }
    } catch (error: any) {
      // user_id 컬럼이 없으면 user_id 없이 조회
      if (error.message && error.message.includes('column "user_id" does not exist')) {
        console.warn('user_id 컬럼이 없어 기본 조회로 전환');
        sessions = await sql`
          SELECT
            session_id as "sessionId",
            session_name as "sessionName",
            created_at as "createdAt",
            updated_at as "updatedAt"
          FROM upload_sessions
          ORDER BY updated_at DESC
        `;
      } else {
        throw error;
      }
    }

    return NextResponse.json({
      success: true,
      data: sessions,
    });
  } catch (error: any) {
    console.error("세션 목록 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

// 새 세션 생성
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {sessionName, userId} = body;

    if (!sessionName) {
      return NextResponse.json(
        {success: false, error: "세션 이름이 필요합니다."},
        {status: 400}
      );
    }

    // 세션 ID 생성 (고유한 값)
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      const result = await sql`
        INSERT INTO upload_sessions (session_id, session_name, user_id)
        VALUES (${sessionId}, ${sessionName}, ${userId || null})
        RETURNING session_id as "sessionId", session_name as "sessionName", COALESCE(user_id, null) as "userId"
      `;

      return NextResponse.json({
        success: true,
        data: result[0],
      });
    } catch (error: any) {
      // user_id 컬럼이 없으면 user_id 없이 저장
      if (error.message && error.message.includes('column "user_id" does not exist')) {
        console.warn('user_id 컬럼이 없어 기본 저장으로 전환');
        const result = await sql`
          INSERT INTO upload_sessions (session_id, session_name)
          VALUES (${sessionId}, ${sessionName})
          RETURNING session_id as "sessionId", session_name as "sessionName"
        `;

        return NextResponse.json({
          success: true,
          data: { ...result[0], userId: null },
        });
      } else {
        throw error;
      }
    }
  } catch (error: any) {
    console.error("세션 생성 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

// 세션 삭제
export async function DELETE(request: NextRequest) {
  try {
    const {searchParams} = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        {success: false, error: "세션 ID가 필요합니다."},
        {status: 400}
      );
    }

    // 세션 삭제
    await sql`
      DELETE FROM upload_sessions WHERE session_id = ${sessionId}
    `;

    // 해당 세션의 모든 파일도 삭제
    await sql`
      DELETE FROM temp_files WHERE session_id = ${sessionId}
    `;

    return NextResponse.json({
      success: true,
      message: "세션이 성공적으로 삭제되었습니다.",
    });
  } catch (error: any) {
    console.error("세션 삭제 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
