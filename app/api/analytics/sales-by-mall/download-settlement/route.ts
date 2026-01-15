import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import {
  createSettlementTemplate,
  SettlementOrderData,
  SettlementSummary,
} from "@/libs/settlement-template";
import {generateDatePrefix} from "@/utils/filename";

/**
 * POST /api/analytics/sales-by-mall/download-settlement
 * 정산서 다운로드 (mall별로 파일 생성 후 zip 압축)
 */
export async function POST(request: NextRequest) {
  try {
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400}
      );
    }

    const body = await request.json();
    const {settlementIds} = body; // 선택된 정산 ID 배열

    if (!settlementIds || !Array.isArray(settlementIds) || settlementIds.length === 0) {
      return NextResponse.json(
        {success: false, error: "정산 ID가 필요합니다."},
        {status: 400}
      );
    }

    // 정산 데이터 조회
    const settlements = await sql`
      SELECT 
        mss.id,
        mss.mall_id as "mallId",
        m.name as "mallName",
        TO_CHAR(mss.period_start_date, 'YYYY-MM-DD') as "periodStartDate",
        TO_CHAR(mss.period_end_date, 'YYYY-MM-DD') as "periodEndDate"
      FROM mall_sales_settlements mss
      INNER JOIN mall m ON mss.mall_id = m.id
      WHERE mss.company_id = ${companyId}
        AND mss.id = ANY(${settlementIds})
      ORDER BY m.name
    `;

    if (settlements.length === 0) {
      return NextResponse.json(
        {success: false, error: "정산 데이터를 찾을 수 없습니다."},
        {status: 404}
      );
    }

    // ZIP 파일 생성
    const zip = new JSZip();
    const dateStr = generateDatePrefix();
    
    // 정산서 A1 셀용 날짜 (YYYY-MM-DD 형식)
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const settlementDate = `${year}-${month}-${day}`;

    // 각 mall별로 정산서 생성
    for (const settlement of settlements) {
      const settlementId = settlement.id;
      const mallId = settlement.mallId;
      const mallName = settlement.mallName;
      const periodStartDate = settlement.periodStartDate;
      const periodEndDate = settlement.periodEndDate;

      // 정산에 연결된 주문 ID들 조회
      const settlementOrders = await sql`
        SELECT order_id
        FROM mall_sales_settlement_orders
        WHERE settlement_id = ${settlementId}
        ORDER BY order_id
      `;

      const orderIds = settlementOrders.map((so: any) => so.order_id);

      if (orderIds.length === 0) {
        console.log(`[정산서 다운로드] ${mallName}: 주문이 없습니다.`);
        continue;
      }

      // 주문 데이터 조회 (상품 정보 포함)
      const orders = await sql`
        SELECT DISTINCT ON (ur.id)
          ur.id,
          ur.row_data,
          ur.mall_id,
          p.code as "productCode",
          p.sale_price as "productSalePrice",
          p.sabang_name as "productSabangName",
          p.bill_type as "productBillType"
        FROM upload_rows ur
        LEFT JOIN LATERAL (
          SELECT code, sale_price, sabang_name, bill_type
          FROM products
          WHERE company_id = ${companyId}
            AND (
              code = ur.row_data->>'매핑코드'
              OR id::text = ur.row_data->>'productId'
            )
          LIMIT 1
        ) p ON true
        WHERE ur.company_id = ${companyId}
          AND ur.id = ANY(${orderIds})
        ORDER BY ur.id
      `;

      // 행사가 조회
      const promotions = await sql`
        SELECT product_code, event_price
        FROM mall_promotions
        WHERE mall_id = ${mallId}
      `;

      const promotionMap: {[key: string]: number | null} = {};
      promotions.forEach((promo: any) => {
        promotionMap[promo.product_code] = promo.event_price;
      });

      // 주문 데이터 가공
      const orderDataMap: {
        [mappingCode: string]: {
          sabangName: string;
          quantity: number;
          unitPrice: number;
          amount: number;
          billType: "과세" | "면세";
          mappingCode: string;
        };
      } = {};

      orders.forEach((order: any) => {
        const rowData = order.row_data || {};
        const mappingCode = rowData["매핑코드"] || order.productCode || "";
        const quantity = rowData["수량"] || rowData["주문수량"] || 1;
        const quantityNum =
          typeof quantity === "number"
            ? quantity
            : parseFloat(String(quantity)) || 1;

        // 공급가: products의 sale_price 또는 row_data의 공급가
        let salePrice =
          order.productSalePrice ||
          rowData["공급가"] ||
          rowData["sale_price"] ||
          rowData["공급단가"] ||
          0;
        const salePriceNum =
          typeof salePrice === "number"
            ? salePrice
            : parseFloat(String(salePrice)) || 0;

        // 행사가가 있으면 행사가 사용 (매핑코드로 조회)
        const eventPrice = promotionMap[mappingCode] || null;
        const unitPrice = eventPrice !== null ? eventPrice : salePriceNum;

        // 사방넷명: products의 sabang_name 또는 row_data의 사방넷명
        const sabangName =
          order.productSabangName ||
          rowData["사방넷명"] ||
          rowData["sabangName"] ||
          rowData["sabang_name"] ||
          rowData["상품명"] ||
          "";

        // 과세/면세: products의 bill_type
        const billType =
          (order.productBillType === "과세" || order.productBillType === "면세"
            ? order.productBillType
            : "과세") as "과세" | "면세";

        // 매핑코드가 같은 상품들은 합산
        if (orderDataMap[mappingCode]) {
          orderDataMap[mappingCode].quantity += quantityNum;
          orderDataMap[mappingCode].amount += quantityNum * unitPrice;
        } else {
          orderDataMap[mappingCode] = {
            sabangName,
            quantity: quantityNum,
            unitPrice,
            amount: quantityNum * unitPrice,
            billType,
            mappingCode,
          };
        }
      });

      // 배열로 변환 및 정렬 (사방넷명 오름차순)
      const orderDataList: SettlementOrderData[] = Object.values(orderDataMap).sort((a, b) => {
        const nameA = (a.sabangName || "").toLowerCase();
        const nameB = (b.sabangName || "").toLowerCase();
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return 0;
      });

      // 합계 계산
      const totalAmount = orderDataList.reduce(
        (sum, order) => sum + order.amount,
        0
      );
      const taxableAmount = orderDataList
        .filter((order) => order.billType === "과세")
        .reduce((sum, order) => sum + order.amount, 0);
      const taxFreeAmount = orderDataList
        .filter((order) => order.billType === "면세")
        .reduce((sum, order) => sum + order.amount, 0);

      const summary: SettlementSummary = {
        totalAmount,
        taxableAmount,
        taxFreeAmount,
      };

      // 정산서 생성
      const workbook = createSettlementTemplate({
        mallName,
        date: settlementDate,
        orders: orderDataList,
        summary,
      });

      // 엑셀 파일을 버퍼로 생성
      const buffer = await workbook.xlsx.writeBuffer();

      // ZIP에 파일 추가
      const fileName = `${dateStr}_${mallName}_정산서.xlsx`;
      zip.file(fileName, buffer);
    }

    // ZIP 파일 생성
    const zipBuffer = await zip.generateAsync({type: "nodebuffer"});

    // ZIP 파일 다운로드
    const zipFileName = `${dateStr}_정산서.zip`;
    const encodedZipFileName = encodeURIComponent(zipFileName);
    const contentDisposition = `attachment; filename="settlement.zip"; filename*=UTF-8''${encodedZipFileName}`;

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", "application/zip");
    responseHeaders.set("Content-Disposition", contentDisposition);

    return new Response(Buffer.from(zipBuffer), {
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("정산서 다운로드 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message || "알 수 없는 오류가 발생했습니다."},
      {status: 500}
    );
  }
}
