import sql from "@/lib/db";
import {NextRequest, NextResponse} from "next/server";
import {getCompanyIdFromRequest} from "@/lib/company";
import * as Excel from "exceljs";
import * as XLSX from "xlsx";
import {mapDataToTemplate, sortExcelData} from "@/utils/excelDataMapping";
import {
  buildFilterConditions,
  buildFilterQuery,
  UploadFilters,
} from "@/utils/uploadFilters";
import {generateExcelFileName} from "@/utils/filename";

export async function POST(request: NextRequest) {
  try {
    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400}
      );
    }

    const body = await request.json();
    const {templateId, rowIds, filters, rows, preferSabangName} = body;

    if (!templateId) {
      return NextResponse.json(
        {success: false, error: "템플릿 ID가 필요합니다."},
        {status: 400}
      );
    }

    // console.log("rows", rows);

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
      const {conditions} = buildFilterConditions(filters as UploadFilters, {
        companyId,
      });
      const filteredData = await buildFilterQuery(conditions, true);
      // ID와 row_data를 함께 저장하여 내주 필터링 후에도 ID 추적 가능하도록 함
      dataRowsWithIds = filteredData.map((r: any) => ({
        id: r.id,
        row_data: r.row_data || {},
      }));
      dataRows = dataRowsWithIds.map((r: any) => r.row_data);
    } else {
      // 템플릿명 확인 (내주 발주서인지 체크)
      const templateName = (templateData.name || "").normalize("NFC").trim();
      const isInhouseTemplate = templateName.includes("내주");

      // 내주 발주서인 경우: 필터가 없어도 "내주"만 조회
      // CJ외주 발주서에 포함되는 매핑코드들(106464, 108640, 108788, 108879, 108221) 제외
      if (isInhouseTemplate) {
        const allData = await sql`
          SELECT ur.id, ur.row_data
          FROM upload_rows ur
          INNER JOIN uploads u ON ur.upload_id = u.id
          WHERE ur.row_data->>'내외주' = '내주'
            AND (ur.row_data->>'매핑코드' IS NULL OR ur.row_data->>'매핑코드' NOT IN ('106464', '108640', '108788', '108879', '108221'))
          ORDER BY u.created_at DESC, ur.id DESC
        `;
        // ID와 row_data를 함께 저장
        dataRowsWithIds = allData.map((r: any) => ({
          id: r.id,
          row_data: r.row_data || {},
        }));
        dataRows = dataRowsWithIds.map((r: any) => r.row_data);

        // 전체 다운로드 시 주문상태 업데이트 (rowIds가 없을 때)
        if (!rowIds || rowIds.length === 0) {
          try {
            const idsToUpdate = allData.map((r: any) => r.id);

            if (idsToUpdate.length > 0) {
              // 효율적인 단일 쿼리로 모든 row의 주문상태를 "발주서 다운"으로 업데이트
              // 현재 상태가 "공급중"인 경우에만 업데이트 (뒷단계로 돌아가지 않도록)
              // "사방넷 다운", "배송중" 상태는 유지됨 (조건에 포함되지 않으므로 업데이트되지 않음)
              await sql`
                UPDATE upload_rows
                SET row_data = jsonb_set(row_data, '{주문상태}', '"발주서 다운"', true)
                WHERE id = ANY(${idsToUpdate})
                  AND (row_data->>'주문상태' IS NULL OR row_data->>'주문상태' = '공급중')
              `;
            }
          } catch (updateError) {
            console.error("주문상태 업데이트 실패:", updateError);
            // 주문상태 업데이트 실패해도 다운로드는 성공으로 처리
          }
        }
      } else {
        // 내주 발주서가 아닌 경우: 모든 데이터 조회
        const allData = await sql`
          SELECT ${
            !rowIds || rowIds.length === 0 ? sql`ur.id,` : sql``
          } ur.row_data
          FROM upload_rows ur
          INNER JOIN uploads u ON ur.upload_id = u.id
          ORDER BY u.created_at DESC, ur.id DESC
        `;
        // ID와 row_data를 함께 저장
        dataRowsWithIds = allData.map((r: any) => ({
          id: r.id,
          row_data: r.row_data || {},
        }));
        dataRows = dataRowsWithIds.map((r: any) => r.row_data);

        // 전체 다운로드 시 주문상태 업데이트 (rowIds가 없을 때)
        if (!rowIds || rowIds.length === 0) {
          try {
            const idsToUpdate = allData.map((r: any) => r.id);

            if (idsToUpdate.length > 0) {
              // 효율적인 단일 쿼리로 모든 row의 주문상태를 "발주서 다운"으로 업데이트
              // 현재 상태가 "공급중"인 경우에만 업데이트 (뒷단계로 돌아가지 않도록)
              // "사방넷 다운", "배송중" 상태는 유지됨 (조건에 포함되지 않으므로 업데이트되지 않음)
              await sql`
                UPDATE upload_rows
                SET row_data = jsonb_set(row_data, '{주문상태}', '"발주서 다운"', true)
                WHERE id = ANY(${idsToUpdate})
                  AND (row_data->>'주문상태' IS NULL OR row_data->>'주문상태' = '공급중')
              `;
            }
          } catch (updateError) {
            console.error("주문상태 업데이트 실패:", updateError);
            // 주문상태 업데이트 실패해도 다운로드는 성공으로 처리
          }
        }
      }
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
    const productSalePriceMap: {[id: string | number]: number | null} = {};
    const productSabangNameMap: {[id: string | number]: string | null} = {};
    const productVendorNameMap: {[id: string | number]: string | null} = {};
    const productSalePriceMapByCode: {[code: string]: number | null} = {};
    const productSabangNameMapByCode: {[code: string]: string | null} = {};
    const productVendorNameMapByCode: {[code: string]: string | null} = {};

    // 사용자가 선택한 상품 ID로만 조회
    if (productIds.length > 0) {
      const productsById = await sql`
        SELECT id, code, sale_price, sabang_name as "sabangName", purchase as "vendorName"
        FROM products
        WHERE id = ANY(${productIds})
      `;

      productsById.forEach((p: any) => {
        if (p.id) {
          if (p.sale_price !== null && p.sale_price !== undefined) {
            productSalePriceMap[p.id] = p.sale_price;
          }
          if (p.sabangName !== undefined) {
            productSabangNameMap[p.id] = p.sabangName;
          }
          if (p.vendorName !== undefined) {
            productVendorNameMap[p.id] = p.vendorName;
          }
        }
      });
    }

    // productId가 없는 경우 매핑코드로 조회
    if (productCodes.length > 0) {
      const productsByCode = await sql`
        SELECT code, sale_price, sabang_name as "sabangName", purchase as "vendorName"
        FROM products
        WHERE code = ANY(${productCodes})
      `;

      productsByCode.forEach((p: any) => {
        if (p.code) {
          if (p.sale_price !== null && p.sale_price !== undefined) {
            productSalePriceMapByCode[p.code] = p.sale_price;
          }
          if (p.sabangName !== undefined) {
            productSabangNameMapByCode[p.code] = p.sabangName;
          }
          if (p.vendorName !== undefined) {
            productVendorNameMapByCode[p.code] = p.vendorName;
          }
        }
      });
    }

    // 템플릿명 확인 (내주 발주서인지 체크)
    const templateName = (templateData.name || "").normalize("NFC").trim();
    const isInhouse = templateName.includes("내주");
    const cjOutsourceCodes = ["106464", "108640", "108788", "108879", "108221"];

    // 내주 발주서인 경우: 내주 데이터만 필터링
    // CJ외주 발주서에 포함되는 매핑코드들(106464, 108640, 108788, 108879, 108221) 제외
    if (isInhouse) {
      if (dataRowsWithIds.length > 0) {
        // ID와 함께 필터링하여 실제 다운로드된 행의 ID 추적
        const filteredRowsWithIds = dataRowsWithIds.filter(
          (item: any) =>
            item.row_data.내외주 === "내주" &&
            !cjOutsourceCodes.includes(item.row_data.매핑코드)
        );
        dataRows = filteredRowsWithIds.map((item: any) => item.row_data);
        downloadedRowIds = filteredRowsWithIds.map((item: any) => item.id);
      } else {
        // rows가 직접 전달된 경우
        dataRows = dataRows.filter(
          (row: any) =>
            row.내외주 === "내주" && !cjOutsourceCodes.includes(row.매핑코드)
        );
      }

      if (dataRows.length === 0) {
        return NextResponse.json(
          {success: false, error: "내주 데이터가 없습니다."},
          {status: 404}
        );
      }
    } else if (dataRowsWithIds.length > 0) {
      // 내주 발주서가 아닌 경우에도 ID 추적
      downloadedRowIds = dataRowsWithIds.map((item: any) => item.id);
    }

    // 데이터에 공급가와 사방넷명 주입: productId가 있으면 ID로, 없으면 매핑코드로 찾기
    dataRows.forEach((row: any) => {
      if (row.productId) {
        // 사용자가 선택한 상품 ID로만 찾기
        if (productSalePriceMap[row.productId] !== undefined) {
          const salePrice = productSalePriceMap[row.productId];
          if (salePrice !== null) {
            row["공급가"] = salePrice;
          }
        }
        // 사방넷명 설정: productSabangNameMap에 있으면 사용, 없으면 null로 설정 (상품명으로 fallback)
        if (productSabangNameMap[row.productId] !== undefined) {
          const sabangName = productSabangNameMap[row.productId];
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
      } else if (row.매핑코드) {
        // productId가 없으면 매핑코드로 찾기
        if (productSalePriceMapByCode[row.매핑코드] !== undefined) {
          const salePrice = productSalePriceMapByCode[row.매핑코드];
          if (salePrice !== null) {
            row["공급가"] = salePrice;
          }
        }
        // 사방넷명 설정: productSabangNameMapByCode에 있으면 사용
        if (productSabangNameMapByCode[row.매핑코드] !== undefined) {
          const sabangName = productSabangNameMapByCode[row.매핑코드];
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
          // productSabangNameMapByCode에 없는 경우 명시적으로 제거 (상품명으로 fallback)
          delete row["사방넷명"];
          delete row["sabangName"];
          delete row["sabang_name"];
        }
      } else {
        // productId와 매핑코드가 모두 없는 경우 명시적으로 제거 (상품명으로 fallback)
        delete row["사방넷명"];
        delete row["sabangName"];
        delete row["sabang_name"];
      }
    });

    // 데이터를 2차원 배열로 변환 (mapDataToTemplate 함수 사용)
    let excelData = dataRows.map((row: any) => {
      // 각 헤더에 대해 mapDataToTemplate을 사용하여 데이터 매핑
      return headers.map((header: any) => {
        let value = mapDataToTemplate(row, header, {
          templateName: templateData.name,
          isInhouse: isInhouse, // 내주 발주서임을 명시적으로 전달
          preferSabangName:
            preferSabangName !== undefined ? preferSabangName : true,
        });

        // 모든 값을 문자열로 변환 (0 유지)
        let stringValue = value != null ? String(value) : "";

        // 주문번호인 경우 내부코드 사용
        if (header === "주문번호" || header.includes("주문번호")) {
          stringValue = row["내부코드"] || stringValue;
        }

        // 전화번호가 10-11자리 숫자이고 0으로 시작하지 않으면 앞에 0 추가
        if (header.includes("전화") || header.includes("연락")) {
          const numOnly = stringValue.replace(/\D/g, ""); // 숫자만 추출
          if (
            (numOnly.length === 10 || numOnly.length === 11) &&
            !numOnly.startsWith("0")
          ) {
            stringValue = "0" + numOnly; // 숫자만 사용하고 0 추가
          } else if (numOnly.length > 0) {
            stringValue = numOnly; // 하이픈 등 제거하고 숫자만
          }
        }

        // 우편번호가 4-5자리 숫자면 5자리로 맞춤 (앞에 0 추가)
        if (header.includes("우편")) {
          const numOnly = stringValue.replace(/\D/g, "");
          if (numOnly.length >= 4 && numOnly.length <= 5) {
            stringValue = numOnly.padStart(5, "0");
          }
        }

        return stringValue;
      });
    });

    // 정렬: 상품명 오름차순 후 수취인명 오름차순
    excelData = sortExcelData(excelData, columnOrder);

    // 수취인 정보 필드 인덱스 찾기
    const receiverNameIndex = headers.findIndex(
      (h: string) =>
        h.includes("수취인명") ||
        h === "수취인명" ||
        h === "수취인" ||
        h === "받는사람"
    );
    const receiverPhoneIndex = headers.findIndex(
      (h: string) =>
        h.includes("수취인전화") ||
        h === "수취인전화번호" ||
        h === "수취인 전화번호"
    );
    const zipCodeIndex = headers.findIndex(
      (h: string) => h.includes("우편") || h === "우편번호" || h === "우편"
    );
    const receiverAddressIndex = headers.findIndex(
      (h: string) =>
        h.includes("수취인주소") ||
        h === "수취인주소" ||
        h === "수취인 주소" ||
        h === "받는사람주소"
    );

    // 중복값 찾기: 각 필드별로 값과 행 인덱스 매핑
    const receiverNameMap = new Map<string, number[]>();
    const receiverPhoneMap = new Map<string, number[]>();
    const zipCodeMap = new Map<string, number[]>();
    const receiverAddressMap = new Map<string, number[]>();

    excelData.forEach((rowData: any[], rowIndex: number) => {
      // 수취인명 중복 체크
      if (receiverNameIndex >= 0 && rowData[receiverNameIndex]) {
        const value = String(rowData[receiverNameIndex]).trim();
        if (value) {
          if (!receiverNameMap.has(value)) {
            receiverNameMap.set(value, []);
          }
          receiverNameMap.get(value)!.push(rowIndex);
        }
      }

      // 수취인전화번호 중복 체크
      if (receiverPhoneIndex >= 0 && rowData[receiverPhoneIndex]) {
        const value = String(rowData[receiverPhoneIndex]).trim();
        if (value) {
          if (!receiverPhoneMap.has(value)) {
            receiverPhoneMap.set(value, []);
          }
          receiverPhoneMap.get(value)!.push(rowIndex);
        }
      }

      // 우편번호 중복 체크
      if (zipCodeIndex >= 0 && rowData[zipCodeIndex]) {
        const value = String(rowData[zipCodeIndex]).trim();
        if (value) {
          if (!zipCodeMap.has(value)) {
            zipCodeMap.set(value, []);
          }
          zipCodeMap.get(value)!.push(rowIndex);
        }
      }

      // 수취인주소 중복 체크
      if (receiverAddressIndex >= 0 && rowData[receiverAddressIndex]) {
        const value = String(rowData[receiverAddressIndex]).trim();
        if (value) {
          if (!receiverAddressMap.has(value)) {
            receiverAddressMap.set(value, []);
          }
          receiverAddressMap.get(value)!.push(rowIndex);
        }
      }
    });

    // 중복된 행 인덱스 집합 생성
    const duplicateRows = new Set<number>();
    receiverNameMap.forEach((indices) => {
      if (indices.length > 1) {
        indices.forEach((idx) => duplicateRows.add(idx));
      }
    });
    receiverPhoneMap.forEach((indices) => {
      if (indices.length > 1) {
        indices.forEach((idx) => duplicateRows.add(idx));
      }
    });
    zipCodeMap.forEach((indices) => {
      if (indices.length > 1) {
        indices.forEach((idx) => duplicateRows.add(idx));
      }
    });
    receiverAddressMap.forEach((indices) => {
      if (indices.length > 1) {
        indices.forEach((idx) => duplicateRows.add(idx));
      }
    });

    // 정렬된 데이터를 엑셀에 추가
    excelData.forEach((rowDatas, rowIndex) => {
      const appendRow = sheet.addRow(rowDatas);

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

        // 중복값 배경색 처리 (연한 빨강: FFE6E6)
        const isReceiverNameCol =
          colNum - 1 === receiverNameIndex && receiverNameIndex >= 0;
        const isReceiverPhoneCol =
          colNum - 1 === receiverPhoneIndex && receiverPhoneIndex >= 0;
        const isZipCodeCol = colNum - 1 === zipCodeIndex && zipCodeIndex >= 0;
        const isReceiverAddressCol =
          colNum - 1 === receiverAddressIndex && receiverAddressIndex >= 0;

        if (
          duplicateRows.has(rowIndex) &&
          (isReceiverNameCol ||
            isReceiverPhoneCol ||
            isZipCodeCol ||
            isReceiverAddressCol)
        ) {
          // 해당 필드가 중복인지 확인
          let isDuplicate = false;
          const cellValue = String(cell.value || "").trim();

          if (isReceiverNameCol && cellValue) {
            const indices = receiverNameMap.get(cellValue);
            isDuplicate = indices && indices.length > 1 ? true : false;
          } else if (isReceiverPhoneCol && cellValue) {
            const indices = receiverPhoneMap.get(cellValue);
            isDuplicate = indices && indices.length > 1 ? true : false;
          } else if (isZipCodeCol && cellValue) {
            const indices = zipCodeMap.get(cellValue);
            isDuplicate = indices && indices.length > 1 ? true : false;
          } else if (isReceiverAddressCol && cellValue) {
            const indices = receiverAddressMap.get(cellValue);
            isDuplicate = indices && indices.length > 1 ? true : false;
          }

          if (isDuplicate) {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: {argb: "FFE6E6"}, // 연한 빨강 배경
            };
          }
        }
      });
    });

    // 내주 발주서인 경우: .xls 형식으로 변환 (97~03 바이너리 형식)
    let buffer: ArrayBuffer;
    let fileExtension = ".xlsx";
    let contentType =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    if (isInhouse) {
      // ExcelJS 워크북의 데이터를 추출하여 xlsx 라이브러리로 .xls 형식으로 변환
      const workbookData: any[][] = [];
      
      // 헤더 행 추가
      const headerRow: any[] = [];
      headers.forEach((header: string) => {
        headerRow.push(header);
      });
      workbookData.push(headerRow);

      // 데이터 행 추가
      excelData.forEach((rowData: any[]) => {
        workbookData.push(rowData);
      });

      // xlsx 라이브러리로 워크북 생성
      const xlsxWorkbook = XLSX.utils.book_new();
      const xlsxWorksheet = XLSX.utils.aoa_to_sheet(workbookData);

      // 열 너비 설정
      const colWidths = headers.map((headerName: string) => {
        const width =
          typeof columnWidths === "object" && columnWidths[headerName]
            ? columnWidths[headerName]
            : 15;
        return {wch: width};
      });
      xlsxWorksheet["!cols"] = colWidths;

      // 워크시트를 워크북에 추가
      XLSX.utils.book_append_sheet(xlsxWorkbook, xlsxWorksheet, templateData.worksheetName || "Sheet1");

      // .xls 형식으로 변환 (bookType: 'biff8'는 Excel 97-2003 바이너리 형식)
      buffer = XLSX.write(xlsxWorkbook, {
        type: "buffer",
        bookType: "biff8", // Excel 97-2003 바이너리 형식
      }) as ArrayBuffer;
      fileExtension = ".xls";
      contentType = "application/vnd.ms-excel";
    } else {
      // 내주 발주서가 아닌 경우: 기존대로 .xlsx 형식
      buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    }

    // 파일명 생성
    const fileName = generateExcelFileName(templateData.name || "download");

    // Windows에서 한글 파일명 깨짐 방지를 위한 RFC 5987 형식 인코딩
    // HTTP 헤더는 ASCII만 허용하므로 filename에는 ASCII fallback 추가
    const asciiFallbackBase =
      fileName
        .replace(/\.xlsx$/, "")
        .replace(/[^\x00-\x7F]/g, "")
        .replace(/\s+/g, "_") || "download";
    const safeFileName = `${asciiFallbackBase}${fileExtension}`; // 확장자 동적 변경
    const encodedFileName = encodeURIComponent(
      fileName.replace(/\.xlsx$/, fileExtension)
    ); // UTF-8 인코딩
    // filename* 우선, filename ASCII fallback 병행
    const contentDisposition = `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`;

    const responseHeaders = new Headers();
    // 발주서 다운로드가 성공하면 주문상태 업데이트
    // 내주 발주서인 경우 필터링된 데이터의 실제 다운로드된 행들만 업데이트
    // 내주 발주서가 아닌 경우: rowIds가 있으면 선택된 행, 없으면 필터링된 데이터의 실제 다운로드된 행들 업데이트
    const idsToUpdate = isInhouse
      ? downloadedRowIds
      : rowIds && rowIds.length > 0
      ? rowIds
      : downloadedRowIds;
    if (idsToUpdate && idsToUpdate.length > 0) {
      try {
        // 효율적인 단일 쿼리로 모든 row의 주문상태를 "발주서 다운"으로 업데이트
        // 현재 상태가 "공급중"인 경우에만 업데이트 (뒷단계로 돌아가지 않도록)
        await sql`
          UPDATE upload_rows
          SET row_data = jsonb_set(row_data, '{주문상태}', '"발주서 다운"', true)
          WHERE id = ANY(${idsToUpdate})
            AND (row_data->>'주문상태' IS NULL OR row_data->>'주문상태' = '공급중')
        `;
      } catch (updateError) {
        console.error("주문상태 업데이트 실패:", updateError);
        // 주문상태 업데이트 실패해도 다운로드는 성공으로 처리
      }
    }

    responseHeaders.set("Content-Type", contentType);
    responseHeaders.set("Content-Disposition", contentDisposition);

    return new Response(buffer, {
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({message: "Error", error: error}, {status: 500});
  }
}
