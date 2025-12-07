import ExcelJS from "exceljs";

// Excel 스타일 관련 상수
export const EXCEL_STYLE_CONSTANTS = {
  yellowColumns: [1, 2, 3, 4, 5, 6, 7, 10, 11, 12],
  redColumns: [14],
  borderColumns: Array.from({length: 17}, (_, i) => i + 1),
  yellowColor: "FFFFFD01",
  redColor: "FFFF0000",
} as const;

// 셀 스타일 복사 함수
export function copyCellStyle(
  sourceCell: ExcelJS.Cell,
  targetCell: ExcelJS.Cell
): void {
  if (!sourceCell.style) return;

  const sourceStyle = sourceCell.style as any;

  // fill (배경색) 복사
  if (sourceStyle.fill) {
    try {
      targetCell.style.fill = JSON.parse(JSON.stringify(sourceStyle.fill));
    } catch (e) {
      targetCell.style.fill = sourceStyle.fill;
    }
  }

  // font 복사
  if (sourceStyle.font) {
    try {
      targetCell.style.font = JSON.parse(JSON.stringify(sourceStyle.font));
    } catch (e) {
      targetCell.style.font = sourceStyle.font;
    }
  }

  // alignment 복사
  if (sourceStyle.alignment) {
    try {
      targetCell.style.alignment = JSON.parse(
        JSON.stringify(sourceStyle.alignment)
      );
    } catch (e) {
      targetCell.style.alignment = sourceStyle.alignment;
    }
  }

  // border 복사
  if (sourceStyle.border) {
    try {
      targetCell.style.border = JSON.parse(JSON.stringify(sourceStyle.border));
    } catch (e) {
      targetCell.style.border = sourceStyle.border;
    }
  }

  // numFmt 복사
  if (sourceStyle.numFmt !== undefined) {
    targetCell.style.numFmt = sourceStyle.numFmt;
  }

  // protection 복사
  if (sourceStyle.protection) {
    try {
      targetCell.style.protection = JSON.parse(
        JSON.stringify(sourceStyle.protection)
      );
    } catch (e) {
      targetCell.style.protection = sourceStyle.protection;
    }
  }
}

// 헤더 행에 기본 스타일 적용
export function applyHeaderStyle(
  headerRow: ExcelJS.Row,
  columnOrder: string[],
  columnWidths?: {[key: string]: number}
): void {
  columnOrder.forEach((header: string, colIdx: number) => {
    const colNumber = colIdx + 1;
    const cell = headerRow.getCell(colNumber);

    // 배경색 설정
    if (EXCEL_STYLE_CONSTANTS.yellowColumns.includes(colNumber as any)) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: {argb: EXCEL_STYLE_CONSTANTS.yellowColor},
      } as ExcelJS.Fill;
    } else if (EXCEL_STYLE_CONSTANTS.redColumns.includes(colNumber as any)) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: {argb: EXCEL_STYLE_CONSTANTS.redColor},
      } as ExcelJS.Fill;
    }

    // 테두리 설정
    if (EXCEL_STYLE_CONSTANTS.borderColumns.includes(colNumber)) {
      cell.border = {
        top: {style: "thin"},
        left: {style: "thin"},
        bottom: {style: "thin"},
        right: {style: "thin"},
      } as ExcelJS.Borders;
    }

    // 폰트 설정: 10px, bold
    cell.font = {
      size: 10,
      bold: true,
    } as ExcelJS.Font;
  });

  // 열 너비 설정 (템플릿에 저장된 너비 사용)
  if (columnWidths) {
    columnOrder.forEach((header: string, idx: number) => {
      const colNumber = idx + 1;
      const width = columnWidths[header] || 15;
      headerRow.worksheet.getColumn(colNumber).width = width;
    });
  }
}

