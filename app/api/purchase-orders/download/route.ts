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
        {status: 404},
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
        {status: 404},
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
    if (
      templateHeaders &&
      Array.isArray(templateHeaders) &&
      templateHeaders.length > 0
    ) {
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
      if (
        templateHeaders &&
        Array.isArray(templateHeaders) &&
        templateHeaders.length > 0
      ) {
        // 매입처 템플릿으로 매핑
        rowValues = mapRowToTemplateFormat(
          rowData,
          templateHeaders,
          headerAliases,
        );
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
              stringValue =
                rowData["sabang_code"] || rowData["주문번호"] || stringValue;
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

    // 발주 상태 업데이트 및 차수 정보 저장
    const updatedOrderIds =
      orderIds && orderIds.length > 0
        ? orderIds
        : ordersData.map((o: any) => o.id);

    if (updatedOrderIds.length > 0) {
      try {
        // 한국 시간 계산
        const now = new Date();
        const koreaTimeMs = now.getTime() + 9 * 60 * 60 * 1000; // UTC + 9시간
        const koreaDate = new Date(koreaTimeMs);
        const batchDate = koreaDate.toISOString().split("T")[0];

        // 한국 시간을 PostgreSQL timestamp 형식으로 변환 (YYYY-MM-DD HH:mm:ss)
        const koreaYear = koreaDate.getUTCFullYear();
        const koreaMonth = String(koreaDate.getUTCMonth() + 1).padStart(2, "0");
        const koreaDay = String(koreaDate.getUTCDate()).padStart(2, "0");
        const koreaHours = String(koreaDate.getUTCHours()).padStart(2, "0");
        const koreaMinutes = String(koreaDate.getUTCMinutes()).padStart(2, "0");
        const koreaSeconds = String(koreaDate.getUTCSeconds()).padStart(2, "0");
        const koreaTimestamp = `${koreaYear}-${koreaMonth}-${koreaDay} ${koreaHours}:${koreaMinutes}:${koreaSeconds}`;

        // 해당 매입처의 오늘 마지막 batch_number 조회
        const lastBatchResult = await sql`
          SELECT COALESCE(MAX(batch_number), 0) as last_batch
          FROM order_batches
          WHERE company_id = ${companyId}
            AND purchase_id = ${purchase.id}
            AND batch_date = ${batchDate}::date
        `;
        const lastBatchNumber = lastBatchResult[0]?.last_batch || 0;
        const newBatchNumber = lastBatchNumber + 1;

        // 새 batch 생성 (한국 시간으로 created_at 설정)
        const newBatchResult = await sql`
          INSERT INTO order_batches (company_id, purchase_id, batch_number, batch_date, created_at)
          VALUES (
            ${companyId}, 
            ${purchase.id}, 
            ${newBatchNumber}, 
            ${batchDate}::date,
            ${koreaTimestamp}::timestamp
          )
          RETURNING id
        `;
        const newBatchId = newBatchResult[0]?.id;

        // upload_rows 업데이트 (is_ordered = true, order_batch_id 설정)
        await sql`
          UPDATE upload_rows ur
          SET is_ordered = true,
              order_batch_id = ${newBatchId}
          FROM uploads u
          WHERE ur.upload_id = u.id 
            AND u.company_id = ${companyId}
            AND ur.id = ANY(${updatedOrderIds})
        `;

        console.log(
          `[DOWNLOAD] ${purchase.name}: ${newBatchNumber}차 발주 (${updatedOrderIds.length}건)`,
        );
      } catch (updateError) {
        console.error("발주 상태 업데이트 실패:", updateError);
      }
    }

    const today = new Date().toISOString().split("T")[0];
    const fileName = `${today}_${purchase.name}_발주서.xlsx`;

    // Windows에서 한글 파일명 깨짐 방지를 위한 RFC 5987 형식 인코딩
    // HTTP 헤더는 ASCII만 허용하므로 filename에는 ASCII fallback 추가
    const asciiFallbackBase =
      fileName
        .replace(/\.xlsx$/, "")
        .replace(/[^\x00-\x7F]/g, "")
        .replace(/\s+/g, "_") || "download";
    const safeFileName = `${asciiFallbackBase}.xlsx`; // ASCII fallback
    const encodedFileName = encodeURIComponent(fileName); // UTF-8 인코딩
    // filename* 우선, filename ASCII fallback 병행
    const contentDisposition = `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`;

    const responseHeaders = new Headers();
    responseHeaders.set(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    responseHeaders.set("Content-Disposition", contentDisposition);

    return new Response(Buffer.from(buffer), {
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("다운로드 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500},
    );
  }
}
