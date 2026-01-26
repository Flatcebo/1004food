import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest, getUserIdFromRequest} from "@/lib/company";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import {generateDatePrefix} from "@/utils/filename";

/**
 * POST /api/upload/download-sabangnet-ab
 * 사방넷 AB 형식 다운로드 (택배사별 파일 분리)
 * A열=주문번호(sabang_code), B열=송장번호(운송장번호)
 * sabang_code와 운송장번호가 모두 있는 경우만 포함
 */
export async function POST(request: NextRequest) {
  try {
    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400},
      );
    }

    const body = await request.json();
    const {
      vendorName,
      allVendors,
      activeVendorNames,
      dateFilter = "all",
    } = body;

    // 디버깅: 받은 dateFilter 값 확인
    console.log(
      `🔍 [AB 다운로드 API] 받은 body:`,
      JSON.stringify({vendorName, allVendors, dateFilter}),
    );
    console.log(
      `🔍 [AB 다운로드 API] dateFilter 값: ${dateFilter}, 타입: ${typeof dateFilter}`,
    );

    // user_id 추출 및 권한 확인
    const userId = await getUserIdFromRequest(request);
    let isAdmin = false;
    let assignedVendorIds: number[] = [];

    if (userId) {
      try {
        const userResult = await sql`
          SELECT grade, assigned_vendor_ids
          FROM users
          WHERE id = ${userId} AND company_id = ${companyId}
        `;

        if (userResult.length > 0) {
          isAdmin = userResult[0].grade === "관리자";

          if (userResult[0].assigned_vendor_ids) {
            try {
              assignedVendorIds = Array.isArray(
                userResult[0].assigned_vendor_ids,
              )
                ? userResult[0].assigned_vendor_ids
                : JSON.parse(userResult[0].assigned_vendor_ids || "[]");
            } catch (e) {
              assignedVendorIds = [];
            }
          }
        }
      } catch (error) {
        console.error("사용자 정보 조회 실패:", error);
      }
    }

    // 날짜 계산 (한국 서울 시간 기준)
    // 한국 시간대로 현재 날짜 가져오기
    const now = new Date();
    const koreaFormatter = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const koreaParts = koreaFormatter.formatToParts(now);
    const koreaYear = parseInt(
      koreaParts.find((p) => p.type === "year")?.value || "2024",
    );
    const koreaMonth =
      parseInt(koreaParts.find((p) => p.type === "month")?.value || "1") - 1; // 0-based
    const koreaDay = parseInt(
      koreaParts.find((p) => p.type === "day")?.value || "1",
    );

    let dateFromUTC: Date;
    let dateToUTC: Date;

    // 한국 시간을 UTC로 변환하는 함수 (서버 타임존과 무관하게 정확하게 계산)
    // 한국 시간 2026-01-21 00:00:00 = UTC 2026-01-20 15:00:00
    // 한국 시간 2026-01-21 23:59:59.999 = UTC 2026-01-21 14:59:59.999
    const koreaToUTC = (
      year: number,
      month: number,
      day: number,
      hour: number,
      minute: number,
      second: number,
      ms: number,
    ) => {
      // 한국 시간을 UTC로 변환
      // 한국은 UTC+9이므로 한국 시간에서 9시간을 빼면 UTC 시간이 됨
      // hour가 9보다 작으면 전날로 넘어감
      let utcHour = hour - 9;
      let utcDay = day;
      let utcMonth = month;
      let utcYear = year;

      if (utcHour < 0) {
        utcHour += 24;
        utcDay -= 1;
        if (utcDay < 1) {
          utcMonth -= 1;
          if (utcMonth < 0) {
            utcMonth = 11;
            utcYear -= 1;
          }
          // 해당 월의 마지막 날 계산
          utcDay = new Date(utcYear, utcMonth + 1, 0).getDate();
        }
      }

      return new Date(
        Date.UTC(utcYear, utcMonth, utcDay, utcHour, minute, second, ms),
      );
    };

    if (dateFilter === "3days_ago") {
      // 3일전만 (한국 시간 기준)
      // 한국 3일전 00:00:00.000 ~ 23:59:59.999
      dateFromUTC = koreaToUTC(koreaYear, koreaMonth, koreaDay - 3, 0, 0, 0, 0);
      dateToUTC = koreaToUTC(
        koreaYear,
        koreaMonth,
        koreaDay - 3,
        23,
        59,
        59,
        999,
      );
    } else if (dateFilter === "yesterday") {
      // 어제만 (한국 시간 기준)
      // 한국 어제 00:00:00.000 ~ 23:59:59.999
      dateFromUTC = koreaToUTC(koreaYear, koreaMonth, koreaDay - 1, 0, 0, 0, 0);
      dateToUTC = koreaToUTC(
        koreaYear,
        koreaMonth,
        koreaDay - 1,
        23,
        59,
        59,
        999,
      );
    } else if (dateFilter === "today") {
      // 오늘만 (한국 시간 기준)
      // 한국 오늘 00:00:00.000 ~ 23:59:59.999
      dateFromUTC = koreaToUTC(koreaYear, koreaMonth, koreaDay, 0, 0, 0, 0);
      dateToUTC = koreaToUTC(koreaYear, koreaMonth, koreaDay, 23, 59, 59, 999);
    } else {
      // 전체 (3일전~오늘, 한국 시간 기준)
      dateFromUTC = koreaToUTC(koreaYear, koreaMonth, koreaDay - 3, 0, 0, 0, 0);
      dateToUTC = koreaToUTC(koreaYear, koreaMonth, koreaDay, 23, 59, 59, 999);
    }

    // 디버깅 로그
    console.log(`🔍 [AB 다운로드 API] dateFilter: ${dateFilter}`);
    console.log(
      `🔍 [AB 다운로드 API] 한국 오늘: ${koreaYear}-${String(koreaMonth + 1).padStart(2, "0")}-${String(koreaDay).padStart(2, "0")}`,
    );
    console.log(
      `🔍 [AB 다운로드 API] 조회 범위 (UTC): ${dateFromUTC.toISOString()} ~ ${dateToUTC.toISOString()}`,
    );

    // 조회할 업체 목록 결정
    let targetVendorNames: string[] = [];

    if (allVendors) {
      // 전체 업체 다운로드 (활성화된 업체만)
      if (activeVendorNames && activeVendorNames.length > 0) {
        // 프론트엔드에서 전달된 활성화된 업체 목록 사용
        targetVendorNames = activeVendorNames;
      } else {
        // 활성화된 업체 목록이 없으면 기존 로직 사용 (하위 호환성)
        if (isAdmin) {
          const vendorsResult = await sql`
            SELECT DISTINCT ur.row_data->>'업체명' as vendor_name
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE u.company_id = ${companyId}
              AND u.created_at >= ${dateFromUTC.toISOString()}
              AND u.created_at <= ${dateToUTC.toISOString()}
              AND ur.row_data->>'업체명' IS NOT NULL
              AND ur.row_data->>'업체명' != ''
            ORDER BY vendor_name
          `;
          targetVendorNames = vendorsResult.map((v: any) => v.vendor_name);
        } else {
          // 일반 유저: assigned_vendor_ids에 있는 업체만
          if (assignedVendorIds.length === 0) {
            return NextResponse.json(
              {success: false, error: "담당 업체가 없습니다."},
              {status: 403},
            );
          }

          const vendorNamesResult = await sql`
            SELECT name
            FROM mall
            WHERE id = ANY(${assignedVendorIds})
          `;

          const allowedVendorNames = vendorNamesResult.map((v: any) => v.name);

          const vendorsResult = await sql`
            SELECT DISTINCT ur.row_data->>'업체명' as vendor_name
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE u.company_id = ${companyId}
              AND u.created_at >= ${dateFromUTC.toISOString()}
              AND u.created_at <= ${dateToUTC.toISOString()}
              AND ur.row_data->>'업체명' = ANY(${allowedVendorNames})
              AND ur.row_data->>'업체명' IS NOT NULL
              AND ur.row_data->>'업체명' != ''
            ORDER BY vendor_name
          `;
          targetVendorNames = vendorsResult.map((v: any) => v.vendor_name);
        }
      }
    } else {
      // 특정 업체만 다운로드
      if (!vendorName) {
        return NextResponse.json(
          {success: false, error: "업체명이 필요합니다."},
          {status: 400},
        );
      }

      // 일반 유저인 경우 권한 확인
      if (!isAdmin && assignedVendorIds.length > 0) {
        const vendorResult = await sql`
          SELECT name
          FROM mall
          WHERE id = ANY(${assignedVendorIds})
        `;

        const allowedVendorNames = vendorResult.map((v: any) => v.name);

        if (!allowedVendorNames.includes(vendorName)) {
          return NextResponse.json(
            {success: false, error: "해당 업체에 대한 권한이 없습니다."},
            {status: 403},
          );
        }
      }

      targetVendorNames = [vendorName];
    }

    if (targetVendorNames.length === 0) {
      return NextResponse.json(
        {success: false, error: "다운로드할 업체가 없습니다."},
        {status: 404},
      );
    }

    // 모든 데이터를 한 번에 조회 (성능 개선)
    let allRowsResult;

    if (allVendors) {
      // 전체 업체 다운로드: 선택한 날짜 범위의 데이터
      allRowsResult = await sql`
        SELECT 
          ur.row_data, 
          ur.row_data->>'택배사' as carrier,
          ur.row_data->>'업체명' as vendor_name
        FROM upload_rows ur
        INNER JOIN uploads u ON ur.upload_id = u.id
        WHERE u.company_id = ${companyId}
          AND u.created_at >= ${dateFromUTC.toISOString()}
          AND u.created_at <= ${dateToUTC.toISOString()}
          AND ur.row_data->>'업체명' = ANY(${targetVendorNames})
          AND ur.row_data->>'sabang_code' IS NOT NULL
          AND ur.row_data->>'sabang_code' != ''
          AND ur.row_data->>'운송장번호' IS NOT NULL
          AND ur.row_data->>'운송장번호' != ''
      `;
    } else {
      // 특정 업체만: 선택한 날짜 범위의 데이터
      allRowsResult = await sql`
        SELECT 
          ur.row_data, 
          ur.row_data->>'택배사' as carrier,
          ur.row_data->>'업체명' as vendor_name
        FROM upload_rows ur
        INNER JOIN uploads u ON ur.upload_id = u.id
        WHERE u.company_id = ${companyId}
          AND u.created_at >= ${dateFromUTC.toISOString()}
          AND u.created_at <= ${dateToUTC.toISOString()}
          AND ur.row_data->>'업체명' = ANY(${targetVendorNames})
          AND ur.row_data->>'sabang_code' IS NOT NULL
          AND ur.row_data->>'sabang_code' != ''
          AND ur.row_data->>'운송장번호' IS NOT NULL
          AND ur.row_data->>'운송장번호' != ''
      `;
    }

    if (allRowsResult.length === 0) {
      return NextResponse.json(
        {success: false, error: "다운로드할 데이터가 없습니다."},
        {status: 404},
      );
    }

    // ZIP 파일 생성
    const zip = new JSZip();
    const dateStr = generateDatePrefix();

    // 엑셀 파일 생성 함수 (병렬 처리용)
    const createExcelFile = async (
      carrier: string,
      rows: any[],
      dateStr: string,
      includeVendorName: boolean = false,
      vendorName?: string,
    ): Promise<{fileName: string; buffer: any}> => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("사방넷 AB");

      // 헤더: A열=주문번호, B열=송장번호
      const headers = ["주문번호", "송장번호"];
      worksheet.addRow(headers);

      // 헤더 스타일 적용
      const headerRow = worksheet.getRow(1);
      headerRow.font = {bold: true, size: 12};
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: {argb: "FFE0E0E0"},
      };
      headerRow.alignment = {vertical: "middle", horizontal: "center"};

      // 데이터 행 추가
      rows.forEach((row) => {
        worksheet.addRow([row.sabangCode, row.trackingNumber]);
      });

      // 열 너비 설정
      worksheet.columns = [
        {width: 20}, // 주문번호
        {width: 20}, // 송장번호
      ];

      // 엑셀 파일을 버퍼로 변환
      const buffer = await workbook.xlsx.writeBuffer();

      // 파일명 생성
      const safeCarrier = carrier.replace(/[^\w가-힣]/g, "_");
      const fileName =
        includeVendorName && vendorName
          ? `${dateStr}_${vendorName}_${safeCarrier}_사방넷AB.xlsx`
          : `${dateStr}_${safeCarrier}_사방넷AB.xlsx`;

      return {fileName, buffer};
    };

    // 전체 AB 다운로드인 경우: 업체 구분 없이 택배사별로만 그룹화
    if (allVendors) {
      const carrierGroups = new Map<string, any[]>();

      allRowsResult.forEach((row: any) => {
        const rowData = row.row_data || {};
        const carrier = String(row.carrier || "").trim() || "기타";

        if (!carrierGroups.has(carrier)) {
          carrierGroups.set(carrier, []);
        }

        carrierGroups.get(carrier)!.push({
          sabangCode: String(rowData["sabang_code"] || "").trim(),
          trackingNumber: String(rowData["운송장번호"] || "").trim(),
        });
      });

      // 모든 엑셀 파일을 병렬로 생성 (택배사별로만)
      const excelPromises: Promise<{fileName: string; buffer: any}>[] = [];

      for (const [carrier, rows] of carrierGroups.entries()) {
        excelPromises.push(createExcelFile(carrier, rows, dateStr, false));
      }

      // 병렬 처리로 모든 엑셀 파일 생성
      const excelFiles = await Promise.all(excelPromises);

      // ZIP에 모든 파일 추가
      excelFiles.forEach(({fileName, buffer}) => {
        zip.file(fileName, buffer);
      });
    } else {
      // 개별 업체 다운로드: 업체별, 택배사별로 그룹화
      const vendorCarrierGroups = new Map<string, Map<string, any[]>>();

      allRowsResult.forEach((row: any) => {
        const rowData = row.row_data || {};
        const vendorName = String(row.vendor_name || "").trim();
        const carrier = String(row.carrier || "").trim() || "기타";

        if (!vendorCarrierGroups.has(vendorName)) {
          vendorCarrierGroups.set(vendorName, new Map());
        }

        const carrierGroups = vendorCarrierGroups.get(vendorName)!;
        if (!carrierGroups.has(carrier)) {
          carrierGroups.set(carrier, []);
        }

        carrierGroups.get(carrier)!.push({
          sabangCode: String(rowData["sabang_code"] || "").trim(),
          trackingNumber: String(rowData["운송장번호"] || "").trim(),
        });
      });

      // 모든 엑셀 파일을 병렬로 생성
      const excelPromises: Promise<{fileName: string; buffer: any}>[] = [];

      for (const [vendorName, carrierGroups] of vendorCarrierGroups.entries()) {
        for (const [carrier, rows] of carrierGroups.entries()) {
          excelPromises.push(
            createExcelFile(carrier, rows, dateStr, true, vendorName),
          );
        }
      }

      // 병렬 처리로 모든 엑셀 파일 생성
      const excelFiles = await Promise.all(excelPromises);

      // ZIP에 모든 파일 추가
      excelFiles.forEach(({fileName, buffer}) => {
        zip.file(fileName, buffer);
      });
    }

    // ZIP 파일 생성
    const zipBuffer = await zip.generateAsync({type: "nodebuffer"});

    // 파일명 생성
    const zipFileName = allVendors
      ? `${dateStr}_전체_사방넷AB.zip`
      : `${dateStr}_${targetVendorNames[0]}_사방넷AB.zip`;

    // Windows에서 한글 파일명 깨짐 방지를 위한 RFC 5987 형식 인코딩
    const asciiFallbackBase = zipFileName
      .replace(/[^\x00-\x7F]/g, "")
      .replace(/\s+/g, "_");
    const safeFileName = `${asciiFallbackBase}.zip`;
    const encodedFileName = encodeURIComponent(zipFileName);
    const contentDisposition = `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`;

    // 히스토리 저장 (비동기로 처리하여 다운로드 응답을 지연시키지 않음)
    // userId는 이미 위에서 선언됨
    if (userId) {
      const dateFilterLabel =
        dateFilter === "3days_ago"
          ? "3일전"
          : dateFilter === "yesterday"
            ? "어제"
            : dateFilter === "today"
              ? "오늘"
              : "전체";
      const historyFileName = allVendors
        ? `${dateFilterLabel} 기간`
        : `${targetVendorNames[0]}_${dateFilterLabel} 기간`;
      const formType = allVendors ? "전체 사방넷 AB" : "사방넷 AB";

      sql`
        INSERT INTO download_history (
          user_id,
          company_id,
          vendor_name,
          file_name,
          form_type,
          date_filter
        ) VALUES (
          ${userId},
          ${companyId},
          ${allVendors ? null : targetVendorNames[0]},
          ${historyFileName},
          ${formType},
          ${dateFilter}
        )
      `.catch((error) => {
        console.error("히스토리 저장 실패:", error);
        // 히스토리 저장 실패해도 다운로드는 계속 진행
      });
    }

    // 응답 헤더 설정
    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", "application/zip");
    responseHeaders.set("Content-Disposition", contentDisposition);

    return new Response(Buffer.from(zipBuffer), {
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("사방넷 AB 다운로드 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500},
    );
  }
}
