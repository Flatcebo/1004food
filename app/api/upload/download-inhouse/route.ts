import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import ExcelJS from "exceljs";
import {mapDataToTemplate, sortExcelData} from "@/utils/excelDataMapping";
import {copyCellStyle, applyHeaderStyle} from "@/utils/excelStyles";
import {prepareWorkbookForExcel} from "@/utils/excelCompatibility";
import {prepareExcelCellValue} from "@/utils/excelTypeConversion";
import {initializeWorkbookProperties} from "@/utils/excelCompatibility";

// 내주 발주서 다운로드
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {templateId, rowIds, filters} = body;

    if (!templateId) {
      return NextResponse.json(
        {success: false, error: "템플릿 ID가 필요합니다."},
        {status: 400}
      );
    }

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

    if (!columnOrder || columnOrder.length === 0) {
      return NextResponse.json(
        {success: false, error: "템플릿의 컬럼 순서가 설정되지 않았습니다."},
        {status: 400}
      );
    }

    // 데이터 조회 (선택된 행 또는 필터된 데이터)
    let rows: any[] = [];
    if (rowIds && rowIds.length > 0) {
      // 선택된 행이 있으면 해당 ID들만 조회
      const rowData = await sql`
        SELECT row_data
        FROM upload_rows
        WHERE id = ANY(${rowIds})
      `;
      rows = rowData.map((r: any) => r.row_data || {});
    } else {
      // 필터가 있으면 필터링된 데이터 조회
      if (filters && Object.keys(filters).length > 0) {
        const {
          type,
          postType,
          vendor,
          orderStatus,
          searchField,
          searchValue,
          uploadTimeFrom,
          uploadTimeTo,
        } = filters;

        const fieldMap: {[key: string]: string} = {
          수취인명: "수취인명",
          주문자명: "주문자명",
          상품명: "상품명",
          매핑코드: "매핑코드",
        };
        const dbField = searchField ? fieldMap[searchField] : null;
        const searchPattern = searchValue ? `%${searchValue}%` : null;

        const conditions: any[] = [];
        if (type) {
          conditions.push(sql`ur.row_data->>'내외주' = ${type}`);
        }
        if (postType) {
          conditions.push(sql`ur.row_data->>'택배사' = ${postType}`);
        }
        if (vendor) {
          conditions.push(sql`ur.row_data->>'업체명' = ${vendor}`);
        }
        if (orderStatus) {
          conditions.push(sql`ur.row_data->>'주문상태' = ${orderStatus}`);
        }
        if (dbField && searchPattern) {
          conditions.push(sql`ur.row_data->>${dbField} ILIKE ${searchPattern}`);
        }
        if (uploadTimeFrom) {
          conditions.push(sql`u.created_at >= ${uploadTimeFrom}::date`);
        }
        if (uploadTimeTo) {
          conditions.push(
            sql`u.created_at < (${uploadTimeTo}::date + INTERVAL '1 day')`
          );
        }

        const buildQuery = () => {
          if (conditions.length === 0) {
            return sql`
              SELECT ur.row_data
              FROM upload_rows ur
              INNER JOIN uploads u ON ur.upload_id = u.id
              ORDER BY u.created_at DESC, ur.id DESC
            `;
          }

          let query = sql`
            SELECT ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE ${conditions[0]}
          `;

          for (let i = 1; i < conditions.length; i++) {
            query = sql`${query} AND ${conditions[i]}`;
          }

          query = sql`${query} ORDER BY u.created_at DESC, ur.id DESC`;
          return query;
        };

        const filteredData = await buildQuery();
        rows = filteredData.map((r: any) => r.row_data || {});
      } else {
        const allData = await sql`
          SELECT row_data
          FROM upload_rows
          ORDER BY id DESC
        `;
        rows = allData.map((r: any) => r.row_data || {});
      }
    }

    // 내외주가 "내주"인 것들만 필터링 + 매핑코드 106464 제외 + 공란 제외
    rows = rows.filter(
      (row: any) => row.내외주?.trim() === "내주" && row.매핑코드 !== "106464"
    );

    if (rows.length === 0) {
      return NextResponse.json(
        {success: false, error: "내주 데이터가 없습니다."},
        {status: 404}
      );
    }

    // 매핑코드별 가격, 사방넷명 정보 조회
    const productCodes = [
      ...new Set(rows.map((row: any) => row.매핑코드).filter(Boolean)),
    ];
    const productSalePriceMap: {[code: string]: number | null} = {};
    const productSabangNameMap: {[code: string]: string | null} = {};

    if (productCodes.length > 0) {
      const products = await sql`
        SELECT code, sale_price, sabang_name as "sabangName"
        FROM products
        WHERE code = ANY(${productCodes})
      `;

      products.forEach((p: any) => {
        if (p.code) {
          if (p.sale_price !== null && p.sale_price !== undefined) {
            productSalePriceMap[p.code] = p.sale_price;
          }
          if (p.sabangName !== undefined) {
            productSabangNameMap[p.code] = p.sabangName;
          }
        }
      });
    }

    // 데이터 매핑 및 가격 정보 주입
    let excelData = rows.map((row: any) => {
      if (row.매핑코드) {
        if (productSalePriceMap[row.매핑코드] !== undefined) {
          const salePrice = productSalePriceMap[row.매핑코드];
          if (salePrice !== null) {
            row["공급가"] = salePrice;
          }
        }

        if (productSabangNameMap[row.매핑코드] !== undefined) {
          const sabangName = productSabangNameMap[row.매핑코드];
          if (
            sabangName !== null &&
            sabangName !== undefined &&
            String(sabangName).trim() !== ""
          ) {
            row["사방넷명"] = sabangName;
          }
        }
      }

      return columnOrder.map((header: any) => {
        const headerStr =
          typeof header === "string" ? header : String(header || "");
        const value = mapDataToTemplate(row, headerStr, {
          templateName: templateData.name,
        });

        // 모든 값을 문자열로 변환 (0 유지)
        let stringValue = value != null ? String(value) : "";

        // 전화번호가 10-11자리 숫자이고 0으로 시작하지 않으면 앞에 0 추가
        if (headerStr.includes("전화") || headerStr.includes("연락")) {
          const numOnly = stringValue.replace(/\D/g, ""); // 숫자만 추출
          if (
            (numOnly.length === 10 || numOnly.length === 11) &&
            !numOnly.startsWith("0")
          ) {
            stringValue = "0" + numOnly; // 숫자만 사용하고 0 추가
          } else if (numOnly.length > 0) {
            stringValue = numOnly; // 하이픈 등 제거하고 숫자만
          }
        }

        // 우편번호가 4-5자리 숫자면 5자리로 맞춤 (앞에 0 추가)
        if (headerStr.includes("우편")) {
          const numOnly = stringValue.replace(/\D/g, "");
          if (numOnly.length >= 4 && numOnly.length <= 5) {
            stringValue = numOnly.padStart(5, "0");
          }
        }

        return stringValue;
      });
    });

    // 정렬: 상품명 오름차순 후 수취인명 오름차순
    excelData = sortExcelData(excelData, columnOrder);

    // ExcelJS 워크북 생성
    const workbook = new ExcelJS.Workbook();
    let worksheet: ExcelJS.Worksheet;

    delete (workbook as any)._themes;

    if (templateData.originalFile) {
      // 원본 파일 로드
      const originalBuffer = Buffer.from(templateData.originalFile, "base64");
      await workbook.xlsx.load(originalBuffer as any);

      // 워크북 속성 초기화
      initializeWorkbookProperties(workbook);

      // 워크시트 가져오기
      worksheet = workbook.worksheets[0] || workbook.addWorksheet("Sheet1");

      // 헤더 행 정보 저장
      const headerRow = worksheet.getRow(1);
      const headerRowHeight = headerRow?.height;
      const headerCells: {[colNumber: number]: ExcelJS.Cell} = {};

      if (headerRow) {
        headerRow.eachCell({includeEmpty: true}, (cell, colNumber) => {
          headerCells[colNumber] = cell;
        });
      }

      // 데이터 행 스타일 저장
      const dataRowHeight =
        worksheet.rowCount > 1 ? worksheet.getRow(2).height : undefined;
      const dataCells: {[colNumber: number]: ExcelJS.Cell} = {};

      if (worksheet.rowCount > 1) {
        const originalDataRow = worksheet.getRow(2);
        if (originalDataRow) {
          originalDataRow.eachCell({includeEmpty: true}, (cell, colNumber) => {
            dataCells[colNumber] = cell;
          });
        }
      }

      // 열 너비 저장
      const columnWidths: {[key: number]: number} = {};
      if (worksheet.columns) {
        worksheet.columns.forEach((column, index) => {
          if (column.width) {
            columnWidths[index + 1] = column.width;
          }
        });
      }

      // 기존 데이터 행 삭제
      const lastRow = worksheet.rowCount;
      if (lastRow > 1) {
        for (let rowNum = lastRow; rowNum > 1; rowNum--) {
          worksheet.spliceRows(rowNum, 1);
        }
      }

      // 헤더 행 복원
      const newHeaderRow = worksheet.getRow(1);
      if (headerRowHeight) {
        newHeaderRow.height = headerRowHeight;
      }

      columnOrder.forEach((header: string, colIdx: number) => {
        const colNumber = colIdx + 1;
        const cell = newHeaderRow.getCell(colNumber);

        // 헤더 스타일 복사
        if (headerCells[colNumber]) {
          copyCellStyle(headerCells[colNumber], cell);
        }

        cell.value = prepareExcelCellValue(header, false);
      });

      // 열 너비 복원
      Object.keys(columnWidths).forEach((colNumStr) => {
        const colNum = parseInt(colNumStr);
        if (colNum <= columnOrder.length) {
          worksheet.getColumn(colNum).width = columnWidths[colNum];
        }
      });

      // 새 데이터 추가
      excelData.forEach((rowData, rowIdx) => {
        const rowNumber = rowIdx + 2;
        const row = worksheet.getRow(rowNumber);

        if (dataRowHeight) {
          row.height = dataRowHeight;
        }

        rowData.forEach((cellValue: any, colIdx: number) => {
          const colNumber = colIdx + 1;
          const cell = row.getCell(colNumber);

          // 모든 값을 문자열로 처리 (숫자의 앞자리 0 유지)
          const normalizedValue = cellValue != null ? String(cellValue) : "";

          // 값과 텍스트 형식 먼저 설정
          cell.value = normalizedValue;
          cell.numFmt = "@"; // 모든 셀을 텍스트 형식으로

          // 스타일 복사 (numFmt는 이미 설정했으므로 텍스트 형식 유지됨)
          if (dataCells[colNumber]) {
            const sourceStyle = dataCells[colNumber].style;
            if (sourceStyle) {
              cell.font = sourceStyle.font as ExcelJS.Font;
              cell.alignment = sourceStyle.alignment as ExcelJS.Alignment;
              cell.border = sourceStyle.border as ExcelJS.Borders;
              cell.fill = sourceStyle.fill as ExcelJS.Fill;
              // numFmt는 복사하지 않음 (위에서 "@"로 설정한 것 유지)
            }
          }
        });
      });
    } else {
      // 원본 파일이 없으면 새로 생성
      worksheet = workbook.addWorksheet("Sheet1");
      const normalizedHeaders = columnOrder.map((h: any) =>
        prepareExcelCellValue(h, false)
      );
      worksheet.addRow(normalizedHeaders);

      const headerRow = worksheet.getRow(1);
      applyHeaderStyle(headerRow, columnOrder, templateData.columnWidths);

      excelData.forEach((rowData) => {
        // 모든 값을 문자열로 처리
        const normalizedRowData = rowData.map((cellValue: any) => {
          return cellValue != null ? String(cellValue) : "";
        });
        const addedRow = worksheet.addRow(normalizedRowData);

        // 모든 셀을 텍스트 형식으로 설정
        addedRow.eachCell({includeEmpty: true}, (cell) => {
          cell.numFmt = "@";
        });
      });

      initializeWorkbookProperties(workbook);
    }

    // Excel 호환성을 위한 워크북 정리
    prepareWorkbookForExcel(workbook, {
      removeFormulas: false,
      removeDataValidations: false,
    });

    // 엑셀 파일 생성
    const buffer = await workbook.xlsx.writeBuffer({
      useStyles: false,
      useSharedStrings: false,
    });

    // 파일명 생성
    const dateStr = new Date().toISOString().split("T")[0];
    const baseName = (templateData.name || "download").toString().trim();
    const fileName = `${dateStr}_${baseName}.xlsx`;

    const asciiFallbackBase =
      `${dateStr}_${baseName}`
        .replace(/[^\x00-\x7F]/g, "")
        .replace(/\s+/g, "_") || "download";
    const safeFileName = `${asciiFallbackBase}.xlsx`;
    const encodedFileName = encodeURIComponent(fileName);
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
  } catch (error: any) {
    console.error("내주 발주서 다운로드 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
