import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

// 모든 활성 업로드 세션 목록 조회
export async function GET() {
  try {
    const sessions = await sql`
      SELECT 
        tu.session_id,
        tu.created_at,
        tu.updated_at,
        COUNT(tuf.id) as file_count,
        COUNT(CASE WHEN tuf.is_confirmed = true THEN 1 END) as confirmed_count
      FROM temp_uploads tu
      LEFT JOIN temp_upload_files tuf ON tu.id = tuf.temp_upload_id
      GROUP BY tu.id, tu.session_id, tu.created_at, tu.updated_at
      HAVING COUNT(tuf.id) > 0
      ORDER BY tu.updated_at DESC
    `;

    const formattedSessions = sessions.map((session: any) => ({
      sessionId: session.session_id,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      fileCount: parseInt(session.file_count),
      confirmedCount: parseInt(session.confirmed_count),
      displayName: `세션 ${session.session_id.split('-')[1]} (파일 ${session.file_count}개)`,
    }));

    return NextResponse.json({
      success: true,
      data: formattedSessions,
    });
  } catch (error: any) {
    console.error("세션 목록 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

// 특정 세션 정보 조회
export async function POST(request: NextRequest) {
  try {
    const {sessionId} = await request.json();

    if (!sessionId) {
      return NextResponse.json(
        {success: false, error: "sessionId가 필요합니다."},
        {status: 400}
      );
    }

    // 세션 존재 여부 확인
    const sessionResult = await sql`
      SELECT 
        tu.id,
        tu.session_id,
        tu.created_at,
        tu.updated_at,
        COUNT(tuf.id) as file_count,
        COUNT(CASE WHEN tuf.is_confirmed = true THEN 1 END) as confirmed_count
      FROM temp_uploads tu
      LEFT JOIN temp_upload_files tuf ON tu.id = tuf.temp_upload_id
      WHERE tu.session_id = ${sessionId}
      GROUP BY tu.id, tu.session_id, tu.created_at, tu.updated_at
    `;

    if (sessionResult.length === 0) {
      return NextResponse.json(
        {success: false, error: "세션을 찾을 수 없습니다."},
        {status: 404}
      );
    }

    const session = sessionResult[0];
    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.session_id,
        createdAt: session.created_at,
        updatedAt: session.updated_at,
        fileCount: parseInt(session.file_count),
        confirmedCount: parseInt(session.confirmed_count),
      },
    });
  } catch (error: any) {
    console.error("세션 정보 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
