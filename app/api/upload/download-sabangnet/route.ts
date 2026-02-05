import sql from "@/lib/db";
import {NextRequest, NextResponse} from "next/server";
import {getCompanyIdFromRequest} from "@/lib/company";
import * as Excel from "exceljs";
import {mapDataToTemplate, sortExcelData} from "@/utils/excelDataMapping";
import JSZip from "jszip";
import {
  buildFilterConditions,
  buildFilterQuery,
  UploadFilters,
} from "@/utils/uploadFilters";
import {generateDatePrefix} from "@/utils/filename";
import {
  getKoreaDateString,
  isValidPromotionPeriod,
  parseKoreaDate,
} from "@/utils/koreaTime";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {templateId, rowIds, filters, rows, preferSabangName} = body;

    if (!templateId) {
      return NextResponse.json(
        {success: false, error: "템플릿 ID가 필요합니다."},
        {status: 400},
      );
    }

    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400},
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
        {status: 404},
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
        {status: 400},
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
      const {conditions} = buildFilterConditions(filters as UploadFilters, {
        companyId,
      });
      const filteredData = await buildFilterQuery(conditions, true);
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
            .map((row: any) => row.매핑코드),
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

      // 업체명별 행사가 조회 (업체명과 mall.name 매칭)
      const vendorNames = [
        ...new Set(
          dataRows
            .map((row: any) => row.업체명)
            .filter((name: any) => name && String(name).trim() !== ""),
        ),
      ];

      // mall 테이블에서 업체명으로 mall_id 조회
      const mallMap: {[vendorName: string]: number} = {};
      if (vendorNames.length > 0) {
        const malls = await sql`
          SELECT id, name
          FROM mall
          WHERE name = ANY(${vendorNames})
        `;
        malls.forEach((mall: any) => {
          mallMap[mall.name] = mall.id;
        });
      }

      // 각 업체의 행사가 조회 (기간 체크 포함)
      const promotionMap: {
        [key: string]: {discountRate: number | null; eventPrice: number | null};
      } = {};
      const promotionIdsToDelete: number[] = [];
      const mallIds = Object.values(mallMap);
      const currentDate = getKoreaDateString();

      if (mallIds.length > 0) {
        const promotions = await sql`
          SELECT id, mall_id, product_code, discount_rate, event_price, 
                 TO_CHAR(start_date, 'YYYY-MM-DD') as start_date,
                 TO_CHAR(end_date, 'YYYY-MM-DD') as end_date
          FROM mall_promotions
          WHERE mall_id = ANY(${mallIds})
        `;

        promotions.forEach((promo: any) => {
          // 행사 기간 체크
          const isValid = isValidPromotionPeriod(
            promo.start_date,
            promo.end_date,
          );

          if (!isValid) {
            // 기간이 지났으면 삭제 대상에 추가
            if (parseKoreaDate(promo.end_date) < parseKoreaDate(currentDate)) {
              promotionIdsToDelete.push(promo.id);
            }
            // 기간이 아니면 적용하지 않음
            return;
          }

          // 유효한 행사 기간이면 적용
          const key = `${promo.mall_id}_${promo.product_code}`;
          promotionMap[key] = {
            discountRate: promo.discount_rate,
            eventPrice: promo.event_price,
          };
        });

        // 만료된 행사 삭제
        if (promotionIdsToDelete.length > 0) {
          await sql`
            DELETE FROM mall_promotions
            WHERE id = ANY(${promotionIdsToDelete})
          `;
        }
      }

      // 업체명이 없는 경우 기본값 설정 (테이블 데이터의 원래 업체명 사용)
      dataRows.forEach((row: any) => {
        if (!row.업체명 || row.업체명.trim() === "") {
          row.업체명 = "업체미지정";
        }

        const vendorName = row.업체명;
        const mallId = mallMap[vendorName];
        const productCode = row.매핑코드 || (row.productId ? null : null);

        // 행사가 확인
        let eventPrice: number | null = null;
        let discountRate: number | null = null;
        if (mallId && productCode) {
          const promoKey = `${mallId}_${productCode}`;
          const promotion = promotionMap[promoKey];
          if (promotion) {
            eventPrice = promotion.eventPrice;
            discountRate = promotion.discountRate;
          }
        }

        // 공급가 및 사방넷명 주입: productId가 있으면 ID로, 없으면 매핑코드로 찾기
        if (row.productId) {
          // 사용자가 선택한 상품 ID로만 찾기
          let salePrice: number | null = null;
          if (productSalePriceMap[row.productId] !== undefined) {
            salePrice = productSalePriceMap[row.productId];
          }

          // 행사가 적용: 행사가가 있으면 우선 사용, 없으면 할인율 적용
          if (eventPrice !== null) {
            salePrice = eventPrice;
          } else if (discountRate !== null && salePrice !== null) {
            salePrice = Math.round(salePrice * (1 - discountRate / 100));
          }

          if (salePrice !== null) {
            // 수량을 고려한 판매가 계산: (공급가 * 수량) - (4000 * (수량 - 1))
            const quantity =
              Number(row["수량"] || row["개수"] || row["quantity"] || 1) || 1;
            const calculatedPrice =
              salePrice * quantity - 4000 * (quantity - 1);
            row["판매가"] = calculatedPrice;
            row["sale_price"] = calculatedPrice;
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
          let salePrice: number | null = null;
          if (productSalePriceMapByCode[row.매핑코드] !== undefined) {
            salePrice = productSalePriceMapByCode[row.매핑코드];
          }

          // 행사가 적용: 행사가가 있으면 우선 사용, 없으면 할인율 적용
          if (eventPrice !== null) {
            salePrice = eventPrice;
          } else if (discountRate !== null && salePrice !== null) {
            salePrice = Math.round(salePrice * (1 - discountRate / 100));
          }

          if (salePrice !== null) {
            // 수량을 고려한 판매가 계산: (공급가 * 수량) - (4000 * (수량 - 1))
            const quantity =
              Number(row["수량"] || row["개수"] || row["quantity"] || 1) || 1;
            const calculatedPrice =
              salePrice * quantity - 4000 * (quantity - 1);
            row["판매가"] = calculatedPrice;
            row["sale_price"] = calculatedPrice;
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
      const dateStr = generateDatePrefix();

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
              preferSabangName:
                preferSabangName !== undefined ? preferSabangName : true,
            });

            let stringValue = value != null ? String(value) : "";

            // 주문번호는 내부코드로 매칭
            if (headerStr === "주문번호" || headerStr.includes("주문번호")) {
              stringValue = row["내부코드"] || stringValue;
            }

            // 배송희망일은 YYYYMMDD 형식으로 설정
            if (headerStr === "배송희망일" || headerStr.includes("배송희망")) {
              // row 데이터에 배송희망일이 있으면 사용, 없으면 오늘 날짜 사용
              const deliveryDate =
                row["배송희망일"] || row["배송희망일자"] || null;

              if (deliveryDate) {
                // 날짜 형식 변환 (다양한 형식 지원)
                const date = new Date(deliveryDate);
                if (!isNaN(date.getTime())) {
                  const year = date.getFullYear();
                  const month = String(date.getMonth() + 1).padStart(2, "0");
                  const day = String(date.getDate()).padStart(2, "0");
                  stringValue = `${year}${month}${day}`;
                } else {
                  // 이미 YYYYMMDD 형식인 경우 그대로 사용
                  const dateStr = String(deliveryDate).replace(/\D/g, "");
                  if (dateStr.length === 8) {
                    stringValue = dateStr;
                  } else {
                    // 파싱 실패 시 오늘 날짜 사용
                    const now = new Date();
                    const year = now.getFullYear();
                    const month = String(now.getMonth() + 1).padStart(2, "0");
                    const day = String(now.getDate()).padStart(2, "0");
                    stringValue = `${year}${month}${day}`;
                  }
                }
              } else {
                // 배송희망일이 없으면 오늘 날짜 사용
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, "0");
                const day = String(now.getDate()).padStart(2, "0");
                stringValue = `${year}${month}${day}`;
              }
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
          // 현재 상태가 "공급중" 또는 "발주서 다운"인 경우에만 업데이트 (뒷단계로 돌아가지 않도록)
          // "배송중" 상태는 유지됨 (조건에 포함되지 않으므로 업데이트되지 않음)
          const updateResult = await sql`
            UPDATE upload_rows
            SET row_data = jsonb_set(row_data, '{주문상태}', '"사방넷 다운"', true)
            WHERE id = ANY(${idsToUpdate})
              AND (row_data->>'주문상태' IS NULL 
                   OR row_data->>'주문상태' = '공급중' 
                   OR row_data->>'주문상태' = '발주서 다운')
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
      {status: 400},
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json({message: "Error", error: error}, {status: 500});
  }
}
