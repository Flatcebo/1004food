import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";
import * as Excel from "exceljs";
import JSZip from "jszip";
import {
  getTemplateHeaderNames,
  mapRowToTemplateFormat,
} from "@/utils/purchaseTemplateMapping";
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

    // 외주 발주서 템플릿 조회 (template_headers 없는 매입처용 - order 페이지와 동일 양식)
    let outsourceTemplateId: number | null = null;
    try {
      const outsourceResult = await sql`
        SELECT id FROM upload_templates
        WHERE company_id = ${companyId}
          AND template_data->>'name' IS NOT NULL
          AND template_data->>'name' ILIKE '%외주%'
          AND template_data->>'name' NOT ILIKE '%CJ%'
        ORDER BY id ASC
        LIMIT 1
      `;
      if (outsourceResult.length > 0) {
        outsourceTemplateId = outsourceResult[0].id;
      }
    } catch (e) {
      console.error("외주 발주서 템플릿 조회 실패:", e);
    }

    const base =
      process.env.NEXT_PUBLIC_BASE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
    const origin = base || new URL(request.url).origin;
    const companyIdHeader = request.headers.get("company-id") || "";
    const userIdHeader = request.headers.get("user-id") || "";

    // ZIP 파일 생성
    const zip = new JSZip();
    // 매입처별 주문 ID 그룹화 (차수 정보 생성을 위해)
    const purchaseOrderMap = new Map<number, number[]>();

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

      // 매입처별 주문 ID 저장 (차수 정보 생성을 위해)
      const orderIds = ordersData.map((o: any) => o.id);
      purchaseOrderMap.set(purchase.id, orderIds);

      const templateHeaders = purchase.template_headers;

      // 헤더 결정 및 엑셀 파일 생성
      let buffer: Buffer;

      if (
        templateHeaders &&
        Array.isArray(templateHeaders) &&
        templateHeaders.length > 0
      ) {
        // 매입처 템플릿이 있는 경우 기존 로직 사용
        const finalHeaders = getTemplateHeaderNames(templateHeaders);

        // 엑셀 파일 생성
        const wb = new Excel.Workbook();
        const sheet = wb.addWorksheet(purchase.name);

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

          // 매입처 템플릿으로 매핑
          const rowValues = mapRowToTemplateFormat(
            rowData,
            templateHeaders,
            headerAliases,
          );

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
        buffer = (await wb.xlsx.writeBuffer()) as unknown as Buffer;
      } else {
        // order 페이지 "외주 발주서" 셀렉트 시와 동일한 양식 (download-outsource API 호출)
        if (!outsourceTemplateId) {
          return NextResponse.json(
            {
              success: false,
              error:
                "외주 발주서 템플릿이 없습니다. /upload/templates에서 order 페이지와 동일한 외주 발주서 템플릿을 먼저 생성해주세요.",
            },
            {status: 404},
          );
        }

        const outsourceRes = await fetch(
          `${origin}/api/upload/download-outsource`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "company-id": companyIdHeader,
              ...(userIdHeader && {"user-id": userIdHeader}),
            },
            body: JSON.stringify({
              templateId: outsourceTemplateId,
              rowIds: orderIds,
              preferSabangName: true,
              useInternalCode: true,
            }),
          },
        );

        if (!outsourceRes.ok) {
          const errData = await outsourceRes.json().catch(() => ({}));
          return NextResponse.json(
            {
              success: false,
              error:
                errData.error || `외주 발주서 생성 실패 (${purchase.name})`,
            },
            {status: outsourceRes.status},
          );
        }

        const zipBlob = await outsourceRes.blob();
        const zipBuffer = Buffer.from(await zipBlob.arrayBuffer());
        const outsourceZip = await JSZip.loadAsync(zipBuffer);

        const xlsxFiles = Object.entries(outsourceZip.files).filter(
          ([path, file]) => !file.dir && path.endsWith(".xlsx"),
        );
        const match = xlsxFiles.find(([path]) =>
          path.includes(`_${purchase.name}.xlsx`),
        );
        const targetFile = match || xlsxFiles[0];
        if (!targetFile) {
          return NextResponse.json(
            {
              success: false,
              error: `외주 발주서 엑셀 파일을 찾을 수 없습니다 (${purchase.name})`,
            },
            {status: 500},
          );
        }
        buffer = Buffer.from(await targetFile[1].async("nodebuffer"));
      }
      const fileName = `${queryStartDate}_${purchase.name}_발주서.xlsx`;
      zip.file(fileName, buffer);
    }

    // 발주 상태 업데이트 및 차수 정보 저장 (매입처별로)
    if (purchaseOrderMap.size > 0) {
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

        // 각 매입처별로 차수 정보 생성
        for (const [purchaseId, orderIds] of purchaseOrderMap.entries()) {
          if (orderIds.length === 0) continue;

          // 해당 매입처의 오늘 마지막 batch_number 조회
          const lastBatchResult = await sql`
            SELECT COALESCE(MAX(batch_number), 0) as last_batch
            FROM order_batches
            WHERE company_id = ${companyId}
              AND purchase_id = ${purchaseId}
              AND batch_date = ${batchDate}::date
          `;
          const lastBatchNumber = lastBatchResult[0]?.last_batch || 0;
          const newBatchNumber = lastBatchNumber + 1;

          // 새 batch 생성 (한국 시간으로 created_at 설정)
          const newBatchResult = await sql`
            INSERT INTO order_batches (company_id, purchase_id, batch_number, batch_date, created_at)
            VALUES (
              ${companyId}, 
              ${purchaseId}, 
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
              AND ur.id = ANY(${orderIds})
          `;

          console.log(
            `[DOWNLOAD-ALL] Purchase ID ${purchaseId}: ${newBatchNumber}차 발주 (${orderIds.length}건)`,
          );
        }
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
      `attachment; filename="purchase_orders.zip"; filename*=UTF-8''${encodedZipFileName}`,
    );

    return new Response(Buffer.from(zipBuffer), {
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("전체 다운로드 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500},
    );
  }
}
