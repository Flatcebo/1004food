import ExcelJS from "exceljs";

/**
 * 내주 발주서 엑셀 양식 생성
 * @param headers 헤더 배열
 * @param columnOrder 컬럼 순서 배열
 * @param columnWidths 컬럼 너비 객체 (헤더명 -> 너비)
 * @param excelData 데이터 배열 (2차원 배열)
 * @param worksheetName 워크시트 이름
 * @param columnOffset 열 오프셋 (기본값 0, A, B열 추가 시 2)
 */
export function createInhouseTemplate(
  headers: string[],
  columnOrder: string[],
  columnWidths: {[key: string]: number},
  excelData: any[][],
  worksheetName: string = "Sheet1",
  columnOffset: number = 0
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(worksheetName);

  // 헤더 행 추가
  const headerRow = worksheet.addRow(headers);
  // 헤더의 높이값 지정
  headerRow.height = 30.75;

  // 각 헤더 cell에 스타일 지정
  headerRow.eachCell((cell, colNum) => {
    // 오프셋을 고려한 실제 열 번호 계산 (내주 발주서 헤더 기준)
    const inhouseColNum = colNum - columnOffset;
    
    // 배경색 설정 (열별로 다르게)
    let bgColor = "ffffffff"; // 기본 흰색

    // 오프셋이 있는 경우 (A, B열 추가된 경우) 내주 발주서 헤더 열 번호로 계산
    if (columnOffset > 0 && inhouseColNum <= 0) {
      // A, B열은 기본 흰색 (운송장 다운로드에서 별도 처리)
      bgColor = "ffffffff";
    } else if ([1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 15, 16, 17].includes(inhouseColNum)) {
      // A~G열(1-7), J~L열(10-12), O~Q열(15-17): 노란색
      bgColor = "fffffd01";
    } else if (inhouseColNum === 14) {
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
  });

  // 열 너비 설정
  headers.forEach((headerName: string, index: number) => {
    const colNum = index + 1;
    const width =
      typeof columnWidths === "object" && columnWidths[headerName]
        ? columnWidths[headerName]
        : 15;
    worksheet.getColumn(colNum).width = width;
  });

  // 데이터 행 추가
  excelData.forEach((rowDatas, rowIndex) => {
    const appendRow = worksheet.addRow(rowDatas);

    // 전화번호, 우편번호, 코드 관련 필드는 텍스트 형식으로 설정 (앞자리 0 유지)
    appendRow.eachCell((cell: any, colNum: any) => {
      const headerName = headers[colNum - 1];
      const normalizedHeader =
        headerName?.replace(/\s+/g, "").toLowerCase() || "";

      const isTextColumn =
        normalizedHeader.includes("전화") ||
        normalizedHeader.includes("연락") ||
        normalizedHeader.includes("우편") ||
        normalizedHeader.includes("코드");

      if (isTextColumn) {
        cell.numFmt = "@"; // 텍스트 형식
      }

      // 테두리 설정
      cell.border = {
        top: {style: "thin", color: {argb: "ff000000"}},
        left: {style: "thin", color: {argb: "ff000000"}},
        bottom: {style: "thin", color: {argb: "ff000000"}},
        right: {style: "thin", color: {argb: "ff000000"}},
      };

      // 정렬 설정 (기본 왼쪽 정렬)
      cell.alignment = {
        vertical: "middle",
        horizontal: "left",
      };
    });
  });

  return workbook;
}
