import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import ExcelJS from "exceljs";
import {mapDataToTemplate, sortExcelData} from "@/utils/excelDataMapping";
import {copyCellStyle, applyHeaderStyle} from "@/utils/excelStyles";
import {prepareWorkbookForExcel} from "@/utils/excelCompatibility";
import JSZip from "jszip";

// 외주 발주서 다운로드 (매입처별로 파일 분리, ZIP으로 압축)
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

    // 내외주가 "외주"인 것들만 필터링 + 매핑코드 106464 제외
    rows = rows.filter(
      (row: any) => row.내외주 === "외주" && row.매핑코드 !== "106464"
    );

    if (rows.length === 0) {
      return NextResponse.json(
        {success: false, error: "외주 데이터가 없습니다."},
        {status: 404}
      );
    }

    // 매핑코드별 가격, 사방넷명, 업체명 정보 조회
    const productCodes = [
      ...new Set(rows.map((row: any) => row.매핑코드).filter(Boolean)),
    ];
    const productSalePriceMap: {[code: string]: number | null} = {};
    const productSabangNameMap: {[code: string]: string | null} = {};
    const productVendorNameMap: {[code: string]: string | null} = {};

    if (productCodes.length > 0) {
      const products = await sql`
        SELECT code, sale_price, sabang_name as "sabangName", purchase as "vendorName"
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
          if (p.vendorName !== undefined) {
            productVendorNameMap[p.code] = p.vendorName;
          }
        }
      });
    }

    // 매핑코드를 통해 매입처로 업체명 업데이트 (매입처 기준으로만 분류)
    rows.forEach((row: any) => {
      if (row.매핑코드 && productVendorNameMap[row.매핑코드]) {
        // 매핑코드가 있고 매입처 정보가 있으면 매입처로 설정
        row.업체명 = productVendorNameMap[row.매핑코드];
      } else {
        // 매핑코드가 없거나 매입처 정보가 없으면 "매입처미지정"으로 통일
        row.업체명 = "매입처미지정";
      }
    });

    // 매입처별로 그룹화
    const vendorGroups: {[vendor: string]: any[]} = {};
    rows.forEach((row) => {
      const vendor = row.업체명;
      if (!vendorGroups[vendor]) {
        vendorGroups[vendor] = [];
      }
      vendorGroups[vendor].push(row);
    });

    // ZIP 파일 생성
    const zip = new JSZip();
    const dateStr = new Date().toISOString().split("T")[0];

    // 각 매입처별로 엑셀 파일 생성
    for (const [vendor, vendorRows] of Object.entries(vendorGroups)) {
      // 데이터 매핑 및 가격 정보 주입
      let excelData = vendorRows.map((row: any) => {
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

          // "받는사람" 컬럼에 값이 있으면 앞에 ★ 추가
          if (
            headerStr === "받는사람" &&
            value &&
            String(value).trim() !== ""
          ) {
            return "★" + value;
          }

          return value;
        });
      });

      // 정렬: 상품명 오름차순 후 수취인명 오름차순
      excelData = sortExcelData(excelData, columnOrder);

      // ExcelJS 워크북 생성
      const workbook = new ExcelJS.Workbook();
      let worksheet: ExcelJS.Worksheet;

      if (templateData.originalFile) {
        // 원본 파일 로드
        const originalBuffer = Buffer.from(templateData.originalFile, "base64");
        await workbook.xlsx.load(originalBuffer as any);

        // 워크시트 가져오기
        worksheet = workbook.worksheets[0] || workbook.addWorksheet("Sheet1");

        // 헤더 행 정보 저장 (스타일 포함)
        const headerRow = worksheet.getRow(1);
        const headerRowHeight = headerRow?.height;
        const headerCells: {[colNumber: number]: any} = {};

        if (headerRow) {
          // 모든 컬럼에 대해 스타일 저장 (빈 셀 포함)
          columnOrder.forEach((_, colIdx) => {
            const colNumber = colIdx + 1;
            const cell = headerRow.getCell(colNumber);
            // 셀의 모든 속성을 깊은 복사로 저장
            headerCells[colNumber] = {
              value: cell.value,
              style: JSON.parse(JSON.stringify(cell.style)),
              address: cell.address,
            };
          });
        }

        // 데이터 행 스타일 저장
        const dataRowHeight =
          worksheet.rowCount > 1 ? worksheet.getRow(2).height : undefined;
        const dataCells: {[colNumber: number]: any} = {};

        if (worksheet.rowCount > 1) {
          const originalDataRow = worksheet.getRow(2);
          if (originalDataRow) {
            // 모든 컬럼에 대해 스타일 저장 (빈 셀 포함)
            columnOrder.forEach((_, colIdx) => {
              const colNumber = colIdx + 1;
              const cell = originalDataRow.getCell(colNumber);
              // 셀의 모든 속성을 깊은 복사로 저장
              dataCells[colNumber] = {
                value: cell.value,
                style: JSON.parse(JSON.stringify(cell.style)),
                address: cell.address,
              };
            });
          }
        }

        // 열 너비 저장
        const columnWidths: {[key: number]: number} = {};
        worksheet.columns.forEach((column, index) => {
          if (column.width) {
            columnWidths[index + 1] = column.width;
          }
        });

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

          // 헤더 스타일 복원
          if (headerCells[colNumber]) {
            cell.style = JSON.parse(
              JSON.stringify(headerCells[colNumber].style)
            );
          }

          cell.value = header;
        });

        // 열 너비 복원 (모든 열에 대해)
        columnOrder.forEach((_, colIdx) => {
          const colNum = colIdx + 1;
          if (columnWidths[colNum]) {
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

            // 스타일 복원: 데이터 셀 우선, 없으면 헤더 셀 사용
            if (dataCells[colNumber]) {
              cell.style = JSON.parse(
                JSON.stringify(dataCells[colNumber].style)
              );
            } else if (headerCells[colNumber]) {
              // 헤더 셀 스타일을 복사하되, 폰트는 데이터용으로 조정
              const style = JSON.parse(
                JSON.stringify(headerCells[colNumber].style)
              );
              if (style.font) {
                style.font.bold = false;
              }
              cell.style = style;
            }

            cell.value = cellValue;

            // 1번 열(A열) 배경색 설정
            if (colNumber === 1) {
              if (!cell.fill || (cell.fill as any).type !== "pattern") {
                cell.fill = {
                  type: "pattern",
                  pattern: "solid",
                  fgColor: {argb: "FFDAEDF3"},
                };
              } else {
                (cell.fill as any).fgColor = {argb: "FFDAEDF3"};
              }
            }
          });
        });
      } else {
        // 원본 파일이 없으면 새로 생성
        worksheet = workbook.addWorksheet("Sheet1");
        worksheet.addRow(columnOrder);

        const headerRow = worksheet.getRow(1);
        applyHeaderStyle(headerRow, columnOrder, templateData.columnWidths);

        excelData.forEach((rowData) => {
          const row = worksheet.addRow(rowData);
          // 1번 열 배경색 설정
          const firstCell = row.getCell(1);
          firstCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: {argb: "FFDAEDF3"},
          };
        });
      }

      // Excel 호환성을 위한 워크북 정리
      prepareWorkbookForExcel(workbook, {
        removeFormulas: false,
        removeDataValidations: false,
      });

      // 엑셀 파일을 버퍼로 생성
      const buffers = await workbook.xlsx.writeBuffer();
      const buffer = new Uint8Array(buffers);

      // ZIP에 파일 추가
      const fileName = `${dateStr}_외주발주_${vendor}.xlsx`;
      zip.file(fileName, buffer);
    }

    // ZIP 파일 생성
    const zipBuffer = await zip.generateAsync({type: "nodebuffer"});

    // ZIP 파일 다운로드
    const zipFileName = `${dateStr}_외주발주.zip`;
    const encodedZipFileName = encodeURIComponent(zipFileName);
    const contentDisposition = `attachment; filename="outsource.zip"; filename*=UTF-8''${encodedZipFileName}`;

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", "application/zip");
    responseHeaders.set("Content-Disposition", contentDisposition);

    return new Response(Buffer.from(zipBuffer), {
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("외주 발주서 다운로드 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
