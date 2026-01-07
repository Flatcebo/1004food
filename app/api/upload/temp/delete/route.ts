import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest, getUserIdFromRequest} from "@/lib/company";

export async function DELETE(request: NextRequest) {
  try {
    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400}
      );
    }

    // user_id 추출
    const userId = await getUserIdFromRequest(request);

    const {searchParams} = new URL(request.url);
    const fileId = searchParams.get("fileId");

    if (!fileId) {
      return NextResponse.json(
        {success: false, error: "fileId가 필요합니다."},
        {status: 400}
      );
    }

    // user_id 컬럼 존재 여부 확인
    let hasUserIdColumn = false;
    try {
      const columnCheck = await sql`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'temp_files' AND column_name = 'user_id'
      `;
      hasUserIdColumn = columnCheck.length > 0;
    } catch (error) {
      // 테이블이 없거나 다른 에러인 경우 무시
      console.log("컬럼 확인 실패:", error);
    }

    // 특정 파일 삭제 (company_id, user_id 필터링)
    let result;
    if (userId && hasUserIdColumn) {
      result = await sql`
        DELETE FROM temp_files
        WHERE file_id = ${fileId} AND company_id = ${companyId} AND user_id = ${userId}
        RETURNING id
      `;
    } else {
      result = await sql`
        DELETE FROM temp_files
        WHERE file_id = ${fileId} AND company_id = ${companyId}
        RETURNING id
      `;
    }

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
