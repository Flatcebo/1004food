import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest, getUserIdFromRequest} from "@/lib/company";
import ExcelJS from "exceljs";

/**
 * POST /api/upload/download-delivery
 * 특정 업체의 운송장 다운로드 (엑셀 파일)
 * A열=택배사, B열=운송장번호, C열=내부코드, D열=수취인명, E열=상품명, F열=매핑코드
 */
export async function POST(request: NextRequest) {
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
    const {vendorName, uploadId} = body;

    if (!vendorName || !uploadId) {
      return NextResponse.json(
        {success: false, error: "업체명과 파일 ID가 필요합니다."},
        {status: 400}
      );
    }

    // user_id 추출 및 권한 확인
    const userId = await getUserIdFromRequest(request);
    let isAdmin = false;
    let assignedVendorIds: number[] = [];

    if (userId) {
      try {
        const userResult = await sql`
          SELECT grade, assigned_vendor_ids
          FROM users
          WHERE id = ${userId} AND company_id = ${companyId}
        `;

        if (userResult.length > 0) {
          isAdmin = userResult[0].grade === "관리자";

          if (userResult[0].assigned_vendor_ids) {
            try {
              assignedVendorIds = Array.isArray(userResult[0].assigned_vendor_ids)
                ? userResult[0].assigned_vendor_ids
                : JSON.parse(userResult[0].assigned_vendor_ids || "[]");
            } catch (e) {
              assignedVendorIds = [];
            }
          }
        }
      } catch (error) {
        console.error("사용자 정보 조회 실패:", error);
      }
    }

    // 일반 유저인 경우 권한 확인
    if (!isAdmin && assignedVendorIds.length > 0) {
      const vendorResult = await sql`
        SELECT name
        FROM vendors
        WHERE id = ANY(${assignedVendorIds}) AND company_id = ${companyId}
      `;

      const allowedVendorNames = vendorResult.map((v: any) => v.name);

      if (!allowedVendorNames.includes(vendorName)) {
        return NextResponse.json(
          {success: false, error: "해당 업체에 대한 권한이 없습니다."},
          {status: 403}
        );
      }
    }

    // 금일 날짜 계산 (한국 시간 기준)
    const today = new Date();
    const koreaTime = new Date(today.getTime() + 9 * 60 * 60 * 1000);
    const todayStart = new Date(koreaTime);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(koreaTime);
    todayEnd.setHours(23, 59, 59, 999);

    const todayStartUTC = new Date(todayStart.getTime() - 9 * 60 * 60 * 1000);
    const todayEndUTC = new Date(todayEnd.getTime() - 9 * 60 * 60 * 1000);

    // 해당 파일(upload_id)의 배송중인 주문 데이터 조회
    const deliveryOrdersResult = await sql`
      SELECT ur.row_order, ur.row_data
      FROM upload_rows ur
      INNER JOIN uploads u ON ur.upload_id = u.id
      WHERE u.id = ${uploadId}
        AND u.company_id = ${companyId}
        AND ur.row_data->>'업체명' = ${vendorName}
        AND ur.row_data->>'주문상태' = '배송중'
        AND ur.row_data->>'운송장번호' IS NOT NULL
        AND ur.row_data->>'운송장번호' != ''
      ORDER BY ur.row_order
    `;

    // 해당 upload_id의 모든 주문 데이터를 row_order 순서대로 가져오기
    const allRowsResult = await sql`
      SELECT ur.row_order, ur.row_data
      FROM upload_rows ur
      INNER JOIN uploads u ON ur.upload_id = u.id
      WHERE u.id = ${uploadId} AND u.company_id = ${companyId}
      ORDER BY ur.row_order
    `;

    if (allRowsResult.length === 0) {
      return NextResponse.json(
        {success: false, error: "해당 파일의 데이터를 찾을 수 없습니다."},
        {status: 404}
      );
    }

    // 배송중인 주문의 row_order Set
    const deliveryRowOrders = new Set<number>();
    deliveryOrdersResult.forEach((order: any) => {
      deliveryRowOrders.add(order.row_order);
    });

    // 엑셀 워크북 생성
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("운송장");

    // 헤더 행: A열=택배사, B열=운송장번호, C열=내부코드, D열=수취인명, E열=상품명, F열=매핑코드
    const headers = ["택배사", "운송장번호", "내부코드", "수취인명", "상품명", "매핑코드"];
    worksheet.addRow(headers);

    // 헤더 스타일 적용
    const headerRow = worksheet.getRow(1);
    headerRow.font = {bold: true, size: 12};
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {argb: "FFE0E0E0"},
    };
    headerRow.alignment = {vertical: "middle", horizontal: "center"};

    // 모든 행을 row_order 순서대로 추가
    allRowsResult.forEach((row: any) => {
      const rowData = row.row_data || {};
      const rowOrder = row.row_order;
      const isDeliveryOrder = deliveryRowOrders.has(rowOrder);

      // 배송중인 주문만 운송장 정보 포함, 나머지는 빈 값
      const carrier = isDeliveryOrder ? (rowData["택배사"] || "") : "";
      const trackingNumber = isDeliveryOrder ? (rowData["운송장번호"] || "") : "";
      
      // 내부코드, 수취인명, 상품명, 매핑코드는 항상 포함
      const internalCode = rowData["내부코드"] || "";
      const receiverName = rowData["수취인명"] || "";
      const productName = rowData["상품명"] || "";
      const mappingCode = rowData["매핑코드"] || "";

      const newRow = [
        carrier,
        trackingNumber,
        internalCode,
        receiverName,
        productName,
        mappingCode,
      ];
      worksheet.addRow(newRow);
    });

    // 열 너비 자동 조정
    const columnWidths: number[] = [];
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell({includeEmpty: true}, (cell, colNumber) => {
        const cellValue = cell.value ? String(cell.value) : "";
        const currentMax = columnWidths[colNumber - 1] || 0;
        if (cellValue.length > currentMax) {
          columnWidths[colNumber - 1] = cellValue.length;
        }
      });
    });
    worksheet.columns.forEach((column, index) => {
      if (column) {
        const maxLength = columnWidths[index] || 10;
        column.width = Math.min(Math.max(maxLength + 2, 10), 50);
      }
    });

    // 엑셀 파일 생성
    const buffer = await workbook.xlsx.writeBuffer();

    // 파일명 생성
    const dateStr = new Date().toISOString().split("T")[0];
    const fileName = `${dateStr}_${vendorName}_운송장.xlsx`;

    // Windows에서 한글 파일명 깨짐 방지를 위한 RFC 5987 형식 인코딩
    const asciiFallbackBase = `${dateStr}_${vendorName}_delivery`
      .replace(/[^\x00-\x7F]/g, "")
      .replace(/\s+/g, "_");
    const safeFileName = `${asciiFallbackBase}.xlsx`;
    const encodedFileName = encodeURIComponent(fileName);
    const contentDisposition = `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`;

    // 응답 헤더 설정
    const responseHeaders = new Headers();
    responseHeaders.set(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    responseHeaders.set("Content-Disposition", contentDisposition);

    return new Response(buffer, {
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("운송장 다운로드 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
