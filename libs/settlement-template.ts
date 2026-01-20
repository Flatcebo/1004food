import ExcelJS from "exceljs";

export interface SettlementOrderData {
  sabangName: string; // 사방넷명
  quantity: number; // 수량
  unitPrice: number; // 객단가 (공급가 또는 행사가)
  amount: number; // 금액 (수량 * 객단가)
  billType: "과세" | "면세"; // 과세/면세
  mappingCode: string; // 매핑코드 (중복 제거용)
}

export interface SettlementSummary {
  totalAmount: number; // 총금액
  taxableAmount: number; // 과세 금액
  taxFreeAmount: number; // 면세 금액
}

export interface SettlementTemplateProps {
  mallName: string; // 쇼핑몰명
  date: string; // 날짜 (YYYY-MM-DD 형식)
  orders: SettlementOrderData[]; // 주문 데이터
  summary: SettlementSummary; // 합계 정보
}

/**
 * 정산서 엑셀 양식 생성
 */
export function createSettlementTemplate(
  props: SettlementTemplateProps
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("정산서");

  const {mallName, date, orders, summary} = props;

  // 날짜 포맷팅 (YYYY-MM-DD -> YYYY-월-일)
  const formattedDate = date; // 년-월-일 형식 유지

  // ===== 1행 설정 =====
  const row1 = worksheet.getRow(1);
  row1.height = 45;

  // A1: 오늘 년-월-일 (우측 정렬)
  const cellA1 = worksheet.getCell("A1");
  cellA1.value = formattedDate;
  cellA1.font = {bold: true, size: 20, color: {argb: "FF808080"}};
  cellA1.alignment = {vertical: "middle", horizontal: "right"};

  // B1~D1: 병합 및 쇼핑몰명 정산서
  worksheet.mergeCells("B1:D1");
  const cellB1 = worksheet.getCell("B1");
  cellB1.value = `${mallName} 정산서`;
  cellB1.font = {bold: true, size: 20, color: {argb: "FF808080"}};
  cellB1.alignment = {vertical: "middle", horizontal: "left"};

  // F1: 총금액 (빨간 텍스트, 볼드, 배경색 #f3dcdb)
  const cellF1 = worksheet.getCell("F1");
  cellF1.value = "총금액";
  cellF1.font = {bold: true, color: {argb: "FFFF0000"}};
  cellF1.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {argb: "FFF3DCDB"},
  };
  cellF1.alignment = {vertical: "middle", horizontal: "left"};

  // G1: 총금액 값 (배경색 #f3dcdb, 우측 정렬, 빨간 텍스트, 볼드)
  const cellG1 = worksheet.getCell("G1");
  cellG1.value = summary.totalAmount;
  cellG1.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {argb: "FFF3DCDB"},
  };
  cellG1.font = {bold: true, color: {argb: "FFFF0000"}};
  cellG1.alignment = {vertical: "middle", horizontal: "right"};
  cellG1.numFmt = "#,##0";

  // F2: 과세 (빨간 텍스트, 볼드, 배경색 #f3dcdb)
  const cellF2 = worksheet.getCell("F2");
  cellF2.value = "과세";
  cellF2.font = {bold: true, color: {argb: "FFFF0000"}};
  cellF2.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {argb: "FFF3DCDB"},
  };
  cellF2.alignment = {vertical: "middle", horizontal: "left"};

  // G2: 과세 금액 (배경색 #f3dcdb, 우측 정렬, 빨간 텍스트, 볼드)
  const cellG2 = worksheet.getCell("G2");
  cellG2.value = summary.taxableAmount;
  cellG2.font = {bold: true, color: {argb: "FFFF0000"}};
  cellG2.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {argb: "FFF3DCDB"},
  };
  cellG2.alignment = {vertical: "middle", horizontal: "right"};
  cellG2.numFmt = "#,##0";

  // F3: 면세 (빨간 텍스트, 볼드, 배경색 #f3dcdb)
  const cellF3 = worksheet.getCell("F3");
  cellF3.value = "면세";
  cellF3.font = {bold: true, color: {argb: "FFFF0000"}};
  cellF3.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {argb: "FFF3DCDB"},
  };
  cellF3.alignment = {vertical: "middle", horizontal: "left"};

  // G3: 면세 금액 (배경색 #f3dcdb, 우측 정렬, 빨간 텍스트, 볼드)
  const cellG3 = worksheet.getCell("G3");
  cellG3.value = summary.taxFreeAmount;
  cellG3.font = {bold: true, color: {argb: "FFFF0000"}};
  cellG3.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {argb: "FFF3DCDB"},
  };
  cellG3.alignment = {vertical: "middle", horizontal: "right"};
  cellG3.numFmt = "#,##0";

  // ===== 2행 설정 (헤더) =====
  const row2 = worksheet.getRow(2);
  
  // A2: 수집상품명 (하얀 텍스트, 볼드, 배경색 #993300, 좌측 정렬)
  const cellA2 = worksheet.getCell("A2");
  cellA2.value = "수집상품명";
  cellA2.font = {bold: true, size: 10, color: {argb: "FFFFFFFF"}};
  cellA2.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {argb: "FF993300"},
  };
  cellA2.alignment = {vertical: "middle", horizontal: "left"};
  cellA2.border = {
    top: {style: "thin", color: {argb: "FF000000"}},
    left: {style: "thin", color: {argb: "FF000000"}},
    bottom: {style: "thin", color: {argb: "FF000000"}},
    right: {style: "thin", color: {argb: "FF000000"}},
  };

  // B2: 수량 (배경색 #993300, 중앙 정렬)
  const cellB2 = worksheet.getCell("B2");
  cellB2.value = "수량";
  cellB2.font = {bold: true, size: 10, color: {argb: "FFFFFFFF"}};
  cellB2.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {argb: "FF993300"},
  };
  cellB2.alignment = {vertical: "middle", horizontal: "center"};
  cellB2.border = {
    top: {style: "thin", color: {argb: "FF000000"}},
    left: {style: "thin", color: {argb: "FF000000"}},
    bottom: {style: "thin", color: {argb: "FF000000"}},
    right: {style: "thin", color: {argb: "FF000000"}},
  };

  // C2: 객단가 (배경색 #993300, 중앙 정렬)
  const cellC2 = worksheet.getCell("C2");
  cellC2.value = "객단가";
  cellC2.font = {bold: true, size: 10, color: {argb: "FFFFFFFF"}};
  cellC2.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {argb: "FF993300"},
  };
  cellC2.alignment = {vertical: "middle", horizontal: "center"};
  cellC2.border = {
    top: {style: "thin", color: {argb: "FF000000"}},
    left: {style: "thin", color: {argb: "FF000000"}},
    bottom: {style: "thin", color: {argb: "FF000000"}},
    right: {style: "thin", color: {argb: "FF000000"}},
  };

  // D2: 금액 (배경색 #993300, 중앙 정렬)
  const cellD2 = worksheet.getCell("D2");
  cellD2.value = "금액";
  cellD2.font = {bold: true, size: 10, color: {argb: "FFFFFFFF"}};
  cellD2.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {argb: "FF993300"},
  };
  cellD2.alignment = {vertical: "middle", horizontal: "center"};
  cellD2.border = {
    top: {style: "thin", color: {argb: "FF000000"}},
    left: {style: "thin", color: {argb: "FF000000"}},
    bottom: {style: "thin", color: {argb: "FF000000"}},
    right: {style: "thin", color: {argb: "FF000000"}},
  };

  // 행 높이를 마지막에 설정하여 다른 설정에 의해 덮어씌워지지 않도록 함
  row2.height = 40;

  // 열 너비 설정
  // ExcelJS의 width는 문자 수 기준 (약 7 픽셀 = 1 문자)
  // 62px ≈ 8.86 문자, 82px ≈ 11.71 문자, 120px ≈ 17.14 문자, 150px ≈ 21.43 문자
  worksheet.getColumn("A").width = 21; // 150px ≈ 21 문자
  worksheet.getColumn("B").width = 15;
  worksheet.getColumn("C").width = 15;
  worksheet.getColumn("D").width = 17; // 120px ≈ 17 문자
  worksheet.getColumn("F").width = 9; // 62px ≈ 9 문자
  worksheet.getColumn("G").width = 12; // 82px ≈ 12 문자

  // ===== 3행부터 주문 데이터 =====
  let currentRow = 3;
  orders.forEach((order) => {
    const row = worksheet.getRow(currentRow);
    row.height = 22;

    // A열: 수집상품명 (사방넷명)
    // 과세인 경우: 텍스트 bold, 배경 연한 초록색
    const cellA = row.getCell(1);
    cellA.value = order.sabangName;
    cellA.font = {size: 10};
    cellA.alignment = {vertical: "middle", horizontal: "left"};
    if (order.billType === "과세") {
      cellA.font = {bold: true, size: 10};
      cellA.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: {argb: "FFE8F5E9"}, // 연한 초록색
      };
    }

    // B열: 수량 (우측 정렬)
    const cellB = row.getCell(2);
    cellB.value = order.quantity;
    cellB.font = {size: 10};
    cellB.alignment = {vertical: "middle", horizontal: "right"};
    cellB.numFmt = "#,##0";

    // C열: 객단가 (우측 정렬)
    const cellC = row.getCell(3);
    cellC.value = order.unitPrice;
    cellC.font = {size: 10};
    cellC.alignment = {vertical: "middle", horizontal: "right"};
    cellC.numFmt = "#,##0";

    // D열: 금액 (파란 텍스트)
    const cellD = row.getCell(4);
    cellD.value = order.amount;
    cellD.font = {size: 10, color: {argb: "FF0000FF"}}; // 파란색
    cellD.alignment = {vertical: "middle", horizontal: "right"};
    cellD.numFmt = "#,##0";

    // 테두리 설정 (검정색)
    [cellA, cellB, cellC, cellD].forEach((cell) => {
      cell.border = {
        top: {style: "thin", color: {argb: "FF000000"}},
        left: {style: "thin", color: {argb: "FF000000"}},
        bottom: {style: "thin", color: {argb: "FF000000"}},
        right: {style: "thin", color: {argb: "FF000000"}},
      };
    });

    currentRow++;
  });

  // 주문 row 끝에 공란 행 6개 처리 (테두리 있게)
  for (let i = 0; i < 6; i++) {
    const emptyRow = worksheet.getRow(currentRow);
    emptyRow.height = 22;
    const emptyCellA = emptyRow.getCell(1);
    const emptyCellB = emptyRow.getCell(2);
    const emptyCellC = emptyRow.getCell(3);
    const emptyCellD = emptyRow.getCell(4);
    [emptyCellA, emptyCellB, emptyCellC, emptyCellD].forEach((cell) => {
      cell.border = {
        top: {style: "thin", color: {argb: "FF000000"}},
        left: {style: "thin", color: {argb: "FF000000"}},
        bottom: {style: "thin", color: {argb: "FF000000"}},
        right: {style: "thin", color: {argb: "FF000000"}},
      };
    });
    currentRow++;
  }

  // ===== 총합 행 =====
  const totalRow = worksheet.getRow(currentRow);

  // An~Cn: 배경색 노란색, 텍스트색 빨간색, 위아래 테두리만
  const cellATotal = totalRow.getCell(1);
  cellATotal.value = "총합";
  cellATotal.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {argb: "FFFFFF00"}, // 노란색
  };
  cellATotal.font = {size: 20, color: {argb: "FFFF0000"}}; // 빨간색, 20px
  cellATotal.alignment = {vertical: "middle", horizontal: "left"};
  cellATotal.border = {
    top: {style: "thin", color: {argb: "FF000000"}},
    bottom: {style: "thin", color: {argb: "FF000000"}},
  };

  const cellBTotal = totalRow.getCell(2);
  cellBTotal.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {argb: "FFFFFF00"}, // 노란색
  };
  cellBTotal.font = {size: 20, color: {argb: "FFFF0000"}}; // 빨간색, 20px
  cellBTotal.alignment = {vertical: "middle", horizontal: "center"};
  cellBTotal.border = {
    top: {style: "thin", color: {argb: "FF000000"}},
    bottom: {style: "thin", color: {argb: "FF000000"}},
  };

  const cellCTotal = totalRow.getCell(3);
  cellCTotal.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {argb: "FFFFFF00"}, // 노란색
  };
  cellCTotal.font = {size: 20, color: {argb: "FFFF0000"}}; // 빨간색, 20px
  cellCTotal.alignment = {vertical: "middle", horizontal: "center"};
  cellCTotal.border = {
    top: {style: "thin", color: {argb: "FF000000"}},
    bottom: {style: "thin", color: {argb: "FF000000"}},
  };

  // Dn: 배경색 노란색, 텍스트색 빨간색, 볼드 처리, 테두리 있음
  const cellDTotal = totalRow.getCell(4);
  cellDTotal.value = summary.totalAmount;
  cellDTotal.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {argb: "FFFFFF00"}, // 노란색
  };
  cellDTotal.font = {bold: true, size: 20, color: {argb: "FFFF0000"}}; // 빨간색, 볼드, 20px
  cellDTotal.alignment = {vertical: "middle", horizontal: "right"};
  cellDTotal.numFmt = "#,##0";
  cellDTotal.border = {
    top: {style: "thin", color: {argb: "FF000000"}},
    left: {style: "thin", color: {argb: "FF000000"}},
    bottom: {style: "thin", color: {argb: "FF000000"}},
    right: {style: "thin", color: {argb: "FF000000"}},
  };

  return workbook;
}
