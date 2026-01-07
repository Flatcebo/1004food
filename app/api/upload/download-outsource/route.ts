import sql from "@/lib/db";
import {NextRequest, NextResponse} from "next/server";
import {getCompanyIdFromRequest} from "@/lib/company";
import * as Excel from "exceljs";
import {mapDataToTemplate, sortExcelData} from "@/utils/excelDataMapping";
import JSZip from "jszip";

// 전화번호에 하이픈을 추가하여 형식 맞춤
function formatPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber || phoneNumber.length < 9) return phoneNumber;

  const numOnly = phoneNumber.replace(/\D/g, "");

  // 이미 하이픈이 제대로 되어 있는지 확인
  if (phoneNumber.includes("-")) {
    const parts = phoneNumber.split("-");
    if (parts.length === 3) {
      // 하이픈이 3부분으로 나뉘어 있는 경우 올바른 형식인지 확인
      const formatted = formatPhoneNumber(parts.join(""));
      if (formatted !== parts.join("")) {
        return formatted;
      }
      return phoneNumber; // 이미 올바른 형식이면 그대로 반환
    }
  }

  // 02 지역번호 (02-XXXX-XXXX)
  if (numOnly.startsWith("02")) {
    if (numOnly.length === 9) {
      // 02-XXX-XXXX
      return `${numOnly.slice(0, 2)}-${numOnly.slice(2, 5)}-${numOnly.slice(
        5
      )}`;
    } else if (numOnly.length === 10) {
      // 02-XXXX-XXXX
      return `${numOnly.slice(0, 2)}-${numOnly.slice(2, 6)}-${numOnly.slice(
        6
      )}`;
    }
  }
  // 휴대폰 및 기타 지역번호 (0XX-XXXX-XXXX)
  else if (numOnly.startsWith("0") && numOnly.length === 11) {
    // 010-XXXX-XXXX 등
    return `${numOnly.slice(0, 3)}-${numOnly.slice(3, 7)}-${numOnly.slice(7)}`;
  }
  // 0508 대역 (0508-XXXX-XXXX)
  else if (numOnly.startsWith("0508") && numOnly.length === 12) {
    // 0508-XXXX-XXXX
    return `${numOnly.slice(0, 4)}-${numOnly.slice(4, 8)}-${numOnly.slice(8)}`;
  }
  // 050X 대역 (050X-XXXX-XXXX) - 0508 제외
  else if (numOnly.startsWith("050") && numOnly.length === 12) {
    // 050X-XXXX-XXXX (0500, 0501, 0502, 0503, 0504, 0505, 0506, 0507, 0509)
    return `${numOnly.slice(0, 4)}-${numOnly.slice(4, 8)}-${numOnly.slice(8)}`;
  }

  // 기타 경우는 그대로 반환
  return phoneNumber;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {templateId, rowIds, filters, rows, preferSabangName} = body;

    if (!templateId) {
      return NextResponse.json(
        {success: false, error: "템플릿 ID가 필요합니다."},
        {status: 400}
      );
    }

    // console.log("rows", rows);

    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400}
      );
    }

    // 템플릿 정보 조회 (company_id 필터링)
    const templateResult = await sql`
            SELECT template_data
            FROM upload_templates
            WHERE id = ${templateId} AND company_id = ${companyId}
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

    const columnWidths =
      templateData.columnWidths && typeof templateData.columnWidths === "object"
        ? templateData.columnWidths
        : {};

    if (!columnOrder || columnOrder.length === 0) {
      return NextResponse.json(
        {success: false, error: "템플릿의 컬럼 순서가 설정되지 않았습니다."},
        {status: 400}
      );
    }

    const wb = new Excel.Workbook();
    // sheet 생성
    const sheet = wb.addWorksheet(templateData.worksheetName);

    const headerRow = sheet.addRow(headers);
    // 헤더의 높이값 지정
    headerRow.height = 30.75;

    // 각 헤더 cell에 스타일 지정
    headerRow.eachCell((cell, colNum) => {
      // 배경색 설정 (열별로 다르게)
      let bgColor = "ffffffff"; // 기본 흰색

      if ([1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 15, 16, 17].includes(colNum)) {
        // A~G열(1-7), J~L열(10-12), O~Q열(15-17): 노란색
        bgColor = "fffffd01";
      } else if (colNum === 14) {
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

    // 열 너비 설정 (헤더 루프 밖에서 한번에 처리)
    headers.forEach((headerName: string, index: number) => {
      const colNum = index + 1;
      const width =
        typeof columnWidths === "object" && columnWidths[headerName]
          ? columnWidths[headerName]
          : 15;
      sheet.getColumn(colNum).width = width;
    });

    // DB에서 데이터 조회
    let dataRows: any[] = [];
    let dataRowsWithIds: Array<{id: number; row_data: any}> = [];
    let downloadedRowIds: number[] = [];

    if (rows) {
      // rows가 직접 전달된 경우 (app/page.tsx에서 테스트용)
      dataRows = rows;
      // rows가 직접 전달된 경우 ID 추적 불가
      downloadedRowIds = [];
    } else if (rowIds && rowIds.length > 0) {
      // 선택된 행 ID들로 조회
      const rowData = await sql`
        SELECT id, row_data
        FROM upload_rows
        WHERE id = ANY(${rowIds})
      `;
      dataRowsWithIds = rowData.map((r: any) => ({
        id: r.id,
        row_data: r.row_data || {},
      }));
      dataRows = dataRowsWithIds.map((r: any) => r.row_data);
      downloadedRowIds = rowIds;
    } else if (filters && Object.keys(filters).length > 0) {
      // 필터 조건으로 조회
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
      if (filters.company) {
        conditions.push(sql`ur.row_data->>'업체명' = ${filters.company}`);
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

      const buildQuery = (includeId: boolean = false) => {
        if (conditions.length === 0) {
          return sql`
            SELECT ${includeId ? sql`ur.id,` : sql``} ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            ORDER BY u.created_at DESC, ur.id DESC
          `;
        }

        let query = sql`
          SELECT ${includeId ? sql`ur.id,` : sql``} ur.row_data
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

      // 필터링된 데이터 조회 시 ID도 함께 조회 (주문상태 업데이트를 위해)
      const filteredData = await buildQuery(true);
      // ID와 row_data를 함께 저장하여 외주 필터링 후에도 ID 추적 가능하도록 함
      dataRowsWithIds = filteredData.map((r: any) => ({
        id: r.id,
        row_data: r.row_data || {},
      }));
      dataRows = dataRowsWithIds.map((r: any) => r.row_data);
    } else {
      // 조건 없으면 모든 데이터 조회
      const allData = await sql`
        SELECT ur.id, ur.row_data
        FROM upload_rows ur
        INNER JOIN uploads u ON ur.upload_id = u.id
        ORDER BY u.created_at DESC, ur.id DESC
      `;
      dataRowsWithIds = allData.map((r: any) => ({
        id: r.id,
        row_data: r.row_data || {},
      }));
      dataRows = dataRowsWithIds.map((r: any) => r.row_data);
    }

    // 템플릿명 확인 (외주 발주서인지 체크)
    const templateName = (templateData.name || "").normalize("NFC").trim();
    const isOutsource = templateName.includes("외주");
    const isCJOutsource = templateName.includes("CJ");

    // CJ외주 발주서인 경우: ZIP 없이 단일 엑셀 파일로 다운로드
    if (isCJOutsource) {
      // ID와 함께 필터링하여 실제 다운로드된 행의 ID 추적
      if (dataRowsWithIds.length > 0) {
        const filteredRowsWithIds = dataRowsWithIds.filter(
          (item: any) =>
            item.row_data.내외주 === "외주" &&
            item.row_data.매핑코드 !== "106464"
        );
        // 전화번호 필드들에 하이픈 추가 가공 (ID 유지)
        const processedRowsWithIds = filteredRowsWithIds.map((item: any) => {
          const processedRow = {...item.row_data};

          // 수취인 전화번호 가공
          if (processedRow["수취인 전화번호"]) {
            processedRow["수취인 전화번호"] = formatPhoneNumber(
              processedRow["수취인 전화번호"]
            );
          }

          // 주문자 전화번호 가공
          if (processedRow["주문자 전화번호"]) {
            processedRow["주문자 전화번호"] = formatPhoneNumber(
              processedRow["주문자 전화번호"]
            );
          }

          // 전화번호1 가공
          if (processedRow["전화번호1"]) {
            processedRow["전화번호1"] = formatPhoneNumber(
              processedRow["전화번호1"]
            );
          }

          // 전화번호2 가공
          if (processedRow["전화번호2"]) {
            processedRow["전화번호2"] = formatPhoneNumber(
              processedRow["전화번호2"]
            );
          }

          // 전화번호 가공
          if (processedRow["전화번호"]) {
            processedRow["전화번호"] = formatPhoneNumber(
              processedRow["전화번호"]
            );
          }

          return {
            id: item.id,
            row_data: processedRow,
          };
        });
        dataRows = processedRowsWithIds.map((item: any) => item.row_data);
        downloadedRowIds = processedRowsWithIds.map((item: any) => item.id);
      } else {
        // rows가 직접 전달된 경우
        dataRows = dataRows.filter(
          (row: any) => row.내외주 === "외주" && row.매핑코드 !== "106464"
        );

        // 전화번호 필드들에 하이픈 추가 가공
        dataRows = dataRows.map((row: any) => {
          const processedRow = {...row};

          // 수취인 전화번호 가공
          if (processedRow["수취인 전화번호"]) {
            processedRow["수취인 전화번호"] = formatPhoneNumber(
              processedRow["수취인 전화번호"]
            );
          }

          // 주문자 전화번호 가공
          if (processedRow["주문자 전화번호"]) {
            processedRow["주문자 전화번호"] = formatPhoneNumber(
              processedRow["주문자 전화번호"]
            );
          }

          // 전화번호1 가공
          if (processedRow["전화번호1"]) {
            processedRow["전화번호1"] = formatPhoneNumber(
              processedRow["전화번호1"]
            );
          }

          // 전화번호2 가공
          if (processedRow["전화번호2"]) {
            processedRow["전화번호2"] = formatPhoneNumber(
              processedRow["전화번호2"]
            );
          }

          // 전화번호 가공
          if (processedRow["전화번호"]) {
            processedRow["전화번호"] = formatPhoneNumber(
              processedRow["전화번호"]
            );
          }

          return processedRow;
        });
      }

      if (dataRows.length === 0) {
        return NextResponse.json(
          {success: false, error: "CJ외주 데이터가 없습니다."},
          {status: 404}
        );
      }

      // 상품 정보 조회: productId가 있으면 ID로, 없으면 매핑코드로 조회
      const productIds = [
        ...new Set(dataRows.map((row: any) => row.productId).filter(Boolean)),
      ];
      const productCodes = [
        ...new Set(
          dataRows
            .filter((row: any) => !row.productId && row.매핑코드)
            .map((row: any) => row.매핑코드)
        ),
      ];
      const productSalePriceMap: {[code: string]: number | null} = {};
      const productSabangNameMap: {[code: string]: string | null} = {};
      const productVendorNameMap: {[code: string]: string | null} = {};
      const productSalePriceMapById: {[id: string | number]: number | null} =
        {};
      const productSabangNameMapById: {[id: string | number]: string | null} =
        {};
      const productVendorNameMapById: {[id: string | number]: string | null} =
        {};

      // productId로 조회
      if (productIds.length > 0) {
        const productsById = await sql`
          SELECT id, code, sale_price, sabang_name as "sabangName", purchase as "vendorName"
          FROM products
          WHERE id = ANY(${productIds})
        `;

        productsById.forEach((p: any) => {
          if (p.id) {
            if (p.sale_price !== null && p.sale_price !== undefined) {
              productSalePriceMapById[p.id] = p.sale_price;
            }
            if (p.sabangName !== undefined) {
              productSabangNameMapById[p.id] = p.sabangName;
            }
            if (p.vendorName !== undefined) {
              productVendorNameMapById[p.id] = p.vendorName;
            }
          }
        });
      }

      // 매핑코드로 조회 (productId가 없는 경우)
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

      // 매핑코드를 통해 매입처로 업체명 업데이트 및 공급가, 사방넷명 주입
      dataRows.forEach((row: any) => {
        // 내주는 제외 (외주만 처리)
        if (row.내외주 !== "외주") {
          return;
        }

        if (row.productId) {
          // productId로 조회한 정보 사용
          if (productVendorNameMapById[row.productId] !== undefined) {
            row.업체명 =
              productVendorNameMapById[row.productId] || "매입처미지정";
          }
          if (productSalePriceMapById[row.productId] !== undefined) {
            const salePrice = productSalePriceMapById[row.productId];
            if (salePrice !== null) {
              row["공급가"] = salePrice;
            }
          }
          if (productSabangNameMapById[row.productId] !== undefined) {
            const sabangName = productSabangNameMapById[row.productId];
            if (
              sabangName !== null &&
              sabangName !== undefined &&
              String(sabangName).trim() !== ""
            ) {
              row["사방넷명"] = sabangName;
              row["sabangName"] = sabangName;
              row["sabang_name"] = sabangName;
            } else {
              delete row["사방넷명"];
              delete row["sabangName"];
              delete row["sabang_name"];
            }
          } else {
            delete row["사방넷명"];
            delete row["sabangName"];
            delete row["sabang_name"];
          }
        } else if (row.매핑코드) {
          // 매핑코드로 조회한 정보 사용
          if (productVendorNameMap[row.매핑코드] !== undefined) {
            row.업체명 = productVendorNameMap[row.매핑코드] || "매입처미지정";
          } else {
            row.업체명 = "매입처미지정";
          }
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
              row["sabangName"] = sabangName;
              row["sabang_name"] = sabangName;
            } else {
              delete row["사방넷명"];
              delete row["sabangName"];
              delete row["sabang_name"];
            }
          } else {
            delete row["사방넷명"];
            delete row["sabangName"];
            delete row["sabang_name"];
          }
        }
      });

      // 데이터를 2차원 배열로 변환
      let excelData = dataRows.map((row: any) => {
        return headers.map((header: any) => {
          // header를 문자열로 변환
          const headerStr =
            typeof header === "string" ? header : String(header || "");

          let value = mapDataToTemplate(row, headerStr, {
            templateName: templateData.name,
            formatPhone: true, // CJ외주 발주서에서도 전화번호에 하이픈 추가
            preferSabangName:
              preferSabangName !== undefined ? preferSabangName : true,
          });

          // 모든 값을 문자열로 변환 (0 유지)
          let stringValue = value != null ? String(value) : "";

          // 수취인명인 경우 앞에 ★ 붙이기
          if (
            headerStr === "수취인명" ||
            headerStr === "수취인" ||
            headerStr === "받는사람"
          ) {
            stringValue = "★" + stringValue;
          }

          // 주문번호인 경우 내부코드 사용
          if (headerStr === "주문번호" || headerStr.includes("주문번호")) {
            stringValue = row["내부코드"] || stringValue;
          }

          // 전화번호가 10-11자리 숫자이고 0으로 시작하지 않으면 앞에 0 추가 및 하이픈 추가
          if (headerStr.includes("전화") || headerStr.includes("연락")) {
            // 이미 하이픈이 있는 경우는 건너뜀 (mapDataToTemplate에서 이미 처리됨)
            if (!stringValue.includes("-")) {
              const numOnly = stringValue.replace(/\D/g, ""); // 숫자만 추출
              if (
                (numOnly.length === 10 || numOnly.length === 11) &&
                !numOnly.startsWith("0")
              ) {
                stringValue = "0" + numOnly; // 숫자만 사용하고 0 추가
              } else if (numOnly.length > 0) {
                stringValue = numOnly; // 하이픈 등 제거하고 숫자만
              }

              // 하이픈 추가하여 전화번호 형식 맞춤
              stringValue = formatPhoneNumber(stringValue);
            }
          }

          // 우편번호가 4-5자리 숫자면 5자리로 맞춤 (앞에 0 추가)
          if (headerStr.includes("우편")) {
            const numOnly = stringValue.replace(/\D/g, "");
            if (numOnly.length >= 4 && numOnly.length <= 5) {
              stringValue = numOnly.padStart(5, "0");
            }
          }

          return stringValue;
        });
      });

      // 정렬: 상품명 또는 사방넷명 오름차순 후 수취인명 오름차순
      excelData = sortExcelData(excelData, columnOrder, {
        preferSabangName:
          preferSabangName !== undefined ? preferSabangName : true,
        originalData: dataRows,
      });

      // 헤더 추가 (외주 발주서 스타일 적용)
      const headerRow = sheet.addRow(headers);
      headerRow.height = 30.75;

      // 헤더 스타일 (외주 발주서 스타일)
      headerRow.eachCell((cell, colNum) => {
        let bgColor = "ffffffff";
        if (
          [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 15, 16, 17, 18, 19, 20, 21, 22, 23,
            24, 25, 26,
          ].includes(colNum)
        ) {
          bgColor = "ffdaeef3"; // #daeef3
        } else if (colNum === 10 || colNum === 11) {
          bgColor = "ffffff00"; // #ffff00 (노란색)
        }

        let fontColor = "ff000000";

        if ([9, 11].includes(colNum)) {
          fontColor = "ffff0000"; // 빨간색
        } else if (colNum === 10) {
          fontColor = "ff0070c0"; // 파란색
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

      // 열 너비 설정
      headers.forEach((headerName: string, index: number) => {
        const colNum = index + 1;
        const width =
          typeof columnWidths === "object" && columnWidths[headerName]
            ? columnWidths[headerName]
            : 15;
        sheet.getColumn(colNum).width = width;
      });

      // 정렬된 데이터를 엑셀에 추가
      excelData.forEach((rowDatas) => {
        const appendRow = sheet.addRow(rowDatas);

        // 전화번호, 우편번호, 코드 관련 필드는 텍스트 형식으로 설정 (앞자리 0 유지)
        appendRow.eachCell((cell: any, colNum: any) => {
          const headerName = headers[colNum - 1];
          // headerName을 문자열로 변환
          const headerStr =
            typeof headerName === "string"
              ? headerName
              : String(headerName || "");
          const normalizedHeader = headerStr.replace(/\s+/g, "").toLowerCase();

          const isTextColumn =
            normalizedHeader.includes("전화") ||
            normalizedHeader.includes("연락") ||
            normalizedHeader.includes("우편") ||
            normalizedHeader.includes("코드");

          if (isTextColumn) {
            cell.numFmt = "@"; // 텍스트 형식
          }
        });
      });

      // 엑셀 파일 생성
      const buffer = await wb.xlsx.writeBuffer();

      // 파일명 생성
      const dateStr = new Date().toISOString().split("T")[0];
      const fileName = `${dateStr}_CJ외주발주.xlsx`;

      // Windows에서 한글 파일명 깨짐 방지를 위한 RFC 5987 형식 인코딩
      const asciiFallbackBase =
        `${dateStr}_CJ_Outsource_Order`
          .replace(/[^\x00-\x7F]/g, "")
          .replace(/\s+/g, "_") || "download";
      const safeFileName = `${asciiFallbackBase}.xlsx`; // ASCII fallback
      const encodedFileName = encodeURIComponent(fileName); // UTF-8 인코딩
      const contentDisposition = `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`;

      // CJ외주 발주서 다운로드가 성공하면 주문상태 업데이트
      // CJ외주 발주서인 경우 필터링된 데이터의 실제 다운로드된 행들만 업데이트
      const idsToUpdate =
        downloadedRowIds.length > 0
          ? downloadedRowIds
          : rowIds && rowIds.length > 0
          ? rowIds
          : [];
      if (idsToUpdate && idsToUpdate.length > 0) {
        try {
          // 효율적인 단일 쿼리로 모든 row의 주문상태를 "발주서 다운"으로 업데이트
          await sql`
            UPDATE upload_rows
            SET row_data = jsonb_set(row_data, '{주문상태}', '"발주서 다운"', true)
            WHERE id = ANY(${idsToUpdate})
          `;
          console.log(
            `CJ외주 발주서 다운로드: ${idsToUpdate.length}건의 주문상태를 "발주서 다운"으로 업데이트했습니다.`
          );
        } catch (updateError) {
          console.error("주문상태 업데이트 실패:", updateError);
          // 주문상태 업데이트 실패해도 다운로드는 성공으로 처리
        }
      } else {
        console.warn(
          "CJ외주 발주서 다운로드: 업데이트할 ID가 없습니다. downloadedRowIds:",
          downloadedRowIds,
          "rowIds:",
          rowIds
        );
      }

      const responseHeaders = new Headers();
      responseHeaders.set(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      responseHeaders.set("Content-Disposition", contentDisposition);

      return new Response(buffer, {
        headers: responseHeaders,
      });
    }

    // 외주 발주서인 경우: 매입처별로 그룹화하여 ZIP 생성
    if (isOutsource && !isCJOutsource) {
      // ID와 함께 필터링하여 실제 다운로드된 행의 ID 추적
      if (dataRowsWithIds.length > 0) {
        const filteredRowsWithIds = dataRowsWithIds.filter(
          (item: any) =>
            item.row_data.내외주 === "외주" &&
            item.row_data.매핑코드 !== "106464" &&
            !item.row_data.업체명?.includes("CJ")
        );
        // 전화번호 필드들에 하이픈 추가 가공 (ID 유지)
        const processedRowsWithIds = filteredRowsWithIds.map((item: any) => {
          const processedRow = {...item.row_data};

          // 수취인 전화번호 가공
          if (processedRow["수취인 전화번호"]) {
            processedRow["수취인 전화번호"] = formatPhoneNumber(
              processedRow["수취인 전화번호"]
            );
          }

          // 주문자 전화번호 가공
          if (processedRow["주문자 전화번호"]) {
            processedRow["주문자 전화번호"] = formatPhoneNumber(
              processedRow["주문자 전화번호"]
            );
          }

          // 전화번호1 가공
          if (processedRow["전화번호1"]) {
            processedRow["전화번호1"] = formatPhoneNumber(
              processedRow["전화번호1"]
            );
          }

          // 전화번호2 가공
          if (processedRow["전화번호2"]) {
            processedRow["전화번호2"] = formatPhoneNumber(
              processedRow["전화번호2"]
            );
          }

          // 전화번호 가공
          if (processedRow["전화번호"]) {
            processedRow["전화번호"] = formatPhoneNumber(
              processedRow["전화번호"]
            );
          }

          return {
            id: item.id,
            row_data: processedRow,
          };
        });
        dataRows = processedRowsWithIds.map((item: any) => item.row_data);
        downloadedRowIds = processedRowsWithIds.map((item: any) => item.id);
      } else {
        // rows가 직접 전달된 경우
        dataRows = dataRows.filter(
          (row: any) =>
            row.내외주 === "외주" &&
            row.매핑코드 !== "106464" &&
            !row.업체명?.includes("CJ")
        );

        // 전화번호 필드들에 하이픈 추가 가공
        dataRows = dataRows.map((row: any) => {
          const processedRow = {...row};

          // 수취인 전화번호 가공
          if (processedRow["수취인 전화번호"]) {
            processedRow["수취인 전화번호"] = formatPhoneNumber(
              processedRow["수취인 전화번호"]
            );
          }

          // 주문자 전화번호 가공
          if (processedRow["주문자 전화번호"]) {
            processedRow["주문자 전화번호"] = formatPhoneNumber(
              processedRow["주문자 전화번호"]
            );
          }

          // 전화번호1 가공
          if (processedRow["전화번호1"]) {
            processedRow["전화번호1"] = formatPhoneNumber(
              processedRow["전화번호1"]
            );
          }

          // 전화번호2 가공
          if (processedRow["전화번호2"]) {
            processedRow["전화번호2"] = formatPhoneNumber(
              processedRow["전화번호2"]
            );
          }

          // 전화번호 가공
          if (processedRow["전화번호"]) {
            processedRow["전화번호"] = formatPhoneNumber(
              processedRow["전화번호"]
            );
          }

          return processedRow;
        });
      }

      if (dataRows.length === 0) {
        return NextResponse.json(
          {success: false, error: "외주 데이터가 없습니다."},
          {status: 404}
        );
      }

      // 매핑코드별 가격, 사방넷명, 업체명 정보 조회
      const productCodes = [
        ...new Set(dataRows.map((row: any) => row.매핑코드).filter(Boolean)),
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

      // 매핑코드를 통해 매입처로 업체명 업데이트
      dataRows.forEach((row: any) => {
        // 내주는 제외 (외주만 처리)
        if (row.내외주 !== "외주") {
          return;
        }

        if (row.매핑코드 && productVendorNameMap[row.매핑코드]) {
          row.업체명 = productVendorNameMap[row.매핑코드];
        } else {
          row.업체명 = "매입처미지정";
        }

        // 공급가와 사방넷명 주입
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
              // mapDataToTemplate에서 찾을 수 있도록 여러 키로 저장
              row["사방넷명"] = sabangName;
              row["sabangName"] = sabangName;
              row["sabang_name"] = sabangName;
            } else {
              // 사방넷명이 null이거나 빈 문자열인 경우 명시적으로 제거 (상품명으로 fallback)
              delete row["사방넷명"];
              delete row["sabangName"];
              delete row["sabang_name"];
            }
          } else {
            // productSabangNameMap에 없는 경우 명시적으로 제거 (상품명으로 fallback)
            delete row["사방넷명"];
            delete row["sabangName"];
            delete row["sabang_name"];
          }
        }
      });

      // 매입처별로 그룹화 (내주 제외)
      const vendorGroups: {[vendor: string]: any[]} = {};
      dataRows.forEach((row) => {
        // 내주는 제외
        if (row.내외주 !== "외주") {
          return;
        }

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
        const wb = new Excel.Workbook();
        const sheet = wb.addWorksheet(templateData.worksheetName);

        // 헤더 추가
        const headerRow = sheet.addRow(headers);
        headerRow.height = 30.75;

        // 헤더 스타일
        headerRow.eachCell((cell, colNum) => {
          let bgColor = "ffffffff";
          if (
            [
              1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 15, 16, 17, 18, 19, 20, 21, 22, 23,
              24, 25, 26,
            ].includes(colNum)
          ) {
            bgColor = "ffdaeef3"; // #daeef3
          } else if (colNum === 10 || colNum === 11) {
            bgColor = "ffffff00"; // #ffff00 (노란색)
          }

          let fontColor = "ff000000";

          if ([9, 11].includes(colNum)) {
            fontColor = "ffff0000"; // 빨간색
          } else if (colNum === 10) {
            fontColor = "ff0070c0"; // 파란색
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

        // 열 너비 설정
        headers.forEach((headerName: string, index: number) => {
          const colNum = index + 1;
          const width =
            typeof columnWidths === "object" && columnWidths[headerName]
              ? columnWidths[headerName]
              : 15;
          sheet.getColumn(colNum).width = width;
        });

        // 데이터를 2차원 배열로 변환
        let excelData = vendorRows.map((row: any) => {
          // 전화번호1 값을 미리 계산
          let phone1Value = "";
          headers.forEach((header: any) => {
            const headerStr =
              typeof header === "string" ? header : String(header || "");
            if (headerStr.includes("전화번호1") || headerStr === "전화번호1") {
              let value = mapDataToTemplate(row, headerStr, {
                templateName: templateData.name,
                formatPhone: true, // 외주 발주서에서는 전화번호에 하이픈 추가
              });
              phone1Value = value != null ? String(value) : "";
            }
          });

          return headers.map((header: any, headerIdx: number) => {
            // header를 문자열로 변환
            const headerStr =
              typeof header === "string" ? header : String(header || "");

            let value = mapDataToTemplate(row, headerStr, {
              templateName: templateData.name,
              formatPhone: true, // 외주 발주서에서는 전화번호에 하이픈 추가
            });

            let stringValue = value != null ? String(value) : "";

            // 수취인명인 경우 앞에 ★ 붙이기
            if (
              headerStr === "수취인명" ||
              headerStr === "수취인" ||
              headerStr === "받는사람"
            ) {
              stringValue = "★" + stringValue;
            }

            // 주문번호인 경우 내부코드 사용
            if (headerStr === "주문번호" || headerStr.includes("주문번호")) {
              stringValue = row["내부코드"] || stringValue;
            }

            if (headerStr.includes("전화") || headerStr.includes("연락")) {
              const numOnly = stringValue.replace(/\D/g, "");
              if (
                (numOnly.length === 10 || numOnly.length === 11) &&
                !numOnly.startsWith("0")
              ) {
                stringValue = "0" + numOnly;
              } else if (numOnly.length > 0) {
                stringValue = numOnly;
              }

              // 전화번호2가 비어있으면 전화번호1 값 사용
              if (
                (headerStr.includes("전화번호2") ||
                  headerStr === "전화번호2") &&
                !stringValue
              ) {
                stringValue = phone1Value;
              }

              // 하이픈 추가하여 전화번호 형식 맞춤
              stringValue = formatPhoneNumber(stringValue);
            }

            if (headerStr.includes("우편")) {
              const numOnly = stringValue.replace(/\D/g, "");
              if (numOnly.length >= 4 && numOnly.length <= 5) {
                stringValue = numOnly.padStart(5, "0");
              }
            }

            return stringValue;
          });
        });

        // 정렬: 상품명 또는 사방넷명 오름차순 후 수취인명 오름차순
        excelData = sortExcelData(excelData, columnOrder, {
          preferSabangName:
            preferSabangName !== undefined ? preferSabangName : true,
          originalData: vendorRows,
        });

        // 데이터 추가
        excelData.forEach((rowDatas) => {
          const appendRow = sheet.addRow(rowDatas);

          appendRow.eachCell((cell: any, colNum: any) => {
            const headerName = headers[colNum - 1];
            // headerName을 문자열로 변환
            const headerStr =
              typeof headerName === "string"
                ? headerName
                : String(headerName || "");
            const normalizedHeader = headerStr
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

        // 엑셀 버퍼 생성
        const buffer = await wb.xlsx.writeBuffer();
        const fileName = `${dateStr}_외주발주_${vendor}.xlsx`;
        zip.file(fileName, buffer);
      }

      // ZIP 파일 생성
      const zipBuffer = await zip.generateAsync({type: "nodebuffer"});
      const zipFileName = `${dateStr}_외주발주.zip`;
      const encodedZipFileName = encodeURIComponent(zipFileName);
      const contentDisposition = `attachment; filename="outsource.zip"; filename*=UTF-8''${encodedZipFileName}`;

      // 외주 발주서 다운로드가 성공하면 주문상태 업데이트
      // 외주 발주서인 경우 필터링된 데이터의 실제 다운로드된 행들만 업데이트
      const idsToUpdate = downloadedRowIds;
      if (idsToUpdate && idsToUpdate.length > 0) {
        try {
          // 효율적인 단일 쿼리로 모든 row의 주문상태를 "발주서 다운"으로 업데이트
          await sql`
            UPDATE upload_rows
            SET row_data = jsonb_set(row_data, '{주문상태}', '"발주서 다운"', true)
            WHERE id = ANY(${idsToUpdate})
          `;
        } catch (updateError) {
          console.error("주문상태 업데이트 실패:", updateError);
          // 주문상태 업데이트 실패해도 다운로드는 성공으로 처리
        }
      }

      const responseHeaders = new Headers();
      responseHeaders.set("Content-Type", "application/zip");
      responseHeaders.set("Content-Disposition", contentDisposition);

      return new Response(Buffer.from(zipBuffer), {
        headers: responseHeaders,
      });
    }

    // 일반 발주서: productId가 있으면 ID로, 없으면 매핑코드로 가격, 사방넷명 정보 조회
    const productIds = [
      ...new Set(dataRows.map((row: any) => row.productId).filter(Boolean)),
    ];
    const productCodes = [
      ...new Set(
        dataRows
          .filter((row: any) => !row.productId && row.매핑코드)
          .map((row: any) => row.매핑코드)
      ),
    ];
    const productSalePriceMap: {[code: string]: number | null} = {};
    const productSabangNameMap: {[code: string]: string | null} = {};
    const productVendorNameMap: {[code: string]: string | null} = {};
    const productSalePriceMapById: {[id: string | number]: number | null} = {};
    const productSabangNameMapById: {[id: string | number]: string | null} = {};
    const productVendorNameMapById: {[id: string | number]: string | null} = {};

    // productId로 조회
    if (productIds.length > 0) {
      const productsById = await sql`
        SELECT id, code, sale_price, sabang_name as "sabangName", purchase as "vendorName"
        FROM products
        WHERE id = ANY(${productIds})
      `;

      productsById.forEach((p: any) => {
        if (p.id) {
          if (p.sale_price !== null && p.sale_price !== undefined) {
            productSalePriceMapById[p.id] = p.sale_price;
          }
          if (p.sabangName !== undefined) {
            productSabangNameMapById[p.id] = p.sabangName;
          }
          if (p.vendorName !== undefined) {
            productVendorNameMapById[p.id] = p.vendorName;
          }
        }
      });
    }

    // 매핑코드로 조회 (productId가 없는 경우)
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

    // 데이터에 공급가와 사방넷명 주입: productId가 있으면 ID로, 없으면 매핑코드로 찾기
    dataRows.forEach((row: any) => {
      if (row.productId) {
        // productId로 조회한 정보 사용
        if (productSalePriceMapById[row.productId] !== undefined) {
          const salePrice = productSalePriceMapById[row.productId];
          if (salePrice !== null) {
            row["공급가"] = salePrice;
          }
        }
        if (productSabangNameMapById[row.productId] !== undefined) {
          const sabangName = productSabangNameMapById[row.productId];
          if (
            sabangName !== null &&
            sabangName !== undefined &&
            String(sabangName).trim() !== ""
          ) {
            row["사방넷명"] = sabangName;
            row["sabangName"] = sabangName;
            row["sabang_name"] = sabangName;
          } else {
            delete row["사방넷명"];
            delete row["sabangName"];
            delete row["sabang_name"];
          }
        } else {
          delete row["사방넷명"];
          delete row["sabangName"];
          delete row["sabang_name"];
        }
        if (productVendorNameMapById[row.productId] !== undefined) {
          row.업체명 =
            productVendorNameMapById[row.productId] || "매입처미지정";
        }
      } else if (row.매핑코드) {
        // 매핑코드로 조회한 정보 사용
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
            row["sabangName"] = sabangName;
            row["sabang_name"] = sabangName;
          } else {
            delete row["사방넷명"];
            delete row["sabangName"];
            delete row["sabang_name"];
          }
        } else {
          delete row["사방넷명"];
          delete row["sabangName"];
          delete row["sabang_name"];
        }
        if (productVendorNameMap[row.매핑코드] !== undefined) {
          row.업체명 = productVendorNameMap[row.매핑코드] || "매입처미지정";
        }
      }
    });

    // 전화번호 필드들에 하이픈 추가 가공
    dataRows = dataRows.map((row: any) => {
      const processedRow = {...row};

      // 수취인 전화번호 가공
      if (processedRow["수취인 전화번호"]) {
        processedRow["수취인 전화번호"] = formatPhoneNumber(
          processedRow["수취인 전화번호"]
        );
      }

      // 주문자 전화번호 가공
      if (processedRow["주문자 전화번호"]) {
        processedRow["주문자 전화번호"] = formatPhoneNumber(
          processedRow["주문자 전화번호"]
        );
      }

      // 전화번호1 가공
      if (processedRow["전화번호1"]) {
        processedRow["전화번호1"] = formatPhoneNumber(
          processedRow["전화번호1"]
        );
      }

      // 전화번호2 가공
      if (processedRow["전화번호2"]) {
        processedRow["전화번호2"] = formatPhoneNumber(
          processedRow["전화번호2"]
        );
      }

      // 전화번호 가공
      if (processedRow["전화번호"]) {
        processedRow["전화번호"] = formatPhoneNumber(processedRow["전화번호"]);
      }

      return processedRow;
    });

    // 데이터를 2차원 배열로 변환 (mapDataToTemplate 함수 사용)
    let excelData = dataRows.map((row: any) => {
      // 각 헤더에 대해 mapDataToTemplate을 사용하여 데이터 매핑
      return headers.map((header: any) => {
        // header를 문자열로 변환
        const headerStr =
          typeof header === "string" ? header : String(header || "");

        let value = mapDataToTemplate(row, headerStr, {
          templateName: templateData.name,
          formatPhone: true, // 외주 발주서에서는 전화번호에 하이픈 추가
          preferSabangName:
            preferSabangName !== undefined ? preferSabangName : true,
        });

        // 모든 값을 문자열로 변환 (0 유지)
        let stringValue = value != null ? String(value) : "";

        // 전화번호가 10-11자리 숫자이고 0으로 시작하지 않으면 앞에 0 추가 및 하이픈 추가
        if (headerStr.includes("전화") || headerStr.includes("연락")) {
          // 이미 하이픈이 있는 경우는 건너뜀 (mapDataToTemplate에서 이미 처리됨)
          if (!stringValue.includes("-")) {
            const numOnly = stringValue.replace(/\D/g, ""); // 숫자만 추출
            if (
              (numOnly.length === 10 || numOnly.length === 11) &&
              !numOnly.startsWith("0")
            ) {
              stringValue = "0" + numOnly; // 숫자만 사용하고 0 추가
            } else if (numOnly.length > 0) {
              stringValue = numOnly; // 하이픈 등 제거하고 숫자만
            }

            // 하이픈 추가하여 전화번호 형식 맞춤
            stringValue = formatPhoneNumber(stringValue);
          }
        }

        // 우편번호가 4-5자리 숫자면 5자리로 맞춤 (앞에 0 추가)
        if (headerStr.includes("우편")) {
          const numOnly = stringValue.replace(/\D/g, "");
          if (numOnly.length >= 4 && numOnly.length <= 5) {
            stringValue = numOnly.padStart(5, "0");
          }
        }

        return stringValue;
      });
    });

    // 정렬: 상품명 또는 사방넷명 오름차순 후 수취인명 오름차순
    excelData = sortExcelData(excelData, columnOrder, {
      preferSabangName:
        preferSabangName !== undefined ? preferSabangName : true,
      originalData: dataRows,
    });

    // 정렬된 데이터를 엑셀에 추가
    excelData.forEach((rowDatas) => {
      const appendRow = sheet.addRow(rowDatas);

      // 전화번호, 우편번호, 코드 관련 필드는 텍스트 형식으로 설정 (앞자리 0 유지)
      appendRow.eachCell((cell: any, colNum: any) => {
        const headerName = headers[colNum - 1];
        // headerName을 문자열로 변환
        const headerStr =
          typeof headerName === "string"
            ? headerName
            : String(headerName || "");
        const normalizedHeader = headerStr.replace(/\s+/g, "").toLowerCase();

        const isTextColumn =
          normalizedHeader.includes("전화") ||
          normalizedHeader.includes("연락") ||
          normalizedHeader.includes("우편") ||
          normalizedHeader.includes("코드");

        if (isTextColumn) {
          cell.numFmt = "@"; // 텍스트 형식
        }
      });
    });

    // 엑셀 파일 생성
    const buffer = await wb.xlsx.writeBuffer();

    // 파일명 생성
    const dateStr = new Date().toISOString().split("T")[0];
    const fileName = `${dateStr}_${templateData.name || "download"}.xlsx`;

    // Windows에서 한글 파일명 깨짐 방지를 위한 RFC 5987 형식 인코딩
    // HTTP 헤더는 ASCII만 허용하므로 filename에는 ASCII fallback 추가
    const asciiFallbackBase =
      `${dateStr}_${templateData.name || "download"}`
        .replace(/[^\x00-\x7F]/g, "")
        .replace(/\s+/g, "_") || "download";
    const safeFileName = `${asciiFallbackBase}.xlsx`; // ASCII fallback
    const encodedFileName = encodeURIComponent(fileName); // UTF-8 인코딩
    // filename* 우선, filename ASCII fallback 병행
    const contentDisposition = `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`;

    // 발주서 다운로드가 성공하면 주문상태 업데이트
    if (rowIds && rowIds.length > 0) {
      // 주문상태 업데이트를 비동기로 처리하여 다운로드 속도 향상
      setImmediate(async () => {
        try {
          // 효율적인 단일 쿼리로 모든 row의 주문상태를 "발주서 다운"으로 업데이트
          await sql`
            UPDATE upload_rows
            SET row_data = jsonb_set(row_data, '{주문상태}', '"발주서 다운"', true)
            WHERE id = ANY(${rowIds})
          `;
        } catch (updateError) {
          console.error("주문상태 업데이트 실패:", updateError);
        }
      });
    }

    const responseHeaders = new Headers();
    responseHeaders.set(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    responseHeaders.set("Content-Disposition", contentDisposition);

    return new Response(buffer, {
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({message: "Error", error: error}, {status: 500});
  }
}
