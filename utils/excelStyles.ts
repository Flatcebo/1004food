import ExcelJS from "exceljs";

// Excel 스타일 관련 상수
export const EXCEL_STYLE_CONSTANTS = {
  yellowColumns: [1, 2, 3, 4, 5, 6, 7, 10, 11, 12],
  redColumns: [14],
  borderColumns: Array.from({length: 17}, (_, i) => i + 1),
  yellowColor: "FFFFFD01",
  redColor: "FFFF0000",
} as const;

// 셀 스타일 복사 함수 - 모든 스타일 속성을 완전히 복사
export function copyCellStyle(
  sourceCell: ExcelJS.Cell,
  targetCell: ExcelJS.Cell
): void {
  if (!sourceCell || !targetCell) return;

  const sourceStyle = sourceCell.style;
  if (!sourceStyle) return;

  // 스타일을 직접 할당하는 방식으로 변경 (더 안정적)
  try {
    // fill (배경색) 복사
    if (sourceStyle.fill) {
      targetCell.fill = JSON.parse(JSON.stringify(sourceStyle.fill));
    }

    // font (폰트) 복사 - 크기, 색상, 굵기, 기울임, 밑줄 등
    if (sourceStyle.font) {
      targetCell.font = JSON.parse(JSON.stringify(sourceStyle.font));
    }

    // alignment (정렬) 복사
    if (sourceStyle.alignment) {
      targetCell.alignment = JSON.parse(JSON.stringify(sourceStyle.alignment));
    }

    // border (테두리) 복사
    if (sourceStyle.border) {
      targetCell.border = JSON.parse(JSON.stringify(sourceStyle.border));
    }

    // numFmt (숫자 형식) 복사
    if (sourceStyle.numFmt !== undefined && sourceStyle.numFmt !== null) {
      targetCell.numFmt = sourceStyle.numFmt;
    }

    // protection (보호) 복사
    if (sourceStyle.protection) {
      targetCell.protection = JSON.parse(JSON.stringify(sourceStyle.protection));
    }
  } catch (e) {
    console.error("스타일 복사 중 오류:", e);
    // 복사 실패 시 직접 할당 시도
    try {
      targetCell.style = sourceStyle;
    } catch (e2) {
      console.error("스타일 직접 할당 실패:", e2);
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

