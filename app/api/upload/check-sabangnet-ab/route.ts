import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest, getUserIdFromRequest} from "@/lib/company";

/**
 * POST /api/upload/check-sabangnet-ab
 * 사방넷 AB 다운로드 가능한 데이터 존재 여부 확인
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
    const {vendorName, allVendors, dateFilter = "all"} = body;

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

    if (dateFilter === "yesterday") {
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
      // 전체 (어제~오늘, 한국 시간 기준)
      dateFromUTC = koreaToUTC(koreaYear, koreaMonth, koreaDay - 1, 0, 0, 0, 0);
      dateToUTC = koreaToUTC(koreaYear, koreaMonth, koreaDay, 23, 59, 59, 999);
    }

    // 디버깅 로그
    console.log(`🔍 [AB 체크 API] dateFilter: ${dateFilter}`);
    console.log(
      `🔍 [AB 체크 API] 한국 오늘: ${koreaYear}-${String(
        koreaMonth + 1,
      ).padStart(2, "0")}-${String(koreaDay).padStart(2, "0")}`,
    );
    console.log(
      `🔍 [AB 체크 API] 조회 범위 (UTC): ${dateFromUTC.toISOString()} ~ ${dateToUTC.toISOString()}`,
    );

    // 조회할 업체 목록 결정
    let targetVendorNames: string[] = [];

    if (allVendors) {
      // 전체 업체 다운로드
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
          return NextResponse.json({
            success: true,
            hasData: false,
          });
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
          return NextResponse.json({
            success: true,
            hasData: false,
          });
        }
      }

      targetVendorNames = [vendorName];
    }

    if (targetVendorNames.length === 0) {
      return NextResponse.json({
        success: true,
        hasData: false,
      });
    }

    // 데이터 존재 여부 확인 (COUNT만 조회)
    let countResult;

    if (allVendors) {
      countResult = await sql`
        SELECT COUNT(*) as count
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
      countResult = await sql`
        SELECT COUNT(*) as count
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

    const hasData = parseInt(countResult[0]?.count || "0", 10) > 0;

    return NextResponse.json({
      success: true,
      hasData,
    });
  } catch (error: any) {
    console.error("사방넷 AB 데이터 확인 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500},
    );
  }
}
