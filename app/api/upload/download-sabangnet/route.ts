import sql from "@/lib/db";
import {NextRequest, NextResponse} from "next/server";
import * as Excel from "exceljs";
import {mapDataToTemplate, sortExcelData} from "@/utils/excelDataMapping";
import JSZip from "jszip";

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
      const updateConditions: any[] = []; // UPDATE 쿼리용 조건 (별도 생성)

      if (type) {
        conditions.push(sql`ur.row_data->>'내외주' = ${type}`);
        updateConditions.push(sql`upload_rows.row_data->>'내외주' = ${type}`);
      }
      if (postType) {
        conditions.push(sql`ur.row_data->>'택배사' = ${postType}`);
        updateConditions.push(
          sql`upload_rows.row_data->>'택배사' = ${postType}`
        );
      }
      if (vendor) {
        conditions.push(sql`ur.row_data->>'업체명' = ${vendor}`);
        updateConditions.push(sql`upload_rows.row_data->>'업체명' = ${vendor}`);
      }
      if (filters.company) {
        conditions.push(sql`ur.row_data->>'업체명' = ${filters.company}`);
        updateConditions.push(
          sql`upload_rows.row_data->>'업체명' = ${filters.company}`
        );
      }
      if (orderStatus) {
        conditions.push(sql`ur.row_data->>'주문상태' = ${orderStatus}`);
        updateConditions.push(
          sql`upload_rows.row_data->>'주문상태' = ${orderStatus}`
        );
      }

      if (dbField && searchPattern) {
        conditions.push(sql`ur.row_data->>${dbField} ILIKE ${searchPattern}`);
        updateConditions.push(
          sql`upload_rows.row_data->>${dbField} ILIKE ${searchPattern}`
        );
      }
      if (uploadTimeFrom) {
        conditions.push(sql`u.created_at >= ${uploadTimeFrom}::date`);
        updateConditions.push(sql`u.created_at >= ${uploadTimeFrom}::date`);
      }
      if (uploadTimeTo) {
        conditions.push(
          sql`u.created_at < (${uploadTimeTo}::date + INTERVAL '1 day')`
        );
        updateConditions.push(
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
      // ID와 row_data를 함께 저장하여 주문상태 업데이트 시 사용
      dataRowsWithIds = filteredData.map((r: any) => ({
        id: r.id,
        row_data: r.row_data || {},
      }));
      dataRows = dataRowsWithIds.map((r: any) => r.row_data);
      downloadedRowIds = dataRowsWithIds.map((r: any) => r.id);
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
      downloadedRowIds = dataRowsWithIds.map((r: any) => r.id);
    }

    // 사방넷 등록 양식인 경우: 업체명별로 그룹화하여 ZIP 생성
    const templateName = (templateData.name || "").normalize("NFC").trim();
    const isSabangnet = templateName.includes("사방넷");

    if (isSabangnet) {
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

      // 업체명이 없는 경우 기본값 설정 (테이블 데이터의 원래 업체명 사용)
      dataRows.forEach((row: any) => {
        if (!row.업체명 || row.업체명.trim() === "") {
          row.업체명 = "업체미지정";
        }

        // 공급가 및 사방넷명 주입: productId가 있으면 ID로, 없으면 매핑코드로 찾기
        if (row.productId) {
          // 사용자가 선택한 상품 ID로만 찾기
          if (productSalePriceMap[row.productId] !== undefined) {
            const salePrice = productSalePriceMap[row.productId];
            if (salePrice !== null) {
              row["판매가"] = salePrice;
              row["sale_price"] = salePrice;
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
              row["판매가"] = salePrice;
              row["sale_price"] = salePrice;
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

      // 업체명별로 그룹화
      const vendorGroups: {[vendor: string]: any[]} = {};
      dataRows.forEach((row) => {
        const vendor = row.업체명;
        if (!vendorGroups[vendor]) {
          vendorGroups[vendor] = [];
        }
        vendorGroups[vendor].push(row);
      });

      // ZIP 파일 생성
      const zip = new JSZip();
      const today = new Date();
      const dateStr = `${today.getFullYear()}${String(
        today.getMonth() + 1
      ).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;

      // 각 업체명별로 엑셀 파일 생성
      for (const [vendor, vendorRows] of Object.entries(vendorGroups)) {
        const wb = new Excel.Workbook();
        const sheet = wb.addWorksheet(templateData.worksheetName);

        // 헤더 추가
        const headerRow = sheet.addRow(headers);
        headerRow.height = 30.75;

        // 헤더 스타일
        headerRow.eachCell((cell, colNum) => {
          let bgColor = "ffffffff";
          // 기본 스타일 적용 (필요에 따라 수정)
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
            color: {argb: "ff252525"},
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
          return headers.map((header: any, headerIdx: number) => {
            // header를 문자열로 변환
            const headerStr =
              typeof header === "string" ? header : String(header || "");

            let value = mapDataToTemplate(row, headerStr, {
              templateName: templateData.name,
              preferSabangName: preferSabangName !== undefined ? preferSabangName : true,
            });

            let stringValue = value != null ? String(value) : "";

            // 주문번호는 내부코드로 매칭
            if (headerStr === "주문번호" || headerStr.includes("주문번호")) {
              stringValue = row["내부코드"] || stringValue;
            }

            // 배송희망일은 오늘 날짜로 설정 (YYYYMMDD 형식)
            if (headerStr === "배송희망일" || headerStr.includes("배송희망")) {
              stringValue = dateStr;
            }

            // 전화번호2는 주문자 전화번호를 메인으로 하고, 데이터가 없는 경우엔 수취인 전화번호가 입력되게
            if (headerStr === "전화번호2" || headerStr.includes("전화번호2")) {
              const ordererPhone =
                row["주문자 전화번호"] || row["주문자전화번호"] || "";
              const receiverPhone =
                row["수취인 전화번호"] || row["수취인전화번호"] || "";
              stringValue = ordererPhone || receiverPhone || "";
              // 전화번호 포맷팅
              if (stringValue) {
                const numOnly = stringValue.replace(/\D/g, "");
                if (
                  (numOnly.length === 10 || numOnly.length === 11) &&
                  !numOnly.startsWith("0")
                ) {
                  stringValue = "0" + numOnly;
                } else if (numOnly.length > 0) {
                  stringValue = numOnly;
                }
              }
            }

            // 받는사람, 상품명 열에서 공백 제거
            if (
              headerStr === "받는사람" ||
              headerStr.includes("받는사람") ||
              headerStr === "상품명" ||
              headerStr.includes("상품명")
            ) {
              stringValue = stringValue.replace(/\s+/g, "");
            }

            return stringValue;
          });
        });

        // 정렬
        excelData = sortExcelData(excelData, columnOrder);

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
        const fileName = `${dateStr}_사방넷등록_${vendor}.xlsx`;
        zip.file(fileName, buffer);
      }

      // 사방넷 다운로드가 성공하면 주문상태 업데이트
      // rowIds가 있으면 선택된 행, 없으면 필터링된 데이터의 실제 다운로드된 행들 업데이트
      const idsToUpdate =
        rowIds && rowIds.length > 0 ? rowIds : downloadedRowIds;
      if (idsToUpdate && idsToUpdate.length > 0) {
        try {
          // 효율적인 단일 쿼리로 모든 row의 주문상태를 "사방넷 다운"으로 업데이트
          const updateResult = await sql`
            UPDATE upload_rows
            SET row_data = jsonb_set(row_data, '{주문상태}', '"사방넷 다운"', true)
            WHERE id = ANY(${idsToUpdate})
          `;
        } catch (updateError) {
          console.error("주문상태 업데이트 실패:", updateError);
          // 주문상태 업데이트 실패해도 다운로드는 계속 진행
        }
      }

      // ZIP 파일 생성
      const zipBuffer = await zip.generateAsync({type: "nodebuffer"});

      const zipFileName = `${dateStr}_사방넷등록.zip`;
      const encodedZipFileName = encodeURIComponent(zipFileName);
      const contentDisposition = `attachment; filename="sabangnet.zip"; filename*=UTF-8''${encodedZipFileName}`;

      const responseHeaders = new Headers();
      responseHeaders.set("Content-Type", "application/zip");
      responseHeaders.set("Content-Disposition", contentDisposition);

      return new Response(Buffer.from(zipBuffer), {
        headers: responseHeaders,
      });
    }

    // 일반 다운로드 로직 (필요시 구현)
    return NextResponse.json(
      {success: false, error: "사방넷 등록 양식 템플릿이 아닙니다."},
      {status: 400}
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json({message: "Error", error: error}, {status: 500});
  }
}
