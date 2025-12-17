import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

export async function DELETE(request: NextRequest) {
  try {
    const {searchParams} = new URL(request.url);
    const fileId = searchParams.get("fileId");

    if (!fileId) {
      return NextResponse.json(
        {success: false, error: "fileId가 필요합니다."},
        {status: 400}
      );
    }

    // 특정 파일 삭제
    const result = await sql`
      DELETE FROM temp_files
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
  } catch (error: any) {
    console.error("임시 파일 삭제 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

