import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";
import * as Excel from "exceljs";
import JSZip from "jszip";
import {
  getTemplateHeaderNames,
  mapRowToTemplateFormat,
} from "@/utils/purchaseTemplateMapping";
import {mapDataToTemplate} from "@/utils/excelDataMapping";
import {getUserIdFromRequest} from "@/lib/company";

// 전화번호에 하이픈을 추가하여 형식 맞춤
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
    if (numOnly.length === 9) {
      return `${numOnly.slice(0, 2)}-${numOnly.slice(2, 5)}-${numOnly.slice(5)}`;
    } else if (numOnly.length === 10) {
      return `${numOnly.slice(0, 2)}-${numOnly.slice(2, 6)}-${numOnly.slice(6)}`;
    }
  } else if (numOnly.startsWith("0") && numOnly.length === 11) {
    return `${numOnly.slice(0, 3)}-${numOnly.slice(3, 7)}-${numOnly.slice(7)}`;
  } else if (numOnly.startsWith("0508") && numOnly.length === 12) {
    return `${numOnly.slice(0, 4)}-${numOnly.slice(4, 8)}-${numOnly.slice(8)}`;
  } else if (numOnly.startsWith("050") && numOnly.length === 12) {
    return `${numOnly.slice(0, 4)}-${numOnly.slice(4, 8)}-${numOnly.slice(8)}`;
  }
  return phoneNumber;
}

// grade가 "온라인"인 경우 전화번호1에 공백 추가
function formatPhoneNumber1ForOnline(phoneNumber: string): string {
  if (!phoneNumber || phoneNumber.trim() === "") return phoneNumber;
  if (phoneNumber.includes("-")) {
    const firstDashIndex = phoneNumber.indexOf("-");
    return phoneNumber.slice(0, firstDashIndex) + " " + phoneNumber.slice(firstDashIndex);
  }
  const numOnly = phoneNumber.replace(/\D/g, "");
  if (numOnly.length === 0) return phoneNumber;
  let prefixLength = 3;
  if (numOnly.startsWith("02")) {
    prefixLength = 2;
  } else if (numOnly.startsWith("0508") || numOnly.startsWith("050")) {
    prefixLength = 4;
  } else if (numOnly.startsWith("0") && numOnly.length >= 11) {
    prefixLength = 3;
  }
  const prefix = numOnly.slice(0, prefixLength);
  const suffix = numOnly.slice(prefixLength);
  return prefix + " " + suffix;
}

/**
 * 매입처별 전체 다운로드 API (ZIP 파일)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {startDate, endDate, purchaseIds} = body;

    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400}
      );
    }

    // user grade 확인
    const userId = await getUserIdFromRequest(request);
    let userGrade: string | null = null;
    if (userId && companyId) {
      try {
        const userResult = await sql`
          SELECT grade FROM users WHERE id = ${userId} AND company_id = ${companyId}
        `;
        if (userResult.length > 0) {
          userGrade = userResult[0].grade;
        }
      } catch (error) {
        console.error("사용자 정보 조회 실패:", error);
      }
    }

    // 오늘 날짜 기본값
    const today = new Date().toISOString().split("T")[0];
    const queryStartDate = startDate || today;
    const queryEndDate = endDate || today;

    // 매입처 목록 조회
    let purchases;
    if (purchaseIds && purchaseIds.length > 0) {
      purchases = await sql`
        SELECT id, name, template_headers
        FROM purchase
        WHERE id = ANY(${purchaseIds}) AND company_id = ${companyId}
        ORDER BY name
      `;
    } else {
      purchases = await sql`
        SELECT id, name, template_headers
        FROM purchase
        WHERE company_id = ${companyId}
        ORDER BY name
      `;
    }

    if (purchases.length === 0) {
      return NextResponse.json(
        {success: false, error: "매입처가 없습니다."},
        {status: 404}
      );
    }

    // 헤더 Alias 조회
    let headerAliases: Array<{column_key: string; aliases: string[]}> = [];
    try {
      const aliasResult = await sql`
        SELECT column_key, aliases FROM header_aliases ORDER BY id
      `;
      headerAliases = aliasResult.map((item: any) => ({
        column_key: item.column_key,
        aliases: Array.isArray(item.aliases) ? item.aliases : [],
      }));
    } catch (error) {
      console.error("헤더 Alias 조회 실패:", error);
    }

    // ZIP 파일 생성
    const zip = new JSZip();
    const allUpdatedOrderIds: number[] = [];

    // 각 매입처별로 엑셀 파일 생성
    for (const purchase of purchases) {
      // 미발주 주문 데이터 조회
      const ordersData = await sql`
        SELECT 
          ur.id,
          ur.row_data,
          pr.code as product_code,
          pr.name as product_name,
          pr.sale_price,
          pr.sabang_name
        FROM upload_rows ur
        INNER JOIN uploads u ON ur.upload_id = u.id AND u.company_id = ${companyId}
        INNER JOIN products pr ON (
          (ur.row_data->>'매핑코드' = pr.code OR ur.row_data->>'productId' = pr.id::text)
          AND pr.company_id = ${companyId}
        )
        WHERE pr.purchase = ${purchase.name}
          AND ur.row_data->>'주문상태' NOT IN ('취소')
          AND (ur.is_ordered = false OR ur.is_ordered IS NULL)
          AND u.created_at >= ${queryStartDate}::date
          AND u.created_at < (${queryEndDate}::date + INTERVAL '1 day')
        ORDER BY ur.id
      `;

      if (ordersData.length === 0) {
        continue;
      }

      // 주문 ID 수집
      allUpdatedOrderIds.push(...ordersData.map((o: any) => o.id));

      const templateHeaders = purchase.template_headers;

      // 엑셀 파일 생성
      const wb = new Excel.Workbook();
      const sheet = wb.addWorksheet(purchase.name);

      // 헤더 결정
      let finalHeaders: string[];
      if (templateHeaders && Array.isArray(templateHeaders) && templateHeaders.length > 0) {
        finalHeaders = getTemplateHeaderNames(templateHeaders);
      } else {
        finalHeaders = [
          "주문번호",
          "상품명",
          "수량",
          "수취인명",
          "전화번호1",
          "전화번호2",
          "우편번호",
          "주소",
          "배송메시지",
        ];
      }

      // 헤더 행 추가
      const headerRow = sheet.addRow(finalHeaders);
      headerRow.height = 30;

      // 헤더 스타일
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: {argb: "FFE0E0E0"},
        };
        cell.border = {
          top: {style: "thin"},
          left: {style: "thin"},
          bottom: {style: "thin"},
          right: {style: "thin"},
        };
        cell.font = {
          bold: true,
          size: 11,
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: "center",
        };
      });

      // 데이터 행 추가
      ordersData.forEach((order: any) => {
        const rowData = order.row_data || {};
        
        if (order.sabang_name) {
          rowData["사방넷명"] = order.sabang_name;
          rowData["sabangName"] = order.sabang_name;
        }

        let rowValues: string[];
        if (templateHeaders && Array.isArray(templateHeaders) && templateHeaders.length > 0) {
          rowValues = mapRowToTemplateFormat(rowData, templateHeaders, headerAliases);
        } else {
          // 기본 외주 발주서 양식 - mapDataToTemplate 사용
          rowValues = finalHeaders.map((header: string) => {
            let value = mapDataToTemplate(rowData, header, {
              formatPhone: true, // 외주 발주서에서는 전화번호에 하이픈 추가
            });

            let stringValue = value != null ? String(value) : "";

            // 수취인명인지 확인
            const headerStrNormalized = header.replace(/\s+/g, "").toLowerCase();
            const isReceiverName =
              header === "수취인명" ||
              header === "수취인" ||
              header === "받는사람" ||
              (header.includes("수취인") &&
                !headerStrNormalized.includes("전화") &&
                !headerStrNormalized.includes("주소") &&
                !headerStrNormalized.includes("우편") &&
                !headerStrNormalized.includes("연락"));

            // 배송메시지 필드인지 확인
            const isDeliveryMessageField =
              header.includes("배송") ||
              header.includes("메시지") ||
              header.includes("배메") ||
              header === "배송메시지" ||
              header === "배송 메시지";

            // 수취인명이 아닌 필드에서는 별 제거 (배송메시지 제외)
            if (!isReceiverName && !isDeliveryMessageField) {
              stringValue = stringValue.replace(/^★/, "").trim();
            }

            // 수취인명인 경우 앞에 ★ 붙이기
            if (isReceiverName) {
              stringValue = "★" + stringValue.replace(/^★/, "").trim();
            }

            // 주문번호인 경우 내부코드 사용 (온라인 유저는 sabang_code)
            if (header === "주문번호" || header.includes("주문번호")) {
              if (userGrade === "온라인") {
                stringValue = rowData["sabang_code"] || rowData["주문번호"] || stringValue;
              } else {
                stringValue = rowData["내부코드"] || stringValue;
              }
            }

            // 전화번호 포맷팅
            if (header === "전화번호1" || header.includes("전화번호1")) {
              let phone1Value = stringValue;
              if (phone1Value) {
                phone1Value = formatPhoneNumber(phone1Value);
                // grade가 "온라인"인 경우 공백 추가
                if (userGrade === "온라인") {
                  phone1Value = formatPhoneNumber1ForOnline(phone1Value);
                }
                stringValue = phone1Value;
              }
            }

            return stringValue;
          });
        }

        const dataRow = sheet.addRow(rowValues);
        dataRow.eachCell((cell) => {
          cell.border = {
            top: {style: "thin"},
            left: {style: "thin"},
            bottom: {style: "thin"},
            right: {style: "thin"},
          };
          cell.alignment = {
            vertical: "middle",
          };
        });
      });

      // 열 너비 자동 조절
      finalHeaders.forEach((_, index) => {
        const column = sheet.getColumn(index + 1);
        column.width = 15;
      });

      // 엑셀 버퍼 생성
      const buffer = await wb.xlsx.writeBuffer();
      const fileName = `${queryStartDate}_${purchase.name}_발주서.xlsx`;
      zip.file(fileName, buffer);
    }

    // 발주 상태 업데이트
    if (allUpdatedOrderIds.length > 0) {
      try {
        await sql`
          UPDATE upload_rows ur
          SET is_ordered = true
          FROM uploads u
          WHERE ur.upload_id = u.id 
            AND u.company_id = ${companyId}
            AND ur.id = ANY(${allUpdatedOrderIds})
        `;
      } catch (updateError) {
        console.error("발주 상태 업데이트 실패:", updateError);
      }
    }

    // ZIP 파일 생성
    const zipBuffer = await zip.generateAsync({type: "nodebuffer"});
    const zipFileName = `${queryStartDate}_매입처별_발주서.zip`;
    const encodedZipFileName = encodeURIComponent(zipFileName);

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", "application/zip");
    responseHeaders.set(
      "Content-Disposition",
      `attachment; filename="purchase_orders.zip"; filename*=UTF-8''${encodedZipFileName}`
    );

    return new Response(Buffer.from(zipBuffer), {
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("전체 다운로드 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
