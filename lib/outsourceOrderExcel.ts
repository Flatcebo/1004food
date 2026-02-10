/**
 * 외주 발주서 Excel 생성 (download-outsource와 동일 양식)
 * upload_templates의 "외주 발주서" 템플릿을 사용
 */
import * as Excel from "exceljs";
import {mapDataToTemplate} from "@/utils/excelDataMapping";

function formatPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber || phoneNumber.length < 9) return phoneNumber;
  const numOnly = phoneNumber.replace(/\D/g, "");
  if (phoneNumber.includes("-")) {
    const parts = phoneNumber.split("-");
    if (parts.length === 3) {
      const formatted = formatPhoneNumber(parts.join(""));
      if (formatted !== parts.join("")) return formatted;
      return phoneNumber;
    }
  }
  if (numOnly.startsWith("02")) {
    if (numOnly.length === 9)
      return `${numOnly.slice(0, 2)}-${numOnly.slice(2, 5)}-${numOnly.slice(5)}`;
    if (numOnly.length === 10)
      return `${numOnly.slice(0, 2)}-${numOnly.slice(2, 6)}-${numOnly.slice(6)}`;
  } else if (numOnly.startsWith("0") && numOnly.length === 11) {
    return `${numOnly.slice(0, 3)}-${numOnly.slice(3, 7)}-${numOnly.slice(7)}`;
  } else if (numOnly.startsWith("0508") && numOnly.length === 12) {
    return `${numOnly.slice(0, 4)}-${numOnly.slice(4, 8)}-${numOnly.slice(8)}`;
  } else if (numOnly.startsWith("050") && numOnly.length === 12) {
    return `${numOnly.slice(0, 4)}-${numOnly.slice(4, 8)}-${numOnly.slice(8)}`;
  }
  return phoneNumber;
}

function formatPhoneNumber1ForOnline(phoneNumber: string): string {
  if (!phoneNumber || phoneNumber.trim() === "") return phoneNumber;
  if (phoneNumber.includes("-")) {
    const firstDashIndex = phoneNumber.indexOf("-");
    return (
      phoneNumber.slice(0, firstDashIndex) +
      " " +
      phoneNumber.slice(firstDashIndex)
    );
  }
  const numOnly = phoneNumber.replace(/\D/g, "");
  if (numOnly.length === 0) return phoneNumber;
  let prefixLength = 3;
  if (numOnly.startsWith("02")) prefixLength = 2;
  else if (numOnly.startsWith("0508") || numOnly.startsWith("050"))
    prefixLength = 4;
  else if (numOnly.startsWith("0") && numOnly.length >= 11) prefixLength = 3;
  const prefix = numOnly.slice(0, prefixLength);
  const suffix = numOnly.slice(prefixLength);
  return prefix + " " + suffix;
}

export interface BuildOutsourceExcelParams {
  templateData: any;
  vendorRows: any[];
  purchaseName: string;
  isOnlineUser: boolean;
}

export async function buildOutsourceOrderExcel(
  params: BuildOutsourceExcelParams,
): Promise<Buffer> {
  const {templateData, vendorRows, purchaseName, isOnlineUser} = params;

  let headers = Array.isArray(templateData.headers)
    ? templateData.headers
    : Array.isArray(templateData.columnOrder)
      ? templateData.columnOrder
      : [];
  const columnWidths =
    templateData.columnWidths && typeof templateData.columnWidths === "object"
      ? templateData.columnWidths
      : {};
  const worksheetName = templateData.worksheetName || purchaseName;

  headers = headers.map((h: string, i: number) => {
    const s = String(h || "").trim();
    if (s === "주문하신분" || s.includes("주문하신분")) return "주문자명";
    if (i === 10 && (s === "전화번호" || s.includes("전화번호")))
      return "주문자번호";
    return s;
  });

  const excelData: any[][] = vendorRows.map((row: any) => {
    let phone1Value = "";
    headers.forEach((header: any) => {
      const headerStr =
        typeof header === "string" ? header : String(header || "");
      if (headerStr.includes("전화번호1") || headerStr === "전화번호1") {
        let v = mapDataToTemplate(row, headerStr, {
          templateName: templateData.name,
          formatPhone: true,
          preferSabangName: true,
        });
        phone1Value = v != null ? String(v) : "";
        if (phone1Value) {
          phone1Value = formatPhoneNumber(phone1Value);
          if (isOnlineUser) {
            phone1Value = formatPhoneNumber1ForOnline(phone1Value);
          }
        }
      }
    });

    return headers.map((header: any, headerIdx: number) => {
      const headerStr =
        typeof header === "string" ? header : String(header || "");

      if (headerIdx === 8) {
        return String(row["수량"] || row["주문수량"] || row["quantity"] || 1);
      }
      if (!headerStr || headerStr.trim() === "") {
        return String(row["수량"] || row["주문수량"] || row["quantity"] || 1);
      }

      let value = mapDataToTemplate(row, headerStr, {
        templateName: templateData.name,
        formatPhone: true,
        preferSabangName: true,
      });
      let stringValue = value != null ? String(value) : "";

      const headerStrNorm = headerStr.replace(/\s+/g, "").toLowerCase();
      const isReceiverName =
        headerStr === "수취인명" ||
        headerStr === "수취인" ||
        headerStr === "받는사람" ||
        (headerStr.includes("수취인") &&
          !headerStrNorm.includes("전화") &&
          !headerStrNorm.includes("주소") &&
          !headerStrNorm.includes("우편") &&
          !headerStrNorm.includes("연락"));
      const isDeliveryMessageField =
        headerStr.includes("배송") ||
        headerStr.includes("메시지") ||
        headerStr.includes("배메");

      if (!isReceiverName && !isDeliveryMessageField) {
        stringValue = stringValue.replace(/^★/, "").trim();
      }
      if (isReceiverName) {
        stringValue = "★" + stringValue.replace(/^★/, "").trim();
      }

      if (headerStr === "주문번호" || headerStr.includes("주문번호")) {
        stringValue = isOnlineUser
          ? row["sabang_code"] || row["주문번호"] || stringValue
          : row["내부코드"] || stringValue;
      }
      if (headerStr === "주문자명" || headerStr.includes("주문자명")) {
        stringValue = row["주문자명"] || row["주문하신분"] || stringValue;
      }
      if (
        headerStr === "주문자번호" ||
        (headerIdx === 10 && headerStr.includes("전화번호"))
      ) {
        stringValue =
          row["주문자 전화번호"] ||
          row["주문자전화번호"] ||
          row["전화번호"] ||
          stringValue;
      }

      if (headerStr.includes("전화") || headerStr.includes("연락")) {
        stringValue = stringValue.replace(/^★/, "").trim();
        const numOnly = stringValue.replace(/\D/g, "");
        if (
          (numOnly.length === 10 || numOnly.length === 11) &&
          !numOnly.startsWith("0")
        ) {
          stringValue = "0" + numOnly;
        } else if (numOnly.length > 0) {
          stringValue = numOnly;
        }
        if (
          (headerStr.includes("전화번호2") || headerStr === "전화번호2") &&
          !stringValue
        ) {
          stringValue = phone1Value;
        }
        stringValue = formatPhoneNumber(stringValue);
        if (
          (headerStr === "전화번호1" || headerStr.includes("전화번호1")) &&
          isOnlineUser
        ) {
          stringValue = formatPhoneNumber1ForOnline(stringValue);
        }
      }

      if (headerStr.includes("우편")) {
        stringValue = stringValue.replace(/^★/, "").trim();
        const numOnly = stringValue.replace(/\D/g, "");
        if (numOnly.length >= 4 && numOnly.length <= 5) {
          stringValue = numOnly.padStart(5, "0");
        }
      }
      if (headerStr.includes("주소") && !isReceiverName) {
        stringValue = stringValue.replace(/^★/, "").trim();
      }

      if (
        isOnlineUser &&
        (headerStr.includes("배송") ||
          headerStr.includes("메시지") ||
          headerStr.includes("배메"))
      ) {
        const receiverName =
          row["주문자명"] || row["보낸사람"] || row["주문자"] || "";
        if (receiverName) {
          const prefix = `#${receiverName}`;
          const trimmed = stringValue.trim();
          stringValue = !trimmed
            ? prefix
            : trimmed.startsWith("★")
              ? prefix + trimmed
              : `${prefix} ${trimmed}`;
        }
      }

      return stringValue;
    });
  });

  const wb = new Excel.Workbook();
  const sheet = wb.addWorksheet(worksheetName);

  const headerRow = sheet.addRow(headers);
  headerRow.height = 30.75;

  headerRow.eachCell((cell, colNum) => {
    let bgColor = "ffffffff";
    if (
      [
        1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
        25, 26,
      ].includes(colNum)
    ) {
      bgColor = "ffdaeef3";
    } else if (colNum === 10 || colNum === 11) {
      bgColor = "ffffff00";
    }
    let fontColor = "ff000000";
    if ([9, 11].includes(colNum)) {
      fontColor = "ffff0000";
    } else if (colNum === 10) {
      fontColor = "ff0070c0";
    }
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {argb: bgColor},
    };
    cell.border = {
      top: {style: "thin", color: {argb: "ff000000"}},
      left: {style: "thin", color: {argb: "ff000000"}},
      bottom: {style: "thin", color: {argb: "ff000000"}},
      right: {style: "thin", color: {argb: "ff000000"}},
    };
    cell.font = {
      name: "Arial",
      size: 12,
      bold: true,
      color: {argb: fontColor},
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
  });

  headers.forEach((headerName: string, index: number) => {
    const width =
      typeof columnWidths === "object" && columnWidths[headerName]
        ? columnWidths[headerName]
        : 15;
    sheet.getColumn(index + 1).width = width <= 0 || width < 5 ? 15 : width;
  });

  excelData.forEach((rowDatas) => {
    const appendRow = sheet.addRow(rowDatas);
    appendRow.eachCell((cell: any, colNum: number) => {
      const headerName = headers[colNum - 1] || "";
      const normalizedHeader = String(headerName)
        .replace(/\s+/g, "")
        .toLowerCase();
      const isTextColumn =
        normalizedHeader.includes("전화") ||
        normalizedHeader.includes("연락") ||
        normalizedHeader.includes("우편") ||
        normalizedHeader.includes("코드");
      if (isTextColumn) {
        cell.numFmt = "@";
      }
    });
  });

  const totalRowCount = excelData.length;
  const i1Cell = sheet.getCell("I1");
  i1Cell.value = totalRowCount;
  for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
    sheet.getCell(`I${rowNum}`).value = "";
  }

  if (wb.worksheets.length > 0) {
    wb.worksheets[0].name = purchaseName;
  }
  return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
}
