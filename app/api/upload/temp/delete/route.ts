import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

export async function DELETE(request: NextRequest) {
  try {
    const {searchParams} = new URL(request.url);
    const sessionId = searchParams.get("sessionId");
    const fileId = searchParams.get("fileId");

    if (!sessionId && !fileId) {
      return NextResponse.json(
        {success: false, error: "sessionId 또는 fileId가 필요합니다."},
        {status: 400}
      );
    }

    if (fileId) {
      // 특정 파일만 삭제
      const result = await sql`
        DELETE FROM temp_upload_files
        WHERE file_id = ${fileId}
        RETURNING id
      `;

      if (result.length === 0) {
        return NextResponse.json(
          {success: false, error: "파일을 찾을 수 없습니다."},
          {status: 404}
        );
      }

      return NextResponse.json({
        success: true,
        message: "파일이 성공적으로 삭제되었습니다.",
      });
    }

    if (sessionId) {
      // 세션의 모든 파일 삭제 (CASCADE로 temp_upload_files도 함께 삭제됨)
      const result = await sql`
        DELETE FROM temp_uploads
        WHERE session_id = ${sessionId}
        RETURNING id
      `;

      if (result.length === 0) {
        return NextResponse.json(
          {success: false, error: "세션을 찾을 수 없습니다."},
          {status: 404}
        );
      }

      return NextResponse.json({
        success: true,
        message: "세션의 모든 파일이 성공적으로 삭제되었습니다.",
      });
    }

    return NextResponse.json(
      {success: false, error: "잘못된 요청입니다."},
      {status: 400}
    );
  } catch (error: any) {
    console.error("임시 파일 삭제 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

