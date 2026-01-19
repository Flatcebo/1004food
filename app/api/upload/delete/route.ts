import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

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

    const body = await request.json();
    const {rowIds} = body;

    if (!rowIds || !Array.isArray(rowIds) || rowIds.length === 0) {
      return NextResponse.json(
        {success: false, error: "rowIds 배열이 필요합니다."},
        {status: 400}
      );
    }

    // 삭제 전에 삭제될 row들의 upload_id를 먼저 조회
    const rowsToDelete = await sql`
      SELECT ur.id, ur.upload_id
      FROM upload_rows ur
      INNER JOIN uploads u ON ur.upload_id = u.id
      WHERE ur.id = ANY(${rowIds}::int[])
        AND u.company_id = ${companyId}
    `;

    if (rowsToDelete.length === 0) {
      return NextResponse.json(
        {success: false, error: "삭제할 데이터를 찾을 수 없습니다."},
        {status: 404}
      );
    }

    // 트랜잭션 시작
    await sql`BEGIN`;

    try {
      // 선택된 행들을 삭제 (company_id 필터링)
      const result = await sql`
        DELETE FROM upload_rows ur
        USING uploads u
        WHERE ur.upload_id = u.id 
          AND ur.id = ANY(${rowIds}::int[])
          AND u.company_id = ${companyId}
        RETURNING ur.id, ur.upload_id
      `;

      // 삭제된 row들의 upload_id 목록 추출
      const affectedUploadIds = [
        ...new Set(result.map((r: any) => r.upload_id)),
      ];

      // 각 upload_id에 대해 남은 row 개수 확인하고, 0개면 uploads도 삭제
      const deletedUploadIds: number[] = [];
      for (const uploadId of affectedUploadIds) {
        const remainingRows = await sql`
          SELECT COUNT(*)::int as count
          FROM upload_rows
          WHERE upload_id = ${uploadId}
        `;

        // COUNT 결과를 숫자로 변환하여 비교 (문자열일 수 있으므로)
        const remainingCount = Number(remainingRows[0]?.count || 0);

        if (remainingCount === 0) {
          // 남은 row가 없으면 해당 uploads 레코드도 삭제
          await sql`
            DELETE FROM uploads
            WHERE id = ${uploadId}
              AND company_id = ${companyId}
          `;
          deletedUploadIds.push(uploadId);
        }
      }

      // 트랜잭션 커밋
      await sql`COMMIT`;

      const responseMessage =
        deletedUploadIds.length > 0
          ? `${result.length}개의 데이터가 성공적으로 삭제되었습니다. (발주서 ${deletedUploadIds.length}개도 함께 삭제됨)`
          : `${result.length}개의 데이터가 성공적으로 삭제되었습니다.`;

      return NextResponse.json({
        success: true,
        message: responseMessage,
        deletedCount: result.length,
        deletedIds: result.map((r: any) => r.id),
        deletedUploadIds,
      });
    } catch (transactionError: any) {
      // 트랜잭션 롤백
      await sql`ROLLBACK`;
      throw transactionError;
    }
  } catch (error: any) {
    console.error("데이터 삭제 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
