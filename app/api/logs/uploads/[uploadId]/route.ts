import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

/**
 * GET /api/logs/uploads/[uploadId]
 * 업로드 상세 정보 조회 (원본 데이터와 저장된 데이터 비교)
 */
export async function GET(
  request: NextRequest,
  {params}: {params: Promise<{uploadId: string}>}
) {
  try {
    const {uploadId} = await params;
    const {searchParams} = new URL(request.url);
    const source = searchParams.get("source") || "uploads"; // "temp_files" or "uploads"

    if (source === "temp_files") {
      // temp_files에서 조회
      const tempFile = await sql`
        SELECT 
          tf.file_id as id,
          tf.file_name as "fileName",
          tf.vendor_name as "vendorName",
          tf.row_count as "rowCount",
          tf.table_data as "tableData",
          tf.original_table_data as "originalTableData",
          tf.original_header as "originalHeader",
          TO_CHAR(tf.created_at, 'YYYY-MM-DD HH24:MI:SS') as "uploadTime"
        FROM temp_files tf
        WHERE tf.file_id = ${uploadId}
      `;

      if (tempFile.length === 0) {
        return NextResponse.json(
          {success: false, error: "파일을 찾을 수 없습니다."},
          {status: 404}
        );
      }

      const file = tempFile[0];
      // original_table_data가 있으면 사용, 없으면 하위 호환성을 위해 table_data 사용
      let originalDataRaw = file.originalTableData && Array.isArray(file.originalTableData) && file.originalTableData.length > 0
        ? file.originalTableData
        : (file.tableData || []);

      // original_table_data가 2차원 배열 형태(헤더 + 데이터 행)인 경우 객체 배열로 변환
      let originalData: any[] = [];
      if (originalDataRaw.length > 0) {
        // 첫 번째 요소가 배열인지 확인 (2차원 배열인 경우)
        if (Array.isArray(originalDataRaw[0])) {
          // 헤더 행 추출
          const headerRow = originalDataRaw[0] as any[];
          // 데이터 행들을 객체로 변환
          originalData = originalDataRaw.slice(1).map((row: any[]) => {
            const rowObj: any = {};
            headerRow.forEach((header: string, index: number) => {
              rowObj[header] = row[index] !== undefined && row[index] !== null ? row[index] : "";
            });
            return rowObj;
          });
        } else {
          // 이미 객체 배열인 경우 그대로 사용
          originalData = originalDataRaw;
        }
      }

      // upload_rows에서 저장된 데이터 조회 (file_name으로 매칭)
      const savedRows = await sql`
        SELECT 
          ur.id,
          ur.row_data as "rowData"
        FROM upload_rows ur
        INNER JOIN uploads u ON ur.upload_id = u.id
        WHERE u.file_name = ${file.fileName}
        ORDER BY ur.id
      `;

      return NextResponse.json({
        success: true,
        data: {
          fileName: file.fileName,
          vendorName: file.vendorName,
          uploadTime: file.uploadTime,
          originalData: originalData,
          savedData: savedRows.map((r: any) => r.rowData),
        },
      });
    } else {
      // uploads에서 조회
      const uploadIdNum = parseInt(uploadId, 10);
      if (isNaN(uploadIdNum)) {
        return NextResponse.json(
          {success: false, error: "유효하지 않은 업로드 ID입니다."},
          {status: 400}
        );
      }

      const upload = await sql`
        SELECT 
          u.id,
          u.file_name as "fileName",
          u.vendor_name as "vendorName",
          u.row_count as "rowCount",
          u.data as "modifiedData",
          u.original_data as "originalData",
          TO_CHAR(u.created_at, 'YYYY-MM-DD HH24:MI:SS') as "uploadTime"
        FROM uploads u
        WHERE u.id = ${uploadIdNum}
      `;

      if (upload.length === 0) {
        return NextResponse.json(
          {success: false, error: "업로드를 찾을 수 없습니다."},
          {status: 404}
        );
      }

      const uploadData = upload[0];
      // original_data가 있으면 사용, 없으면 하위 호환성을 위해 data 사용
      let originalDataRaw = uploadData.originalData && Array.isArray(uploadData.originalData) && uploadData.originalData.length > 0
        ? uploadData.originalData
        : (uploadData.modifiedData || []);

      // original_data가 2차원 배열 형태(헤더 + 데이터 행)인 경우 객체 배열로 변환
      let originalData: any[] = [];
      if (originalDataRaw.length > 0) {
        // 첫 번째 요소가 배열인지 확인 (2차원 배열인 경우)
        if (Array.isArray(originalDataRaw[0])) {
          // 헤더 행 추출
          const headerRow = originalDataRaw[0] as any[];
          // 데이터 행들을 객체로 변환
          originalData = originalDataRaw.slice(1).map((row: any[]) => {
            const rowObj: any = {};
            headerRow.forEach((header: string, index: number) => {
              rowObj[header] = row[index] !== undefined && row[index] !== null ? row[index] : "";
            });
            return rowObj;
          });
        } else {
          // 이미 객체 배열인 경우 그대로 사용
          originalData = originalDataRaw;
        }
      }

      // upload_rows에서 저장된 데이터 조회
      const savedRows = await sql`
        SELECT 
          ur.id,
          ur.row_data as "rowData"
        FROM upload_rows ur
        WHERE ur.upload_id = ${uploadIdNum}
        ORDER BY ur.id
      `;

      return NextResponse.json({
        success: true,
        data: {
          fileName: uploadData.fileName,
          vendorName: uploadData.vendorName,
          uploadTime: uploadData.uploadTime,
          originalData: originalData,
          savedData: savedRows.map((r: any) => r.rowData),
        },
      });
    }
  } catch (error: any) {
    console.error("업로드 상세 조회 실패:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "알 수 없는 오류가 발생했습니다.",
      },
      {status: 500}
    );
  }
}
