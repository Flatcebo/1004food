import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest, getUserIdFromRequest} from "@/lib/company";

/**
 * GET /api/upload/delivery-vendors
 * 지정 기간 업로드한 업체 리스트와 통계 조회
 * - 일반 유저: assigned_vendor_ids에 있는 업체만
 * - 관리자: 지정 기간 저장된 주문의 모든 업체
 * 쿼리 파라미터: startDate, endDate (YYYY-MM-DD 형식)
 */
export async function GET(request: NextRequest) {
  try {
    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400},
      );
    }

    // user_id 추출
    const userId = await getUserIdFromRequest(request);

    // 쿼리 파라미터에서 날짜 범위 추출
    const {searchParams} = new URL(request.url);
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    // 사용자 정보 조회 (grade, assigned_vendor_ids)
    let userGrade: string | null = null;
    let assignedVendorIds: number[] = [];
    let isAdmin = false;

    if (userId) {
      try {
        const userResult = await sql`
          SELECT grade, assigned_vendor_ids
          FROM users
          WHERE id = ${userId} AND company_id = ${companyId}
        `;

        if (userResult.length > 0) {
          userGrade = userResult[0].grade;
          isAdmin = userGrade === "관리자";

          // assigned_vendor_ids 파싱
          if (userResult[0].assigned_vendor_ids) {
            try {
              assignedVendorIds = Array.isArray(
                userResult[0].assigned_vendor_ids,
              )
                ? userResult[0].assigned_vendor_ids
                : JSON.parse(userResult[0].assigned_vendor_ids || "[]");
            } catch (e) {
              console.error("assigned_vendor_ids 파싱 실패:", e);
              assignedVendorIds = [];
            }
          }
        }
      } catch (error) {
        console.error("사용자 정보 조회 실패:", error);
      }
    }

    // 날짜 범위 계산 (한국 시간 기준)
    let dateFromUTC: Date;
    let dateToUTC: Date;

    if (startDateParam && endDateParam) {
      // 쿼리 파라미터에서 날짜 범위 지정
      // 한국 시간으로 시작일 00:00:00, 종료일 23:59:59를 UTC로 변환
      // 예: 한국 시간 2026-02-05 00:00:00 = UTC 2026-02-04 15:00:00
      // 예: 한국 시간 2026-02-05 23:59:59 = UTC 2026-02-05 14:59:59

      // ISO 8601 형식으로 한국 시간대(+09:00) 지정하여 파싱
      const startKoreaStr = `${startDateParam}T00:00:00+09:00`;
      const endKoreaStr = `${endDateParam}T23:59:59.999+09:00`;

      // Date 객체는 자동으로 UTC로 변환됨
      const startKoreaDate = new Date(startKoreaStr);
      const endKoreaDate = new Date(endKoreaStr);

      // 이미 UTC로 변환된 Date 객체 사용
      dateFromUTC = startKoreaDate;
      dateToUTC = endKoreaDate;
    } else {
      // 기본값: 오늘만 조회 (한국 시간 기준)
      const now = new Date();
      const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
      const koreaTime = new Date(utcTime + 9 * 3600000);

      const todayYear = koreaTime.getFullYear();
      const todayMonth = String(koreaTime.getMonth() + 1).padStart(2, "0");
      const todayDay = String(koreaTime.getDate()).padStart(2, "0");
      const todayStr = `${todayYear}-${todayMonth}-${todayDay}`;

      // 한국 시간으로 오늘 00:00:00과 23:59:59를 UTC로 변환
      const todayStartKoreaStr = `${todayStr}T00:00:00+09:00`;
      const todayEndKoreaStr = `${todayStr}T23:59:59.999+09:00`;

      dateFromUTC = new Date(todayStartKoreaStr);
      dateToUTC = new Date(todayEndKoreaStr);
    }

    // 디버깅 로그
    console.log(
      `🔍 [운송장 업체 조회] startDate: ${startDateParam}, endDate: ${endDateParam}`,
    );
    console.log(
      `🔍 [운송장 업체 조회] 조회 범위 (UTC): ${dateFromUTC.toISOString()} ~ ${dateToUTC.toISOString()}`,
    );
    console.log(
      `🔍 [운송장 업체 조회] 조회 범위 (한국시간): ${new Date(dateFromUTC.getTime() + 9 * 3600000).toISOString()} ~ ${new Date(dateToUTC.getTime() + 9 * 3600000).toISOString()}`,
    );

    // 금일 업로드된 주문에서 업체명 추출
    let vendorsQuery;

    if (isAdmin) {
      // 관리자: 모든 업체
      vendorsQuery = sql`
        SELECT DISTINCT
          ur.row_data->>'업체명' as vendor_name
        FROM upload_rows ur
        INNER JOIN uploads u ON ur.upload_id = u.id
        WHERE u.company_id = ${companyId}
          AND u.created_at >= ${dateFromUTC.toISOString()}
          AND u.created_at <= ${dateToUTC.toISOString()}
          AND ur.row_data->>'업체명' IS NOT NULL
          AND ur.row_data->>'업체명' != ''
        ORDER BY vendor_name
      `;
    } else {
      // 일반 유저: assigned_vendor_ids에 있는 업체만
      if (assignedVendorIds.length === 0) {
        // 담당 업체가 없으면 빈 배열 반환
        return NextResponse.json({
          success: true,
          data: [],
        });
      }

      // mall 테이블에서 쇼핑몰명 조회 (assigned_vendor_ids에 mall ID가 저장됨)
      const vendorNamesResult = await sql`
        SELECT name
        FROM mall
        WHERE id = ANY(${assignedVendorIds})
      `;

      const vendorNames = vendorNamesResult.map((v: any) => v.name);

      if (vendorNames.length === 0) {
        return NextResponse.json({
          success: true,
          data: [],
        });
      }

      vendorsQuery = sql`
        SELECT DISTINCT
          ur.row_data->>'업체명' as vendor_name
        FROM upload_rows ur
        INNER JOIN uploads u ON ur.upload_id = u.id
        WHERE u.company_id = ${companyId}
          AND u.created_at >= ${dateFromUTC.toISOString()}
          AND u.created_at <= ${dateToUTC.toISOString()}
          AND ur.row_data->>'업체명' = ANY(${vendorNames})
          AND ur.row_data->>'업체명' IS NOT NULL
          AND ur.row_data->>'업체명' != ''
        ORDER BY vendor_name
      `;
    }

    const vendorsResult = await vendorsQuery;
    const vendorNames = vendorsResult.map((v: any) => v.vendor_name);

    if (vendorNames.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    // 각 업체별로 파일(upload_id)별 통계 및 sabang_code 통계 조회
    const vendorStats = await Promise.all(
      vendorNames.map(async (vendorName: string) => {
        // 해당 업체의 파일(upload_id)별 통계 조회
        const fileStatsResult = await sql`
          SELECT 
            u.id as upload_id,
            u.file_name,
            u.created_at,
            COUNT(*) FILTER (WHERE ur.row_data->>'주문상태' = '배송중') as delivery_orders,
            COUNT(*) as total_orders
          FROM upload_rows ur
          INNER JOIN uploads u ON ur.upload_id = u.id
          WHERE u.company_id = ${companyId}
            AND u.created_at >= ${dateFromUTC.toISOString()}
            AND u.created_at <= ${dateToUTC.toISOString()}
            AND ur.row_data->>'업체명' = ${vendorName}
          GROUP BY u.id, u.file_name, u.created_at
          ORDER BY u.created_at DESC
        `;

        // 해당 업체의 sabang_code 통계 조회 (지정 기간 전체)
        const sabangCodeStatsResult = await sql`
          SELECT 
            COUNT(*) FILTER (
              WHERE ur.row_data->>'sabang_code' IS NOT NULL 
              AND ur.row_data->>'sabang_code' != ''
            ) as sabang_code_orders,
            COUNT(*) as total_orders
          FROM upload_rows ur
          INNER JOIN uploads u ON ur.upload_id = u.id
          WHERE u.company_id = ${companyId}
            AND u.created_at >= ${dateFromUTC.toISOString()}
            AND u.created_at <= ${dateToUTC.toISOString()}
            AND ur.row_data->>'업체명' = ${vendorName}
        `;

        const sabangCodeStats = sabangCodeStatsResult[0] || {};
        const sabangCodeOrders = parseInt(
          sabangCodeStats.sabang_code_orders || "0",
          10,
        );
        const totalOrdersForSabang = parseInt(
          sabangCodeStats.total_orders || "0",
          10,
        );

        const files = fileStatsResult.map((file: any) => ({
          uploadId: file.upload_id,
          fileName: file.file_name || `파일_${file.upload_id}`,
          createdAt: file.created_at,
          totalOrders: parseInt(file.total_orders || "0", 10),
          deliveryOrders: parseInt(file.delivery_orders || "0", 10),
        }));

        return {
          vendorName,
          files,
          sabangCodeOrders,
          totalOrdersForSabang,
        };
      }),
    );

    return NextResponse.json({
      success: true,
      data: vendorStats,
    });
  } catch (error: any) {
    console.error("운송장 업체 리스트 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500},
    );
  }
}
