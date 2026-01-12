import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest, getUserIdFromRequest} from "@/lib/company";

/**
 * GET /api/upload/delivery-vendors
 * 금일 업로드한 업체 리스트와 통계 조회
 * - 일반 유저: assigned_vendor_ids에 있는 업체만
 * - 관리자: 금일 저장된 주문의 모든 업체
 */
export async function GET(request: NextRequest) {
  try {
    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400}
      );
    }

    // user_id 추출
    const userId = await getUserIdFromRequest(request);
    
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
              assignedVendorIds = Array.isArray(userResult[0].assigned_vendor_ids)
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

    // 금일 날짜 계산 (한국 시간 기준, 00:00:00 ~ 23:59:59)
    const today = new Date();
    const koreaTime = new Date(today.getTime() + 9 * 60 * 60 * 1000); // UTC+9
    const todayStart = new Date(koreaTime);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(koreaTime);
    todayEnd.setHours(23, 59, 59, 999);
    
    // UTC로 변환
    const todayStartUTC = new Date(todayStart.getTime() - 9 * 60 * 60 * 1000);
    const todayEndUTC = new Date(todayEnd.getTime() - 9 * 60 * 60 * 1000);

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
          AND u.created_at >= ${todayStartUTC.toISOString()}
          AND u.created_at <= ${todayEndUTC.toISOString()}
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

      // vendors 테이블에서 업체명 조회
      const vendorNamesResult = await sql`
        SELECT name
        FROM vendors
        WHERE id = ANY(${assignedVendorIds}) AND company_id = ${companyId}
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
          AND u.created_at >= ${todayStartUTC.toISOString()}
          AND u.created_at <= ${todayEndUTC.toISOString()}
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

    // 각 업체별로 파일(upload_id)별 통계 조회
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
            AND u.created_at >= ${todayStartUTC.toISOString()}
            AND u.created_at <= ${todayEndUTC.toISOString()}
            AND ur.row_data->>'업체명' = ${vendorName}
          GROUP BY u.id, u.file_name, u.created_at
          ORDER BY u.created_at DESC
        `;

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
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: vendorStats,
    });
  } catch (error: any) {
    console.error("운송장 업체 리스트 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
