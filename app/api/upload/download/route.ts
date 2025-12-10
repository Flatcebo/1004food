import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import ExcelJS from "exceljs";
import {mapDataToTemplate, sortExcelData} from "@/utils/excelDataMapping";
import {copyCellStyle, applyHeaderStyle} from "@/utils/excelStyles";
import {prepareExcelCellValue} from "@/utils/excelTypeConversion";
import {
  prepareWorkbookForExcel,
  initializeWorkbookProperties,
} from "@/utils/excelCompatibility";

// 템플릿 양식으로 엑셀 다운로드
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {templateId, rowIds, filters, isInhouse} = body;

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

    // columnOrder가 비어있거나 유효하지 않은 경우 에러 처리
    if (!columnOrder || columnOrder.length === 0) {
      return NextResponse.json(
        {success: false, error: "템플릿의 컬럼 순서가 설정되지 않았습니다."},
        {status: 400}
      );
    }

    // 선택된 행 데이터 조회
    let rows: any[] = [];
    if (rowIds && rowIds.length > 0) {
      // 선택된 행이 있으면 해당 ID들만 조회 (필터 무시)
      const rowData = await sql`
        SELECT row_data
        FROM upload_rows
        WHERE id = ANY(${rowIds})
      `;
      rows = rowData.map((r: any) => {
        const rowData = r.row_data || {};
        // 우편번호를 우편으로 통일
        if (
          rowData["우편번호"] !== undefined &&
          rowData["우편"] === undefined
        ) {
          rowData["우편"] = rowData["우편번호"];
        }
        return rowData;
      });
    } else {
      // 필터가 있으면 필터링된 데이터 조회, 없으면 모든 데이터 조회
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

        // 검색 필드 매핑
        const fieldMap: {[key: string]: string} = {
          수취인명: "수취인명",
          주문자명: "주문자명",
          상품명: "상품명",
          매핑코드: "매핑코드",
        };
        const dbField = searchField ? fieldMap[searchField] : null;
        const searchPattern = searchValue ? `%${searchValue}%` : null;

        // WHERE 조건 구성
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

        // 조건부 쿼리 구성
        const buildQuery = () => {
          if (conditions.length === 0) {
            return sql`
              SELECT ur.row_data
              FROM upload_rows ur
              INNER JOIN uploads u ON ur.upload_id = u.id
              ORDER BY u.created_at DESC, ur.id DESC
            `;
          }

          // 첫 번째 조건으로 WHERE 시작
          let query = sql`
            SELECT ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE ${conditions[0]}
          `;

          // 나머지 조건들을 AND로 연결
          for (let i = 1; i < conditions.length; i++) {
            query = sql`${query} AND ${conditions[i]}`;
          }

          query = sql`${query} ORDER BY u.created_at DESC, ur.id DESC`;

          return query;
        };

        const filteredData = await buildQuery();
        rows = filteredData.map((r: any) => {
          const rowData = r.row_data || {};
          // 우편번호를 우편으로 통일
          if (
            rowData["우편번호"] !== undefined &&
            rowData["우편"] === undefined
          ) {
            rowData["우편"] = rowData["우편번호"];
          }
          return rowData;
        });
      } else {
        // 필터가 없으면 모든 데이터 조회
        const allData = await sql`
          SELECT row_data
          FROM upload_rows
          ORDER BY id DESC
        `;
        rows = allData.map((r: any) => {
          const rowData = r.row_data || {};
          // 우편번호를 우편으로 통일
          if (
            rowData["우편번호"] !== undefined &&
            rowData["우편"] === undefined
          ) {
            rowData["우편"] = rowData["우편번호"];
          }
          return rowData;
        });
      }
    }

    // 내주 발주서인 경우: 내외주가 "내주"인 것들만 필터링 + 매핑코드 106464 제외
    if (isInhouse) {
      rows = rows.filter(
        (row: any) => row.내외주 === "내주" && row.매핑코드 !== "106464"
      );

      if (rows.length === 0) {
        return NextResponse.json(
          {success: false, error: "내주 데이터가 없습니다."},
          {status: 404}
        );
      }
    }

    // 매핑코드별 가격 정보 조회 (같은 상품코드는 같은 가격 사용)
    const productCodes = [
      ...new Set(rows.map((row: any) => row.매핑코드).filter(Boolean)),
    ];
    const productPriceMap: {[code: string]: number | null} = {};
    const productSalePriceMap: {[code: string]: number | null} = {};
    const productSabangNameMap: {[code: string]: string | null} = {};

    if (productCodes.length > 0) {
      try {
        console.log("=== 사방넷명 매핑 디버깅 ===");
        console.log("매핑코드 목록:", productCodes);

        const products = await sql`
          SELECT code, price, sale_price, sabang_name as "sabangName"
          FROM products
          WHERE code = ANY(${productCodes})
        `;

        console.log("조회된 상품 개수:", products.length);
        console.log("조회된 상품 데이터:", JSON.stringify(products, null, 2));

        products.forEach((p: any) => {
          if (p.code) {
            if (p.price !== null && p.price !== undefined) {
              productPriceMap[p.code] = p.price;
            }
            if (p.sale_price !== null && p.sale_price !== undefined) {
              productSalePriceMap[p.code] = p.sale_price;
            }
            if (p.sabangName !== undefined) {
              productSabangNameMap[p.code] = p.sabangName;
              console.log(`매핑: ${p.code} => 사방넷명: ${p.sabangName}`);
            } else {
              console.log(`매핑: ${p.code} => 사방넷명 없음`);
            }
          }
        });

        console.log("productSabangNameMap:", productSabangNameMap);
      } catch (error) {
        console.error("상품 가격 조회 실패:", error);
      }
    }

    // 템플릿 헤더 순서에 맞게 데이터 재구성
    let excelData = rows.map((row, idx) => {
      // 매핑코드가 있으면 products 테이블에서 가격 정보 가져오기
      if (row.매핑코드) {
        // salePrice 우선 사용 (공급가용)
        if (productSalePriceMap[row.매핑코드] !== undefined) {
          const salePrice = productSalePriceMap[row.매핑코드];
          if (salePrice !== null) {
            // 공급가 필드에 명시적으로 설정 (여러 변형명 지원)
            row["공급가"] = salePrice;
            row["salePrice"] = salePrice;
            row["sale_price"] = salePrice;
            // 가격 필드에도 설정 (기존 호환성)
            if (!row.가격 || row.가격 === "") {
              row.가격 = salePrice;
            }
          }
        }
        // salePrice가 없으면 price 사용
        else if (productPriceMap[row.매핑코드] !== undefined) {
          const productPrice = productPriceMap[row.매핑코드];
          if (productPrice !== null) {
            row["공급가"] = productPrice;
            if (!row.가격 || row.가격 === "") {
              row.가격 = productPrice;
            }
          }
        }

        // 사방넷명 매핑: products 테이블 값이 있으면 row에 주입
        if (productSabangNameMap[row.매핑코드] !== undefined) {
          const sabangName = productSabangNameMap[row.매핑코드];
          if (idx < 3) {
            // 처음 3개 row만 로그
            console.log(`\n[Row ${idx}] 매핑코드: ${row.매핑코드}`);
            console.log(`원본 상품명: ${row.상품명}`);
            console.log(`조회된 사방넷명: ${sabangName}`);
          }
          if (
            sabangName !== null &&
            sabangName !== undefined &&
            String(sabangName).trim() !== ""
          ) {
            row["사방넷명"] = sabangName;
            row["sabangName"] = sabangName;
            if (idx < 3) {
              console.log(`✓ 사방넷명 주입 완료: ${sabangName}`);
            }
          } else {
            if (idx < 3) {
              console.log(`✗ 사방넷명이 비어있거나 null`);
            }
          }
        } else {
          if (idx < 3) {
            console.log(
              `\n[Row ${idx}] 매핑코드: ${row.매핑코드} - productSabangNameMap에 없음`
            );
          }
        }
      } else {
        if (idx < 3) {
          console.log(`\n[Row ${idx}] 매핑코드 없음`);
        }
      }

      return columnOrder.map((header: any) => {
        // header가 문자열이 아닌 경우 문자열로 변환
        const headerStr =
          typeof header === "string" ? header : String(header || "");

        // 모든 템플릿에서 사방넷명 사용 (preferSabangName 옵션 불필요)
        return mapDataToTemplate(row, headerStr, {
          templateName: templateData.name,
        });
      });
    });

    // 정렬: 상품명 오름차순 후 수취인명 오름차순
    excelData = sortExcelData(excelData, columnOrder);

    // ExcelJS 워크북 생성
    const workbook = new ExcelJS.Workbook();
    let worksheet: ExcelJS.Worksheet;

    if (templateData.originalFile) {
      // 원본 파일 읽기
      let originalBuffer: Buffer;
      try {
        const buffer = Buffer.from(templateData.originalFile, "base64");
        if (!buffer || buffer.length === 0) {
          throw new Error("원본 파일 데이터가 비어있습니다.");
        }
        originalBuffer = buffer as Buffer;
      } catch (bufferError: any) {
        console.error("Base64 디코딩 실패:", bufferError);
        throw new Error(
          `원본 파일을 디코딩할 수 없습니다: ${bufferError.message}`
        );
      }

      try {
        await workbook.xlsx.load(originalBuffer as any);
      } catch (loadError: any) {
        console.error("원본 파일 로드 실패:", loadError);
        console.error("버퍼 크기:", originalBuffer.length);
        throw new Error(`원본 파일을 로드할 수 없습니다: ${loadError.message}`);
      }

      // 워크북이 제대로 로드되었는지 확인
      if (!workbook) {
        throw new Error("워크북 객체가 생성되지 않았습니다.");
      }

      // 워크북 속성 초기화 (Excel 호환성)
      initializeWorkbookProperties(workbook);

      // 워크시트 가져오기
      let originalSheetName = templateData.worksheetName;
      let hasOriginalWorksheet = false;
      let tempWorksheet: ExcelJS.Worksheet | undefined = undefined;

      // 워크시트가 있는 경우
      if (workbook.worksheets.length > 0) {
        // 워크시트 이름이 지정되어 있으면 해당 워크시트 사용
        if (originalSheetName) {
          const foundWorksheet = workbook.getWorksheet(originalSheetName);
          if (foundWorksheet) {
            tempWorksheet = foundWorksheet;
          }
        }

        // 워크시트를 찾지 못했으면 첫 번째 워크시트 사용
        if (!tempWorksheet && workbook.worksheets.length > 0) {
          tempWorksheet = workbook.worksheets[0];
          originalSheetName = tempWorksheet.name;
        }

        hasOriginalWorksheet = true;
      } else {
        // 워크시트가 없으면 새로 생성 (원본 파일이 손상되었을 수 있음)
        console.warn(
          "원본 파일에 워크시트가 없습니다. 새 워크시트를 생성합니다."
        );
        tempWorksheet = workbook.addWorksheet(originalSheetName || "Sheet1");
        hasOriginalWorksheet = false;
      }

      // 워크시트가 여전히 undefined인 경우 에러
      if (!tempWorksheet) {
        throw new Error("워크시트를 생성할 수 없습니다.");
      }

      worksheet = tempWorksheet;

      // 원본 워크시트가 있는 경우 - 원본 파일을 그대로 사용하고 값만 업데이트
      if (hasOriginalWorksheet) {
        // 헤더 행이 없으면 생성
        if (worksheet.rowCount === 0) {
          worksheet.addRow(columnOrder);
        }

        // 헤더 행의 원본 셀 객체를 직접 저장 (데이터 삭제 전에 미리 저장)
        const headerRow = worksheet.getRow(1);
        const headerRowHeight = headerRow?.height;
        const headerCells: {[colNumber: number]: ExcelJS.Cell} = {};

        if (headerRow) {
          headerRow.eachCell({includeEmpty: true}, (cell, colNumber) => {
            // 원본 셀 객체를 직접 저장
            headerCells[colNumber] = cell;
          });
        }

        // 원본 데이터 행의 셀 객체 저장 (2행이 있으면 사용)
        // 데이터 행 삭제 전에 미리 저장해야 참조가 유효함
        const dataRowHeight =
          worksheet.rowCount > 1 ? worksheet.getRow(2).height : undefined;
        const dataCells: {[colNumber: number]: ExcelJS.Cell} = {};

        if (worksheet.rowCount > 1) {
          const originalDataRow = worksheet.getRow(2);
          if (originalDataRow) {
            originalDataRow.eachCell(
              {includeEmpty: true},
              (cell, colNumber) => {
                // 원본 셀 객체를 저장 (데이터 삭제 전이므로 참조가 유효함)
                dataCells[colNumber] = cell;
              }
            );
          }
        }

        // 원본 열 너비 저장
        const columnWidths: {[key: number]: number} = {};
        worksheet.columns.forEach((column, index) => {
          if (column.width) {
            columnWidths[index + 1] = column.width;
          }
        });

        // 기존 데이터 행 삭제 (헤더 행 제외)
        const lastRow = worksheet.rowCount;
        if (lastRow > 1) {
          for (let rowNum = lastRow; rowNum > 1; rowNum--) {
            try {
              worksheet.spliceRows(rowNum, 1);
            } catch (e) {
              const row = worksheet.getRow(rowNum);
              if (row) {
                row.eachCell({includeEmpty: true}, (cell) => {
                  cell.value = null;
                });
              }
            }
          }
        }

        // 헤더 행 높이 복사
        if (headerRowHeight) {
          worksheet.getRow(1).height = headerRowHeight;
        }

        // 헤더 행 업데이트 - 원본 셀을 직접 사용하고 값만 업데이트
        columnOrder.forEach((header: string, colIdx: number) => {
          const colNumber = colIdx + 1;

          // 원본 셀이 있으면 그대로 사용하고 값만 업데이트
          if (headerCells[colNumber]) {
            const originalCell = headerCells[colNumber];
            // 원본 셀의 값만 업데이트하면 스타일은 그대로 유지됨
            originalCell.value = prepareExcelCellValue(header, false);
          } else {
            // 원본 셀이 없으면 새로 생성
            const cell = worksheet.getCell(1, colNumber);
            cell.value = prepareExcelCellValue(header, false);
          }
        });

        // 열 너비 복사
        Object.keys(columnWidths).forEach((colNumStr) => {
          const colNum = parseInt(colNumStr);
          if (colNum <= columnOrder.length) {
            worksheet.getColumn(colNum).width = columnWidths[colNum];
          }
        });

        // 새 데이터 추가 - 원본 셀 스타일 복사
        excelData.forEach((rowData, rowIdx) => {
          const rowNumber = rowIdx + 2; // 헤더 다음 행부터
          const row = worksheet.getRow(rowNumber);

          // 행 높이 복사
          if (dataRowHeight) {
            row.height = dataRowHeight;
          }

          rowData.forEach((cellValue: any, colIdx: number) => {
            const colNumber = colIdx + 1;
            const cell = row.getCell(colNumber);

            // 원본 데이터 행 셀의 스타일 복사 (없으면 헤더 셀 스타일 사용)
            const sourceCell = dataCells[colNumber] || headerCells[colNumber];
            if (sourceCell) {
              copyCellStyle(sourceCell, cell);
            }

            // 값 설정 - cellValue는 이미 mapDataToTemplate에서 정규화되었지만
            // 혹시 모를 경우를 대비해 최종 검증
            const normalizedValue = prepareExcelCellValue(cellValue, false);
            cell.value = normalizedValue;

            // 전화번호 컬럼은 텍스트 포맷으로 설정 (앞자리 0 유지)
            const headerName = columnOrder[colIdx] || "";
            const isPhoneColumn =
              headerName.includes("전화") ||
              headerName.includes("전번") ||
              headerName.includes("핸드폰") ||
              headerName.includes("휴대폰") ||
              headerName.includes("연락처");

            if (isPhoneColumn) {
              cell.numFmt = "@"; // 텍스트 포맷
            } else if (typeof normalizedValue === "number") {
              // 숫자 포맷 명시적 설정 (Excel에서 텍스트로 인식되는 문제 방지)
              cell.numFmt = "0"; // 정수 형식
            }
          });
        });
      } else {
        // 원본 워크시트가 없으면 헤더 행만 업데이트
        if (worksheet.rowCount === 0) {
          const normalizedHeaders = columnOrder.map((h: any) =>
            prepareExcelCellValue(h, false)
          );
          worksheet.addRow(normalizedHeaders);
        } else {
          columnOrder.forEach((header: string, colIdx: number) => {
            const colNumber = colIdx + 1;
            const cell = worksheet.getCell(1, colNumber);
            cell.value = prepareExcelCellValue(header, false);
          });
        }

        // 헤더 행 스타일 적용
        const headerRow = worksheet.getRow(1);
        applyHeaderStyle(headerRow, columnOrder, templateData.columnWidths);

        // 데이터 행 추가 (값 정규화)
        excelData.forEach((rowData) => {
          const normalizedRowData = rowData.map((cellValue: any) => {
            const normalized = prepareExcelCellValue(cellValue, false);
            return normalized;
          });
          const addedRow = worksheet.addRow(normalizedRowData);

          // 숫자 셀 및 전화번호 셀에 대한 포맷 설정
          addedRow.eachCell({includeEmpty: true}, (cell, colNumber) => {
            const headerName = columnOrder[colNumber - 1] || "";
            const isPhoneColumn =
              headerName.includes("전화") ||
              headerName.includes("전번") ||
              headerName.includes("핸드폰") ||
              headerName.includes("휴대폰") ||
              headerName.includes("연락처");

            if (isPhoneColumn) {
              cell.numFmt = "@"; // 텍스트 포맷
            } else if (typeof cell.value === "number") {
              cell.numFmt = "0";
            }
          });
        });
      }
    } else {
      // 원본 파일이 없으면 새로 생성
      worksheet = workbook.addWorksheet("Sheet1");

      // 헤더 행 추가 (값 정규화)
      const normalizedHeaders = columnOrder.map((h: any) =>
        prepareExcelCellValue(h, false)
      );
      worksheet.addRow(normalizedHeaders);

      // 헤더 행 스타일 적용
      const headerRow = worksheet.getRow(1);
      applyHeaderStyle(headerRow, columnOrder, templateData.columnWidths);

      // 데이터 행 추가 (값 정규화)
      excelData.forEach((rowData) => {
        const normalizedRowData = rowData.map((cellValue: any) =>
          prepareExcelCellValue(cellValue, false)
        );
        const addedRow = worksheet.addRow(normalizedRowData);

        // 숫자 셀 및 전화번호 셀에 대한 포맷 설정
        addedRow.eachCell({includeEmpty: true}, (cell, colNumber) => {
          const headerName = columnOrder[colNumber - 1] || "";
          const isPhoneColumn =
            headerName.includes("전화") ||
            headerName.includes("전번") ||
            headerName.includes("핸드폰") ||
            headerName.includes("휴대폰") ||
            headerName.includes("연락처");

          if (isPhoneColumn) {
            cell.numFmt = "@"; // 텍스트 포맷
          } else if (typeof cell.value === "number") {
            cell.numFmt = "0";
          }
        });
      });

      // 새 워크북의 속성 초기화 (Excel 호환성)
      initializeWorkbookProperties(workbook);
    }

    // 워크북이 제대로 초기화되었는지 확인
    if (!workbook) {
      throw new Error("워크북이 초기화되지 않았습니다.");
    }

    if (!workbook.xlsx) {
      throw new Error("워크북의 xlsx 모듈이 없습니다.");
    }

    // 워크시트가 있는지 확인
    if (!worksheet) {
      throw new Error("워크시트가 없습니다.");
    }

    // 워크북을 Excel 호환 모드로 완전히 정리
    prepareWorkbookForExcel(workbook, {
      removeFormulas: false, // 수식은 유지 (필요시 true로 변경)
      removeDataValidations: false, // 데이터 검증은 유지
    });

    // 엑셀 파일 생성
    let buffer: ArrayBuffer;
    try {
      const writeBuffer = await workbook.xlsx.writeBuffer();
      buffer = writeBuffer as ArrayBuffer;
    } catch (writeError: any) {
      console.error("엑셀 파일 생성 실패:", writeError);
      console.error("워크북 상태:", {
        hasProperties: !!workbook.properties,
        hasCalcProperties: !!(workbook as any).calcProperties,
        worksheetCount: workbook.worksheets.length,
      });
      throw new Error(`엑셀 파일을 생성할 수 없습니다: ${writeError.message}`);
    }

    // 파일명 생성
    const dateStr = new Date().toISOString().split("T")[0];
    const baseName = (templateData.name || "download").toString().trim();
    const fileName = `${dateStr}_${baseName}.xlsx`;

    // Windows에서 한글 파일명 깨짐 방지를 위한 RFC 5987 형식 인코딩
    // HTTP 헤더는 ASCII만 허용하므로 filename에는 ASCII fallback 추가
    const asciiFallbackBase =
      `${dateStr}_${baseName}`
        .replace(/[^\x00-\x7F]/g, "")
        .replace(/\s+/g, "_") || "download";
    const safeFileName = `${asciiFallbackBase}.xlsx`; // ASCII fallback
    const encodedFileName = encodeURIComponent(fileName); // UTF-8 인코딩
    // filename* 우선, filename ASCII fallback 병행
    const contentDisposition = `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`;

    // 헤더를 Headers 객체로 직접 설정하여 파싱 문제 방지
    const responseHeaders = new Headers();
    responseHeaders.set(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    // ASCII만 포함된 헤더 값 사용
    responseHeaders.set("Content-Disposition", contentDisposition);

    // Response 객체를 직접 사용하여 헤더 설정
    return new Response(buffer, {
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("엑셀 다운로드 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
