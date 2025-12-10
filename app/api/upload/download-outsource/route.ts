import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import ExcelJS from "exceljs";
import {mapDataToTemplate, sortExcelData} from "@/utils/excelDataMapping";
import {copyCellStyle, applyHeaderStyle} from "@/utils/excelStyles";
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
        // 원본 파일 로드
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
          throw new Error(
            `원본 파일을 로드할 수 없습니다: ${loadError.message}`
          );
        }

        // 워크북이 제대로 로드되었는지 확인
        if (!workbook) {
          throw new Error("워크북 객체가 생성되지 않았습니다.");
        }

        // 워크북 properties 초기화 (필요한 경우)
        if (!workbook.properties) {
          workbook.properties = {
            date1904: false,
          };
        } else if (workbook.properties.date1904 === undefined) {
          workbook.properties.date1904 = false;
        }

        // 테마 관련 속성 제거 (복구 알림 방지)
        try {
          const model = (workbook as any).model;
          if (model) {
            // 테마 관련 속성 제거
            if (model.theme) {
              delete model.theme;
            }
            if (model.themeManager) {
              delete model.themeManager;
            }
            // 스타일 테마 제거
            if (model.styles && model.styles.themes) {
              delete model.styles.themes;
            }
          }
        } catch (themeError) {
          // 테마 제거 실패는 무시 (필수 아님)
          console.warn("테마 제거 중 오류 (무시됨):", themeError);
        }

        // calcProperties 초기화 (fullCalcOnLoad 에러 방지)
        if (!(workbook as any).calcProperties) {
          (workbook as any).calcProperties = {
            fullCalcOnLoad: false,
          };
        } else if (
          (workbook as any).calcProperties.fullCalcOnLoad === undefined
        ) {
          (workbook as any).calcProperties.fullCalcOnLoad = false;
        }

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
              originalCell.value = header;
            } else {
              // 원본 셀이 없으면 새로 생성
              const cell = worksheet.getCell(1, colNumber);
              cell.value = header;
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

              // 값 설정
              cell.value = cellValue;
            });
          });
        } else {
          // 원본 워크시트가 없으면 헤더 행만 업데이트
          if (worksheet.rowCount === 0) {
            worksheet.addRow(columnOrder);
          } else {
            columnOrder.forEach((header: string, colIdx: number) => {
              const colNumber = colIdx + 1;
              const cell = worksheet.getCell(1, colNumber);
              cell.value = header;
            });
          }

          // 헤더 행 스타일 적용
          const headerRow = worksheet.getRow(1);
          applyHeaderStyle(headerRow, columnOrder, templateData.columnWidths);

          // 데이터 행 추가
          excelData.forEach((rowData) => {
            worksheet.addRow(rowData);
          });
        }
      } else {
        // 원본 파일이 없으면 새로 생성
        worksheet = workbook.addWorksheet("Sheet1");

        // 헤더 행 추가
        worksheet.addRow(columnOrder);

        // 헤더 행 스타일 적용
        const headerRow = worksheet.getRow(1);
        applyHeaderStyle(headerRow, columnOrder, templateData.columnWidths);

        // 데이터 행 추가
        excelData.forEach((rowData) => {
          worksheet.addRow(rowData);
        });

        // 새 워크북의 properties 초기화
        if (!workbook.properties) {
          workbook.properties = {
            date1904: false,
          };
        }

        // calcProperties 초기화
        const workbookModel = (workbook as any).model;
        if (workbookModel && !workbookModel.calcProperties) {
          workbookModel.calcProperties = {
            fullCalcOnLoad: false,
          };
        }
        if (!(workbook as any).calcProperties) {
          (workbook as any).calcProperties = {
            fullCalcOnLoad: false,
          };
        }
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

      // properties 초기화
      if (!workbook.properties) {
        workbook.properties = {
          date1904: false,
        };
      } else if (workbook.properties.date1904 === undefined) {
        workbook.properties.date1904 = false;
      }

      // calcProperties 초기화 (fullCalcOnLoad 에러 방지)
      // ExcelJS의 내부 모델 구조 확인
      const workbookModel = (workbook as any).model;
      if (workbookModel) {
        if (!workbookModel.calcProperties) {
          workbookModel.calcProperties = {
            fullCalcOnLoad: false,
          };
        } else if (workbookModel.calcProperties.fullCalcOnLoad === undefined) {
          workbookModel.calcProperties.fullCalcOnLoad = false;
        }
      }

      // 최상위 calcProperties도 확인
      if (!(workbook as any).calcProperties) {
        (workbook as any).calcProperties = {
          fullCalcOnLoad: false,
        };
      } else if (
        (workbook as any).calcProperties.fullCalcOnLoad === undefined
      ) {
        (workbook as any).calcProperties.fullCalcOnLoad = false;
      }

      // 워크북 저장 전 최종 정리 (테마 관련 속성 제거 - 복구 알림 방지)
      try {
        const model = (workbook as any).model;
        if (model) {
          // 테마 관련 속성 제거
          if (model.theme) {
            delete model.theme;
          }
          if (model.themeManager) {
            delete model.themeManager;
          }
          // 스타일 테마 제거
          if (model.styles && model.styles.themes) {
            delete model.styles.themes;
          }
          // 워크북 테마 속성 제거
          if (model.workbook && model.workbook.theme) {
            delete model.workbook.theme;
          }
          // Named ranges 제거 (XML 오류 방지)
          if (model.definedNames) {
            delete model.definedNames;
          }
          if (model.workbook && model.workbook.definedNames) {
            delete model.workbook.definedNames;
          }
        }
        // 최상위 definedNames 제거
        if ((workbook as any).definedNames) {
          (workbook as any).definedNames = {};
        }
      } catch (cleanupError) {
        // 정리 실패는 무시
        console.warn("워크북 정리 중 오류 (무시됨):", cleanupError);
      }

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
        throw new Error(
          `엑셀 파일을 생성할 수 없습니다: ${writeError.message}`
        );
      }

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
