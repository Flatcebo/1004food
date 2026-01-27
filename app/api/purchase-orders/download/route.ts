import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest, getUserIdFromRequest} from "@/lib/company";
import * as Excel from "exceljs";
import {
  getTemplateHeaderNames,
  mapRowToTemplateFormat,
} from "@/utils/purchaseTemplateMapping";
import {mapDataToTemplate} from "@/utils/excelDataMapping";

// 전화번호에 하이픈을 추가하여 형식 맞춤
function formatPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber || phoneNumber.length < 9) return phoneNumber;

  const numOnly = phoneNumber.replace(/\D/g, "");

  // 이미 하이픈이 제대로 되어 있는지 확인
  if (phoneNumber.includes("-")) {
    const parts = phoneNumber.split("-");
    if (parts.length === 3) {
      const formatted = formatPhoneNumber(parts.join(""));
      if (formatted !== parts.join("")) {
        return formatted;
      }
      return phoneNumber;
    }
  }

  // 02 지역번호 (02-XXXX-XXXX)
  if (numOnly.startsWith("02")) {
    if (numOnly.length === 9) {
      return `${numOnly.slice(0, 2)}-${numOnly.slice(2, 5)}-${numOnly.slice(5)}`;
    } else if (numOnly.length === 10) {
      return `${numOnly.slice(0, 2)}-${numOnly.slice(2, 6)}-${numOnly.slice(6)}`;
    }
  }
  // 휴대폰 및 기타 지역번호 (0XX-XXXX-XXXX)
  else if (numOnly.startsWith("0") && numOnly.length === 11) {
    return `${numOnly.slice(0, 3)}-${numOnly.slice(3, 7)}-${numOnly.slice(7)}`;
  }
  // 0508 대역 (0508-XXXX-XXXX)
  else if (numOnly.startsWith("0508") && numOnly.length === 12) {
    return `${numOnly.slice(0, 4)}-${numOnly.slice(4, 8)}-${numOnly.slice(8)}`;
  }
  // 050X 대역 (050X-XXXX-XXXX) - 0508 제외
  else if (numOnly.startsWith("050") && numOnly.length === 12) {
    return `${numOnly.slice(0, 4)}-${numOnly.slice(4, 8)}-${numOnly.slice(8)}`;
  }

  return phoneNumber;
}

// grade가 "온라인"인 경우 전화번호1에 공백 추가
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
 * 매입처별 주문 다운로드 API
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {purchaseId, orderIds, startDate, endDate} = body;

    if (!purchaseId) {
      return NextResponse.json(
        {success: false, error: "purchaseId가 필요합니다."},
        {status: 400}
      );
    }

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

    // 매입처 정보 조회
    const purchaseResult = await sql`
      SELECT id, name, template_headers
      FROM purchase
      WHERE id = ${purchaseId} AND company_id = ${companyId}
    `;

    if (purchaseResult.length === 0) {
      return NextResponse.json(
        {success: false, error: "매입처를 찾을 수 없습니다."},
        {status: 404}
      );
    }

    const purchase = purchaseResult[0];
    const templateHeaders = purchase.template_headers;

    // 주문 데이터 조회
    let ordersData;
    if (orderIds && orderIds.length > 0) {
      ordersData = await sql`
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
        WHERE ur.id = ANY(${orderIds})
          AND pr.purchase = ${purchase.name}
        ORDER BY ur.id
      `;
    } else {
      // 기간 기반 조회
      ordersData = await sql`
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
          AND u.created_at >= ${startDate}::date
          AND u.created_at < (${endDate}::date + INTERVAL '1 day')
        ORDER BY ur.id
      `;
    }

    if (ordersData.length === 0) {
      return NextResponse.json(
        {success: false, error: "다운로드할 데이터가 없습니다."},
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

    // 엑셀 파일 생성
    const wb = new Excel.Workbook();
    const sheet = wb.addWorksheet(purchase.name);

    // 헤더 결정
    let finalHeaders: string[];
    if (templateHeaders && Array.isArray(templateHeaders) && templateHeaders.length > 0) {
      finalHeaders = getTemplateHeaderNames(templateHeaders);
    } else {
      // 기본 외주 발주서 헤더
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
      
      // 사방넷명 추가
      if (order.sabang_name) {
        rowData["사방넷명"] = order.sabang_name;
        rowData["sabangName"] = order.sabang_name;
      }

      let rowValues: string[];
      if (templateHeaders && Array.isArray(templateHeaders) && templateHeaders.length > 0) {
        // 매입처 템플릿으로 매핑
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

    // 발주 상태 업데이트
    if (orderIds && orderIds.length > 0) {
      try {
        await sql`
          UPDATE upload_rows ur
          SET is_ordered = true
          FROM uploads u
          WHERE ur.upload_id = u.id 
            AND u.company_id = ${companyId}
            AND ur.id = ANY(${orderIds})
        `;
      } catch (updateError) {
        console.error("발주 상태 업데이트 실패:", updateError);
      }
    }

    const today = new Date().toISOString().split("T")[0];
    const fileName = `${today}_${purchase.name}_발주서.xlsx`;
    const encodedFileName = encodeURIComponent(fileName);

    const responseHeaders = new Headers();
    responseHeaders.set(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    responseHeaders.set(
      "Content-Disposition",
      `attachment; filename="${fileName}"; filename*=UTF-8''${encodedFileName}`
    );

    return new Response(Buffer.from(buffer), {
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("다운로드 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
