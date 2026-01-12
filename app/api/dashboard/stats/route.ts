import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

/**
 * GET /api/dashboard/stats
 * 대시보드 통계 데이터 조회
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

    const {searchParams} = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "30", 10); // 기본 30일
    const topLimit = parseInt(searchParams.get("topLimit") || "10", 10); // 기본 상위 10개

    // 시작 날짜 계산 (오늘부터 days일 전까지)
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    // 병렬로 실행 가능한 쿼리들을 동시에 실행
    const [dailyOrdersResult, dailySalesResult, topVendorsByOrdersResult, vendorSalesDataResult, topProductsByOrdersResult] = await Promise.all([
      // 1. 일일 주문 수량 (날짜별)
      sql`
        SELECT 
          DATE(ur.created_at) as date,
          COUNT(*) as order_count
        FROM upload_rows ur
        INNER JOIN uploads u ON ur.upload_id = u.id
        WHERE u.company_id = ${companyId}
          AND DATE(ur.created_at) >= ${startDateStr}::date
          AND DATE(ur.created_at) <= ${endDateStr}::date
          AND (ur.row_data->>'주문상태' IS NULL OR ur.row_data->>'주문상태' != '취소')
        GROUP BY DATE(ur.created_at)
        ORDER BY date ASC
      `,
      // 2. 일일 매출과 이익액 (날짜별)
      sql`
        SELECT 
          DATE(ur.created_at) as date,
          ur.id,
          ur.row_data,
          p.price as product_price,
          p.sale_price as product_sale_price
        FROM upload_rows ur
        INNER JOIN uploads u ON ur.upload_id = u.id
        LEFT JOIN LATERAL (
          SELECT price, sale_price
          FROM products
          WHERE company_id = ${companyId}
            AND (
              code = ur.row_data->>'매핑코드'
              OR id::text = ur.row_data->>'productId'
            )
          LIMIT 1
        ) p ON true
        WHERE u.company_id = ${companyId}
          AND DATE(ur.created_at) >= ${startDateStr}::date
          AND DATE(ur.created_at) <= ${endDateStr}::date
          AND (ur.row_data->>'주문상태' IS NULL OR ur.row_data->>'주문상태' != '취소')
      `,
      // 3. 주문수 많은 업체 top rate
      sql`
        SELECT 
          COALESCE(
            NULLIF(ur.shop_name, ''),
            NULLIF(ur.vendor_name, ''),
            NULLIF(ur.row_data->>'업체명', ''),
            NULLIF(ur.row_data->>'쇼핑몰명', ''),
            NULLIF(ur.row_data->>'쇼핑몰명(1)', ''),
            NULLIF(ur.row_data->>'쇼핑몰', ''),
            NULLIF(ur.row_data->>'업체', ''),
            NULLIF(ur.row_data->>'vendor', ''),
            NULLIF(ur.row_data->>'shop', ''),
            '미지정'
          ) as vendor_name,
          COUNT(*) as order_count
        FROM upload_rows ur
        INNER JOIN uploads u ON ur.upload_id = u.id
        WHERE u.company_id = ${companyId}
          AND DATE(ur.created_at) >= ${startDateStr}::date
          AND DATE(ur.created_at) <= ${endDateStr}::date
          AND (ur.row_data->>'주문상태' IS NULL OR ur.row_data->>'주문상태' != '취소')
        GROUP BY COALESCE(
          NULLIF(ur.shop_name, ''),
          NULLIF(ur.vendor_name, ''),
          NULLIF(ur.row_data->>'업체명', ''),
          NULLIF(ur.row_data->>'쇼핑몰명', ''),
          NULLIF(ur.row_data->>'쇼핑몰명(1)', ''),
          NULLIF(ur.row_data->>'쇼핑몰', ''),
          NULLIF(ur.row_data->>'업체', ''),
          NULLIF(ur.row_data->>'vendor', ''),
          NULLIF(ur.row_data->>'shop', ''),
          '미지정'
        )
        ORDER BY order_count DESC
        LIMIT ${topLimit}
      `,
      // 4. 매출 높은 업체를 위한 데이터
      sql`
        SELECT 
          ur.id,
          ur.shop_name,
          ur.vendor_name,
          ur.row_data,
          p.price as product_price,
          p.sale_price as product_sale_price
        FROM upload_rows ur
        INNER JOIN uploads u ON ur.upload_id = u.id
        LEFT JOIN LATERAL (
          SELECT price, sale_price
          FROM products
          WHERE company_id = ${companyId}
            AND (
              code = ur.row_data->>'매핑코드'
              OR id::text = ur.row_data->>'productId'
            )
          LIMIT 1
        ) p ON true
        WHERE u.company_id = ${companyId}
          AND DATE(ur.created_at) >= ${startDateStr}::date
          AND DATE(ur.created_at) <= ${endDateStr}::date
          AND (ur.row_data->>'주문상태' IS NULL OR ur.row_data->>'주문상태' != '취소')
      `,
      // 5. 주문수 많은 상품 top rate
      sql`
        SELECT 
          COALESCE(ur.row_data->>'매핑코드', ur.row_data->>'상품코드', '미지정') as product_code,
          COUNT(DISTINCT COALESCE(
            ur.row_data->>'주문번호',
            ur.row_data->>'주문번호(사방넷)',
            ur.row_data->>'주문번호(쇼핑몰)',
            ur.row_data->>'내부코드',
            ur.id::text
          )) as order_count,
          MAX(p.sabang_name) as sabang_name
        FROM upload_rows ur
        INNER JOIN uploads u ON ur.upload_id = u.id
        LEFT JOIN products p ON (
          p.company_id = ${companyId}
          AND (
            p.code = ur.row_data->>'매핑코드'
            OR p.code = ur.row_data->>'상품코드'
            OR p.id::text = ur.row_data->>'productId'
          )
        )
        WHERE u.company_id = ${companyId}
          AND DATE(ur.created_at) >= ${startDateStr}::date
          AND DATE(ur.created_at) <= ${endDateStr}::date
          AND (ur.row_data->>'주문상태' IS NULL OR ur.row_data->>'주문상태' != '취소')
        GROUP BY COALESCE(ur.row_data->>'매핑코드', ur.row_data->>'상품코드', '미지정')
        ORDER BY order_count DESC
        LIMIT ${topLimit}
      `
    ]);

    const dailyOrders = dailyOrdersResult;
    const dailySales = dailySalesResult;
    const topVendorsByOrders = topVendorsByOrdersResult;
    const vendorSalesData = vendorSalesDataResult;
    const topProductsByOrders = topProductsByOrdersResult;

    // 날짜별로 매출과 이익 계산
    const salesByDate: {[date: string]: {sales: number; profit: number}} = {};
    for (const row of dailySales) {
      const date =
        row.date instanceof Date
          ? row.date.toISOString().split("T")[0]
          : typeof row.date === "string"
            ? row.date
            : new Date(row.date).toISOString().split("T")[0];
      const rowData = row.row_data || {};
      
      // 공급가
      const salePrice =
        rowData["공급가"] ||
        row.product_sale_price ||
        rowData["sale_price"] ||
        rowData["공급단가"] ||
        0;
      const salePriceNum = typeof salePrice === "string" ? parseFloat(salePrice) : salePrice || 0;

      // 원가
      const costPrice = row.product_price || rowData["원가"] || rowData["가격"] || 0;
      const costPriceNum = typeof costPrice === "string" ? parseFloat(costPrice) : costPrice || 0;

      // 수량
      const quantity = rowData["수량"] || rowData["주문수량"] || 1;
      const quantityNum = typeof quantity === "string" ? parseFloat(quantity) : quantity || 1;

      // 매출 = 공급가 * 수량
      const sales = salePriceNum * quantityNum;
      // 이익 = (공급가 - 원가) * 수량
      const profit = (salePriceNum - costPriceNum) * quantityNum;

      if (!salesByDate[date]) {
        salesByDate[date] = {sales: 0, profit: 0};
      }
      salesByDate[date].sales += sales;
      salesByDate[date].profit += profit;
    }

    // 날짜별 매출/이익 배열로 변환
    const dailySalesProfit = Object.entries(salesByDate)
      .map(([date, data]) => ({
        date,
        sales: Math.round(data.sales),
        profit: Math.round(data.profit),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 업체별 매출 계산 (주문 데이터의 업체명 필드만 사용)
    const salesByVendor: {[vendor: string]: number} = {};
    for (const row of vendorSalesData) {
      const rowData = row.row_data || {};
      // 업체명 추출: 여러 필드에서 순차적으로 확인
      const vendorName =
        (row.shop_name && row.shop_name.trim()) ||
        (row.vendor_name && row.vendor_name.trim()) ||
        (rowData["업체명"] && String(rowData["업체명"]).trim()) ||
        (rowData["쇼핑몰명"] && String(rowData["쇼핑몰명"]).trim()) ||
        (rowData["쇼핑몰명(1)"] && String(rowData["쇼핑몰명(1)"]).trim()) ||
        (rowData["쇼핑몰"] && String(rowData["쇼핑몰"]).trim()) ||
        (rowData["업체"] && String(rowData["업체"]).trim()) ||
        (rowData["vendor"] && String(rowData["vendor"]).trim()) ||
        (rowData["shop"] && String(rowData["shop"]).trim()) ||
        "미지정";
      
      const salePrice =
        rowData["공급가"] ||
        row.product_sale_price ||
        rowData["sale_price"] ||
        rowData["공급단가"] ||
        0;
      const salePriceNum = typeof salePrice === "string" ? parseFloat(salePrice) : salePrice || 0;

      const quantity = rowData["수량"] || rowData["주문수량"] || 1;
      const quantityNum = typeof quantity === "string" ? parseFloat(quantity) : quantity || 1;

      const sales = salePriceNum * quantityNum;

      if (!salesByVendor[vendorName]) {
        salesByVendor[vendorName] = 0;
      }
      salesByVendor[vendorName] += sales;
    }

    const topVendorsBySales = Object.entries(salesByVendor)
      .map(([vendor_name, sales]) => ({
        vendor_name,
        sales: Math.round(sales),
      }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, topLimit);

    return NextResponse.json({
      success: true,
      data: {
        dailyOrders: dailyOrders.map((row) => ({
          date:
            row.date instanceof Date
              ? row.date.toISOString().split("T")[0]
              : typeof row.date === "string"
                ? row.date
                : String(row.date),
          orderCount: parseInt(row.order_count) || 0,
        })),
        dailySalesProfit,
        topVendorsByOrders: topVendorsByOrders.map((row) => ({
          vendorName: row.vendor_name || "미지정",
          orderCount: parseInt(row.order_count) || 0,
        })),
        topVendorsBySales: topVendorsBySales.map((row) => ({
          vendorName: row.vendor_name || "미지정",
          sales: row.sales,
        })),
        topProductsByOrders: topProductsByOrders.map((row) => ({
          productCode: row.product_code || "미지정",
          sabangName: row.sabang_name || row.product_code || "미지정",
          orderCount: parseInt(row.order_count) || 0,
        })),
      },
    });
  } catch (error: any) {
    console.error("대시보드 통계 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message || "알 수 없는 오류가 발생했습니다."},
      {status: 500}
    );
  }
}
