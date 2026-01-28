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
    const {vendorName, allVendors, startDate, endDate} = body;

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

    // 날짜 범위 계산
    let dateFromUTC: Date;
    let dateToUTC: Date;

    if (startDate && endDate) {
      // startDate, endDate가 있으면 해당 범위 사용
      // 한국 시간으로 시작일 00:00:00, 종료일 23:59:59를 UTC로 변환
      const startKoreaStr = `${startDate}T00:00:00+09:00`;
      const endKoreaStr = `${endDate}T23:59:59.999+09:00`;
      
      const startKoreaDate = new Date(startKoreaStr);
      const endKoreaDate = new Date(endKoreaStr);
      
      // UTC로 변환
      dateFromUTC = new Date(startKoreaDate.toISOString());
      dateToUTC = new Date(endKoreaDate.toISOString());
    } else {
      // 기본값: 오늘만 조회
      const now = new Date();
      const koreaTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);

      const todayStart = new Date(koreaTime);
      todayStart.setHours(0, 0, 0, 0);

      const todayEnd = new Date(koreaTime);
      todayEnd.setHours(23, 59, 59, 999);

      dateFromUTC = new Date(todayStart.getTime() - 9 * 60 * 60 * 1000);
      dateToUTC = new Date(todayEnd.getTime() - 9 * 60 * 60 * 1000);
    }

    // 디버깅 로그
    console.log(
      `🔍 [AB 체크 API] startDate: ${startDate}, endDate: ${endDate}`,
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
