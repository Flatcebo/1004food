import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";
import * as Excel from "exceljs";
import JSZip from "jszip";

/**
 * 매입처별 정산서 다운로드 API
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {settlementIds} = body;

    if (!settlementIds || !Array.isArray(settlementIds) || settlementIds.length === 0) {
      return NextResponse.json(
        {success: false, error: "settlementIds가 필요합니다."},
        {status: 400}
      );
    }

    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400}
      );
    }

    // 정산 데이터 조회
    const settlements = await sql`
      SELECT 
        pss.id,
        pss.purchase_id,
        p.name as purchase_name,
        pss.period_start_date,
        pss.period_end_date,
        pss.order_quantity,
        pss.order_amount,
        pss.cancel_quantity,
        pss.cancel_amount,
        pss.net_sales_quantity,
        pss.net_sales_amount,
        pss.total_profit_amount,
        pss.total_profit_rate
      FROM purchase_sales_settlements pss
      INNER JOIN purchase p ON pss.purchase_id = p.id
      WHERE pss.id = ANY(${settlementIds}) AND pss.company_id = ${companyId}
      ORDER BY p.name
    `;

    if (settlements.length === 0) {
      return NextResponse.json(
        {success: false, error: "정산 데이터를 찾을 수 없습니다."},
        {status: 404}
      );
    }

    // ZIP 파일 생성
    const zip = new JSZip();

    // 각 정산 데이터별로 엑셀 파일 생성
    for (const settlement of settlements) {
      const wb = new Excel.Workbook();
      const sheet = wb.addWorksheet("정산서");

      // 제목
      sheet.mergeCells("A1:F1");
      const titleCell = sheet.getCell("A1");
      titleCell.value = `${settlement.purchase_name} 정산서`;
      titleCell.font = {bold: true, size: 16};
      titleCell.alignment = {horizontal: "center"};

      // 기간
      sheet.mergeCells("A2:F2");
      const periodCell = sheet.getCell("A2");
      periodCell.value = `기간: ${settlement.period_start_date} ~ ${settlement.period_end_date}`;
      periodCell.alignment = {horizontal: "center"};

      // 빈 행
      sheet.addRow([]);

      // 헤더
      const headers = ["항목", "수량", "금액"];
      const headerRow = sheet.addRow(headers);
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: {argb: "FFE0E0E0"},
        };
        cell.border = {
          top: {style: "thin"},
          left: {style: "thin"},
          bottom: {style: "thin"},
          right: {style: "thin"},
        };
        cell.font = {bold: true};
        cell.alignment = {horizontal: "center"};
      });

      // 데이터 행
      const dataRows = [
        ["주문", settlement.order_quantity, settlement.order_amount],
        ["취소", settlement.cancel_quantity, settlement.cancel_amount],
        ["순매출", settlement.net_sales_quantity, settlement.net_sales_amount],
        ["총이익", "-", settlement.total_profit_amount],
        ["이익률", "-", `${parseFloat(settlement.total_profit_rate).toFixed(2)}%`],
      ];

      dataRows.forEach((row) => {
        const dataRow = sheet.addRow(row);
        dataRow.eachCell((cell, colNumber) => {
          cell.border = {
            top: {style: "thin"},
            left: {style: "thin"},
            bottom: {style: "thin"},
            right: {style: "thin"},
          };
          if (colNumber === 1) {
            cell.alignment = {horizontal: "left"};
          } else {
            cell.alignment = {horizontal: "right"};
          }
        });
      });

      // 열 너비 설정
      sheet.getColumn(1).width = 15;
      sheet.getColumn(2).width = 15;
      sheet.getColumn(3).width = 20;

      // 엑셀 버퍼 생성
      const buffer = await wb.xlsx.writeBuffer();
      const fileName = `${settlement.period_start_date}_${settlement.purchase_name}_정산서.xlsx`;
      zip.file(fileName, buffer);
    }

    // ZIP 파일 생성
    const zipBuffer = await zip.generateAsync({type: "nodebuffer"});

    const today = new Date().toISOString().split("T")[0];
    const zipFileName = `${today}_매입처_정산서.zip`;
    const encodedZipFileName = encodeURIComponent(zipFileName);

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", "application/zip");
    responseHeaders.set(
      "Content-Disposition",
      `attachment; filename="purchase_settlement.zip"; filename*=UTF-8''${encodedZipFileName}`
    );

    return new Response(Buffer.from(zipBuffer), {
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("정산서 다운로드 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
