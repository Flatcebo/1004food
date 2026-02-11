import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest, getUserIdFromRequest} from "@/lib/company";
import * as Excel from "exceljs";
import {
  getTemplateHeaderNames,
  mapRowToTemplateFormat,
} from "@/utils/purchaseTemplateMapping";
import JSZip from "jszip";

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
    const {
      purchaseId,
      orderIds,
      startDate,
      endDate,
      forEmail,
      forKakao,
      rowDataOverrides,
      headerOverrides,
    } = body;
    const sendType = forEmail ? "email" : forKakao ? "kakaotalk" : "download";

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

    // 주문 데이터 조회 (LATERAL JOIN으로 1건당 1행 보장 - products 중복 매칭 방지)
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
        LEFT JOIN LATERAL (
          SELECT id, code, name, sale_price, sabang_name
          FROM products
          WHERE company_id = ${companyId}
            AND (
              (ur.row_data->>'productId' IS NOT NULL AND id = (ur.row_data->>'productId')::integer)
              OR (ur.row_data->>'매핑코드' IS NOT NULL AND code = ur.row_data->>'매핑코드')
            )
            AND purchase = ${purchase.name}
          LIMIT 1
        ) pr ON true
        WHERE ur.id = ANY(${orderIds})
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
        LEFT JOIN LATERAL (
          SELECT id, code, name, sale_price, sabang_name
          FROM products
          WHERE company_id = ${companyId}
            AND (
              (ur.row_data->>'productId' IS NOT NULL AND id = (ur.row_data->>'productId')::integer)
              OR (ur.row_data->>'매핑코드' IS NOT NULL AND code = ur.row_data->>'매핑코드')
            )
            AND purchase = ${purchase.name}
          LIMIT 1
        ) pr ON true
        WHERE ur.row_data->>'주문상태' NOT IN ('취소')
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

    // 스냅샷용 헤더/행 데이터 (DB 저장용)
    let snapshotHeaders: string[] = [];
    let snapshotRows: string[][] = [];

    // 엑셀 파일 생성
    const wb = new Excel.Workbook();
    const sheet = wb.addWorksheet(purchase.name);

    // 헤더 결정 및 엑셀 파일 생성
    let finalHeaders: string[];
    let buffer: Buffer;

    if (
      templateHeaders &&
      Array.isArray(templateHeaders) &&
      templateHeaders.length > 0
    ) {
      // 매입처 템플릿이 있는 경우 기존 로직 사용
      finalHeaders =
        headerOverrides &&
        Array.isArray(headerOverrides) &&
        headerOverrides.length > 0
          ? headerOverrides
          : getTemplateHeaderNames(templateHeaders);
      snapshotHeaders = [...finalHeaders];

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

      // 데이터 행 추가 (rowDataOverrides가 있으면 해당 수정 데이터 우선 사용)
      ordersData.forEach((order: any) => {
        let rowData = rowDataOverrides?.[order.id] ?? order.row_data ?? {};
        if (typeof rowData !== "object") rowData = {};

        // 사방넷명 추가
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

        snapshotRows.push(
          rowValues.map((v: any) => (v != null ? String(v) : "")),
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
      // 템플릿이 없는 경우: order 페이지 "외주 발주서" 셀렉트 시와 동일한 양식 사용 (download-outsource API 호출)
      const outsourceResult = await sql`
        SELECT id, template_data
        FROM upload_templates
        WHERE company_id = ${companyId}
          AND template_data->>'name' IS NOT NULL
          AND template_data->>'name' ILIKE '%외주%'
          AND template_data->>'name' NOT ILIKE '%CJ%'
        ORDER BY id ASC
        LIMIT 1
      `;

      if (outsourceResult.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error:
              "외주 발주서 템플릿이 없습니다. /upload/templates에서 order 페이지와 동일한 외주 발주서 템플릿을 먼저 생성해주세요.",
          },
          {status: 404},
        );
      }

      const templateId = outsourceResult[0].id;
      const orderIdsForOutsource = ordersData.map((o: any) => o.id);

      const base =
        process.env.NEXT_PUBLIC_BASE_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
      const origin = base || new URL(request.url).origin;
      const companyIdHeader = request.headers.get("company-id") || "";
      const userIdHeader = request.headers.get("user-id") || "";

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
            templateId,
            rowIds: orderIdsForOutsource,
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
            error: errData.error || "외주 발주서 생성 실패",
          },
          {status: outsourceRes.status},
        );
      }

      const zipBlob = await outsourceRes.blob();
      const zipBuffer = Buffer.from(await zipBlob.arrayBuffer());
      const zip = await JSZip.loadAsync(zipBuffer);

      // ZIP 내에서 해당 매입처 엑셀 파일 찾기 (파일명: 날짜_외주발주_매입처명.xlsx)
      let excelBuffer: Buffer | null = null;
      const xlsxFiles = Object.entries(zip.files).filter(
        ([path, file]) => !file.dir && path.endsWith(".xlsx"),
      );
      // 매입처명이 파일명에 포함된 파일 우선, 없으면 첫 번째 xlsx (단일 매입처인 경우)
      const match = xlsxFiles.find(([path]) =>
        path.includes(`_${purchase.name}.xlsx`),
      );
      const targetFile = match || xlsxFiles[0];
      if (targetFile) {
        excelBuffer = Buffer.from(await targetFile[1].async("nodebuffer"));
      }

      // 스냅샷용 헤더/행 추출 (외주 발주서)
      if (excelBuffer) {
        try {
          const parseWb = new Excel.Workbook();
          await parseWb.xlsx.load(excelBuffer as unknown as ArrayBuffer);
          const parseSheet = parseWb.worksheets[0];
          if (parseSheet) {
            const firstRow = parseSheet.getRow(1);
            const headerVals = firstRow?.values;
            if (headerVals && Array.isArray(headerVals)) {
              snapshotHeaders = headerVals
                .slice(1)
                .map((v: unknown) => (v != null ? String(v) : ""));
            }
            const rowCount = parseSheet.rowCount ?? 0;
            for (let r = 2; r <= rowCount; r++) {
              const row = parseSheet.getRow(r);
              const rowVals = row?.values;
              const vals =
                rowVals && Array.isArray(rowVals)
                  ? rowVals
                      .slice(1)
                      .map((v: unknown) => (v != null ? String(v) : ""))
                  : [];
              if (vals.some((v: string) => v !== "")) snapshotRows.push(vals);
            }
          }
        } catch (parseErr) {
          console.error("스냅샷 파싱 실패:", parseErr);
        }
      }

      if (!excelBuffer) {
        return NextResponse.json(
          {
            success: false,
            error: "외주 발주서 엑셀 파일을 찾을 수 없습니다.",
          },
          {status: 500},
        );
      }

      buffer = excelBuffer;
    }

    const updatedOrderIds =
      orderIds && orderIds.length > 0
        ? orderIds
        : ordersData.map((o: any) => o.id);

    let newBatchId: number | null = null;

    if (updatedOrderIds.length > 0) {
      try {
        const now = new Date();
        const koreaTimeMs = now.getTime() + 9 * 60 * 60 * 1000;
        const koreaDate = new Date(koreaTimeMs);
        const batchDate = koreaDate.toISOString().split("T")[0];

        const koreaYear = koreaDate.getUTCFullYear();
        const koreaMonth = String(koreaDate.getUTCMonth() + 1).padStart(2, "0");
        const koreaDay = String(koreaDate.getUTCDate()).padStart(2, "0");
        const koreaHours = String(koreaDate.getUTCHours()).padStart(2, "0");
        const koreaMinutes = String(koreaDate.getUTCMinutes()).padStart(2, "0");
        const koreaSeconds = String(koreaDate.getUTCSeconds()).padStart(2, "0");
        const koreaTimestamp = `${koreaYear}-${koreaMonth}-${koreaDay} ${koreaHours}:${koreaMinutes}:${koreaSeconds}`;

        const lastBatchResult = await sql`
          SELECT COALESCE(MAX(batch_number), 0) as last_batch
          FROM order_batches
          WHERE company_id = ${companyId}
            AND purchase_id = ${purchase.id}
            AND batch_date = ${batchDate}::date
        `;
        const lastBatchNumber = lastBatchResult[0]?.last_batch || 0;
        const newBatchNumber = lastBatchNumber + 1;

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
        newBatchId = newBatchResult[0]?.id;

        // 다운로드만 직접 업데이트, 이메일/카카오톡은 send API에서 batchId로 처리
        if (!forEmail && !forKakao) {
          await sql`
            UPDATE upload_rows ur
            SET is_ordered = true,
                order_batch_id = ${newBatchId}
            FROM uploads u
            WHERE ur.upload_id = u.id
              AND u.company_id = ${companyId}
              AND ur.id = ANY(${updatedOrderIds})
          `;
        }

        // order_sheet_snapshots 테이블에 발주서 원본 저장
        if (newBatchId && snapshotHeaders.length > 0) {
          const today = new Date().toISOString().split("T")[0];
          const fileName = `${today}_${purchase.name}_발주서.xlsx`;
          const snapshotUserId = userId ? parseInt(userId, 10) : null;
          await sql`
            INSERT INTO order_sheet_snapshots (
              company_id, purchase_id, order_batch_id, user_id,
              send_type, file_name, headers, row_data, file_data
            ) VALUES (
              ${String(companyId)},
              ${purchase.id},
              ${newBatchId},
              ${snapshotUserId},
              ${sendType},
              ${fileName},
              ${JSON.stringify(snapshotHeaders)}::jsonb,
              ${JSON.stringify(snapshotRows)}::jsonb,
              ${buffer}
            )
          `;
        }

        console.log(
          `[${sendType.toUpperCase()}] ${purchase.name}: ${newBatchNumber}차 발주 (${updatedOrderIds.length}건)`,
        );
      } catch (updateError) {
        console.error("발주 상태/스냅샷 저장 실패:", updateError);
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
    if ((forEmail || forKakao) && newBatchId) {
      responseHeaders.set("X-Order-Batch-Id", String(newBatchId));
    }

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
