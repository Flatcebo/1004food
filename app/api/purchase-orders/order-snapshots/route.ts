import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

/**
 * 매입처별 발주서 스냅샷 목록 조회 API
 * GET: purchaseId로 n차별 발주 내역 (다운로드/이메일/카카오톡 구분)
 */
export async function GET(request: NextRequest) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400},
      );
    }

    const {searchParams} = new URL(request.url);
    const purchaseId = searchParams.get("purchaseId");

    if (!purchaseId) {
      return NextResponse.json(
        {success: false, error: "purchaseId가 필요합니다."},
        {status: 400},
      );
    }

    const snapshots = await sql`
      SELECT 
        oss.id,
        oss.order_batch_id,
        oss.send_type,
        oss.file_name,
        oss.headers,
        oss.row_data,
        oss.created_at,
        ob.batch_number,
        ob.batch_date
      FROM order_sheet_snapshots oss
      LEFT JOIN order_batches ob ON oss.order_batch_id = ob.id
      WHERE oss.company_id = ${String(companyId)}
        AND oss.purchase_id = ${parseInt(purchaseId, 10)}
      ORDER BY oss.created_at DESC
    `;

    return NextResponse.json({
      success: true,
      data: snapshots.map((s: any) => ({
        id: s.id,
        orderBatchId: s.order_batch_id,
        sendType: s.send_type,
        fileName: s.file_name,
        headers: s.headers || [],
        rowData: s.row_data || [],
        createdAt: s.created_at,
        batchNumber: s.batch_number,
        batchDate: s.batch_date,
      })),
    });
  } catch (error: any) {
    console.error("발주 내역 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500},
    );
  }
}
