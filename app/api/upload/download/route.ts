import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import ExcelJS from "exceljs";
import {mapDataToTemplate, sortExcelData} from "@/utils/excelDataMapping";
import {copyCellStyle, applyHeaderStyle} from "@/utils/excelStyles";

// 템플릿 양식으로 엑셀 다운로드
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {templateId, rowIds} = body;

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
    const headers = templateData.headers || [];
    const columnOrder = templateData.columnOrder || headers;

    // 선택된 행 데이터 조회
    let rows: any[] = [];
    if (rowIds && rowIds.length > 0) {
      const rowData = await sql`
        SELECT row_data
        FROM upload_rows
        WHERE id = ANY(${rowIds})
      `;
      rows = rowData.map((r: any) => r.row_data);
    } else {
      // 모든 데이터 조회
      const allData = await sql`
        SELECT row_data
        FROM upload_rows
        ORDER BY id DESC
      `;
      rows = allData.map((r: any) => r.row_data);
    }

    // 템플릿 헤더 순서에 맞게 데이터 재구성
    let excelData = rows.map((row) => {
      return columnOrder.map((header: string) => {
        return mapDataToTemplate(row, header);
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

      // 워크북 properties 초기화 (필요한 경우)
      if (!workbook.properties) {
        workbook.properties = {
          date1904: false,
        };
      } else if (workbook.properties.date1904 === undefined) {
        workbook.properties.date1904 = false;
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
    } else if ((workbook as any).calcProperties.fullCalcOnLoad === undefined) {
      (workbook as any).calcProperties.fullCalcOnLoad = false;
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
      throw new Error(`엑셀 파일을 생성할 수 없습니다: ${writeError.message}`);
    }

    // 파일명 생성
    const fileName = `${templateData.name || "download"}_${
      new Date().toISOString().split("T")[0]
    }.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(
          fileName
        )}"`,
      },
    });
  } catch (error: any) {
    console.error("엑셀 다운로드 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
