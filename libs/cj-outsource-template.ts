import ExcelJS from "exceljs";

/**
 * CJ외주 발주서 엑셀 양식 생성
 */
export function createCJOutsourceTemplate(
  columnOrder: string[],
  excelData: any[][],
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Sheet1");

  // 전체 텍스트 사이즈 14
  const defaultFontSize = 14;

  // ===== 1행 설정 (헤더) =====
  const row1 = worksheet.getRow(1);
  row1.height = 36;

  // 헤더 순서: 보내는 분, 전화번호, 주소, 받는사람, 전화번호1, 전화번호2, 우편번호, 주소, 수량, 상품명, 배송메시지, 박스, 업체명
  // 열 너비 설정
  const columnWidths: {[key: number]: number} = {
    1: 17.5, // A: 보내는 분
    2: 19, // B: 전화번호
    3: 5.25, // C: 주소 (첫번째)
    4: 17.75, // D: 받는사람
    5: 17.38, // E: 전화번호1
    6: 5.25, // F: 전화번호2
    7: 4.5, // G: 우편번호
    8: 102.75, // H: 주소 (두번째)
    9: 7.5, // I: 수량
    10: 24.38, // J: 상품명
    11: 22.38, // K: 배송메시지
    12: 21.88, // L: 박스
    13: 11, // M: 업체명
  };

  // 열 너비 적용
  Object.keys(columnWidths).forEach((colNumStr) => {
    const colNum = parseInt(colNumStr);
    worksheet.getColumn(colNum).width = columnWidths[colNum];
  });

  // 헤더 행 설정
  columnOrder.forEach((header: string, colIdx: number) => {
    const colNumber = colIdx + 1;
    const cell = worksheet.getCell(1, colNumber);
    cell.value = header || "";

    // 기본 폰트 설정
    // A ~ H 볼드, 상품명(J), 배송메시지(K), 박스(L)는 볼드 해제
    const isBold =
      colNumber <= 8 && // A ~ H 볼드
      colNumber !== 10 && // J: 상품명 볼드 해제
      colNumber !== 11 && // K: 배송메시지 볼드 해제
      colNumber !== 12; // L: 박스 볼드 해제
    cell.font = {
      size: defaultFontSize,
      bold: isBold,
    };

    // 헤더 배경색 설정
    // A, B, L 노란 배경색
    if (colNumber === 1 || colNumber === 2 || colNumber === 12) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: {argb: "FFFFFF00"}, // 노란색
      };
    }
    // C ~ K, M 배경 #daeef3
    else if ((colNumber >= 3 && colNumber <= 11) || colNumber === 13) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: {argb: "FFDAEEF3"}, // #daeef3
      };
    }

    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
    };

    // 검정색 점선 테두리
    cell.border = {
      top: {style: "dashed", color: {argb: "FF000000"}},
      left: {style: "dashed", color: {argb: "FF000000"}},
      bottom: {style: "dashed", color: {argb: "FF000000"}},
      right: {style: "dashed", color: {argb: "FF000000"}},
    };
  });

  // ===== 데이터 행 추가 =====
  excelData.forEach((rowData, rowIdx) => {
    const rowNumber = rowIdx + 2; // 헤더 다음 행부터
    const row = worksheet.getRow(rowNumber);
    // 데이터 행 높이 설정 (조금 더 크게)
    row.height = 26;

    rowData.forEach((cellValue: any, colIdx: number) => {
      const colNumber = colIdx + 1;
      const cell = row.getCell(colNumber);

      // 값 설정
      cell.value = cellValue || "";

      // 기본 폰트 설정
      cell.font = {
        size: defaultFontSize,
      };

      // A ~ B, L 열 모두 배경 노란색
      if (colNumber === 1 || colNumber === 2 || colNumber === 12) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: {argb: "FFFFFF00"}, // 노란색
        };
      }
      // G ~ K, M 열 모두 배경 #daeef3
      else if ((colNumber >= 7 && colNumber <= 11) || colNumber === 13) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: {argb: "FFDAEEF3"}, // #daeef3
        };
      }

      // F열인 전화번호2 헤더 제외 셀 전부 빨간 텍스트
      if (colNumber === 6 && rowNumber > 1) {
        // 헤더가 아닌 데이터 행인 경우 - 기존 폰트 설정에 색상 추가
        cell.font = {
          ...cell.font,
          color: {argb: "FFFF0000"}, // 빨간색
        };
      }

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
      } else if (typeof cellValue === "number") {
        // 숫자 포맷 명시적 설정
        cell.numFmt = "0"; // 정수 형식
      }

      // 상품명(J), 배송메시지(K), 주소(C, H) 중앙 정렬
      const isCenterAlignColumn =
        colNumber === 3 || // C: 주소 (첫번째)
        colNumber === 8 || // H: 주소 (두번째)
        colNumber === 10 || // J: 상품명
        colNumber === 11; // K: 배송메시지

      cell.alignment = {
        vertical: "middle",
        horizontal: isCenterAlignColumn ? "center" : "left",
      };

      // 검정색 점선 테두리
      cell.border = {
        top: {style: "dashed", color: {argb: "FF000000"}},
        left: {style: "dashed", color: {argb: "FF000000"}},
        bottom: {style: "dashed", color: {argb: "FF000000"}},
        right: {style: "dashed", color: {argb: "FF000000"}},
      };
    });
  });

  // 1행 헤더 고정 (sticky/fixed)
  worksheet.views = [
    {
      state: "frozen",
      ySplit: 1, // 1행까지 고정
      topLeftCell: "A2", // 스크롤 시작 위치를 A2로 설정
      activeCell: "A2",
    },
  ];

  // 열 번호를 Excel 열 문자로 변환하는 함수 (1 -> A, 2 -> B, ..., 26 -> Z, 27 -> AA)
  const getColumnLetter = (colNumber: number): string => {
    let result = "";
    while (colNumber > 0) {
      colNumber--;
      result = String.fromCharCode(65 + (colNumber % 26)) + result;
      colNumber = Math.floor(colNumber / 26);
    }
    return result;
  };

  // 1행 헤더에 자동 필터 추가
  const lastColumn = getColumnLetter(columnOrder.length);
  worksheet.autoFilter = {
    from: "A1",
    to: `${lastColumn}1`,
  };

  return workbook;
}
