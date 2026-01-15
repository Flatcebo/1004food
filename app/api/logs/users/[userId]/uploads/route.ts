import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

/**
 * GET /api/logs/users/[userId]/uploads
 * 특정 유저가 업로드한 파일 리스트 조회
 */
export async function GET(
  request: NextRequest,
  {params}: {params: Promise<{userId: string}>}
) {
  try {
    const {userId} = await params;
    const userIdNum = parseInt(userId, 10);

    if (isNaN(userIdNum)) {
      return NextResponse.json(
        {success: false, error: "유효하지 않은 사용자 ID입니다."},
        {status: 400}
      );
    }

    // last_login_at 컬럼 존재 여부 확인
    const lastLoginColumnExists = await sql`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'last_login_at'
      )
    `;

    const hasLastLogin = lastLoginColumnExists[0]?.exists || false;

    // 유저 정보 조회 (last_login_at 포함)
    let userQuery;
    if (hasLastLogin) {
      userQuery = sql`
        SELECT 
          u.id,
          u.name,
          u.username,
          TO_CHAR(u.last_login_at, 'YYYY-MM-DD HH24:MI:SS') as "lastLoginAt",
          c.name as "companyName"
        FROM users u
        INNER JOIN companies c ON u.company_id = c.id
        WHERE u.id = ${userIdNum}
      `;
    } else {
      userQuery = sql`
        SELECT 
          u.id,
          u.name,
          u.username,
          NULL as "lastLoginAt",
          c.name as "companyName"
        FROM users u
        INNER JOIN companies c ON u.company_id = c.id
        WHERE u.id = ${userIdNum}
      `;
    }

    const userResult = await userQuery;

    if (userResult.length === 0) {
      return NextResponse.json(
        {success: false, error: "사용자를 찾을 수 없습니다."},
        {status: 404}
      );
    }

    const user = userResult[0];

    // temp_files에서 해당 유저의 업로드 파일 조회
    // user_id 컬럼 존재 여부 확인
    const userIdColumnExists = await sql`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'temp_files' 
        AND column_name = 'user_id'
      )
    `;

    let uploads: any[] = [];
    if (userIdColumnExists[0]?.exists) {
      uploads = await sql`
        SELECT 
          tf.file_id as id,
          tf.file_name as "fileName",
          tf.vendor_name as "vendorName",
          tf.row_count as "rowCount",
          TO_CHAR(tf.created_at, 'YYYY-MM-DD HH24:MI:SS') as "uploadTime",
          tf.table_data as "tableData",
          tf.original_header as "originalHeader"
        FROM temp_files tf
        WHERE tf.user_id = ${userId}
        ORDER BY tf.created_at DESC
      `;
    }

    // uploads 테이블에서 user_id로 조회
    // uploads의 data 필드에 원본 데이터가 저장되어 있음
    const uploadsUserIdColumnExists = await sql`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'uploads' 
        AND column_name = 'user_id'
      )
    `;

    let uploadsFromDb: any[] = [];
    if (uploadsUserIdColumnExists[0]?.exists) {
      // user_id로 직접 조회
      uploadsFromDb = await sql`
        SELECT 
          u.id,
          u.file_name as "fileName",
          u.vendor_name as "vendorName",
          u.row_count as "rowCount",
          TO_CHAR(u.created_at, 'YYYY-MM-DD HH24:MI:SS') as "uploadTime",
          u.data as "originalData"
        FROM uploads u
        WHERE u.user_id = ${userIdNum}
        ORDER BY u.created_at DESC
      `;
    } else {
      // user_id 컬럼이 없으면 temp_files의 file_name과 매칭
      if (userIdColumnExists[0]?.exists && uploads.length > 0) {
        const fileNames = uploads.map((u: any) => u.fileName);
        if (fileNames.length > 0) {
          uploadsFromDb = await sql`
            SELECT 
              u.id,
              u.file_name as "fileName",
              u.vendor_name as "vendorName",
              u.row_count as "rowCount",
              TO_CHAR(u.created_at, 'YYYY-MM-DD HH24:MI:SS') as "uploadTime",
              u.data as "originalData"
            FROM uploads u
            WHERE u.company_id = (SELECT company_id FROM users WHERE id = ${userIdNum})
              AND u.file_name = ANY(${fileNames})
            ORDER BY u.created_at DESC
          `;
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        user,
        uploads: uploads.map((u: any) => ({
          ...u,
          source: "temp_files",
        })),
        uploadsFromDb: uploadsFromDb.map((u: any) => ({
          ...u,
          source: "uploads",
        })),
      },
    });
  } catch (error: any) {
    console.error("업로드 파일 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message || "알 수 없는 오류가 발생했습니다."},
      {status: 500}
    );
  }
}
