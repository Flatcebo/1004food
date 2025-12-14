import sql from "@/lib/db";
import {NextRequest, NextResponse} from "next/server";
import * as Excel from "exceljs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {templateId, rowIds, filters, rows} = body;

    if (!templateId) {
      return NextResponse.json(
        {success: false, error: "템플릿 ID가 필요합니다."},
        {status: 400}
      );
    }

    // console.log("rows", rows);

    // 템플릿 정보 조회
    const templateResult = await sql`
            SELECT template_data
            FROM upload_templates
            WHERE id = ${templateId}
          `;

    if (!templateResult.length) {
      return NextResponse.json(
        {success: false, error: "템플릿을 찾을 수 없습니다."},
        {status: 404}
      );
    }

    const templateData = templateResult[0].template_data;

    const headers = Array.isArray(templateData.headers)
      ? templateData.headers
      : [];
    const columnOrder = Array.isArray(templateData.columnOrder)
      ? templateData.columnOrder
      : headers;

    const columnWidths = Array.isArray(templateData.columnWidths)
      ? templateData.columnWidths
      : {};

    if (!columnOrder || columnOrder.length === 0) {
      return NextResponse.json(
        {success: false, error: "템플릿의 컬럼 순서가 설정되지 않았습니다."},
        {status: 400}
      );
    }

    // console.log("templateData", templateData);

    const wb = new Excel.Workbook();
    // sheet 생성
    const sheet = wb.addWorksheet(templateData.worksheetName);

    const headerRow = sheet.addRow(headers);
    // 헤더의 높이값 지정
    headerRow.height = 30.75;

    // 각 헤더 cell에 스타일 지정
    headerRow.eachCell((cell, colNum) => {
      // 배경색 설정 (열별로 다르게)
      let bgColor = "ffffffff"; // 기본 흰색

      if ([1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 15, 16, 17].includes(colNum)) {
        // A~G열(1-7), J~L열(10-12), O~Q열(15-17): 노란색
        bgColor = "fffffd01";
      } else if (colNum === 14) {
        // N열(14): 빨간색
        bgColor = "ffff0000";
      }
      // H~I열(8-9), M열(13): 흰색 (기본값)

      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: {argb: bgColor},
      };

      // 테두리 설정
      cell.border = {
        top: {style: "thin", color: {argb: "ff000000"}},
        left: {style: "thin", color: {argb: "ff000000"}},
        bottom: {style: "thin", color: {argb: "ff000000"}},
        right: {style: "thin", color: {argb: "ff000000"}},
      };

      // 폰트 설정
      cell.font = {
        name: "Arial",
        size: 12,
        bold: true,
        color: {argb: "ff252525"},
      };

      // 정렬 설정
      cell.alignment = {
        vertical: "middle",
        horizontal: "center",
        wrapText: true,
      };

      // 열 너비 설정 (columnWidths에서 가져오기)
      const headerName = headers[colNum - 1];
      const width = columnWidths[headerName] || 15;
      sheet.getColumn(colNum).width = width;
    });

    rows.forEach((row: any) => {
      const rowDatas = headers.map((header: any) => row[header]);
      const appendRow = sheet.addRow(rowDatas);

      appendRow.eachCell((cell: any, colNum: any) => {
        if (colNum === 1) {
          cell.font = {
            color: {argb: "ff1890ff"},
          };
        }
        if (colNum === 3) {
          cell.numFmt = "0,000";
        }
      });
    });

    // 엑셀 파일 생성
    const buffer = await wb.xlsx.writeBuffer();

    // 파일명 생성
    const dateStr = new Date().toISOString().split("T")[0];
    const fileName = `${dateStr}_${templateData.name || "download"}.xlsx`;

    // Windows에서 한글 파일명 깨짐 방지를 위한 RFC 5987 형식 인코딩
    // HTTP 헤더는 ASCII만 허용하므로 filename에는 ASCII fallback 추가
    const asciiFallbackBase =
      `${dateStr}_${templateData.name || "download"}`
        .replace(/[^\x00-\x7F]/g, "")
        .replace(/\s+/g, "_") || "download";
    const safeFileName = `${asciiFallbackBase}.xlsx`; // ASCII fallback
    const encodedFileName = encodeURIComponent(fileName); // UTF-8 인코딩
    // filename* 우선, filename ASCII fallback 병행
    const contentDisposition = `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`;

    const responseHeaders = new Headers();
    responseHeaders.set(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    responseHeaders.set("Content-Disposition", contentDisposition);

    return new Response(buffer, {
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({message: "Error", error: error}, {status: 500});
  }
}
