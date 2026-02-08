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
        {status: 400},
      );
    }

    const body = await request.json();
    const {settlementIds, perOrderShippingFee} = body; // 선택된 정산 ID 배열

    if (
      !settlementIds ||
      !Array.isArray(settlementIds) ||
      settlementIds.length === 0
    ) {
      return NextResponse.json(
        {success: false, error: "정산 ID가 필요합니다."},
        {status: 400},
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
        {status: 404},
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

      // 정산에 연결된 주문 데이터 조회 (저장된 order_data와 product_data 사용)
      const settlementOrders = await sql`
        SELECT 
          order_id,
          order_data,
          product_data
        FROM mall_sales_settlement_orders
        WHERE settlement_id = ${settlementId}
        ORDER BY order_id
      `;

      if (settlementOrders.length === 0) {
        console.log(`[정산서 다운로드] ${mallName}: 주문이 없습니다.`);
        continue;
      }

      // 저장된 order_data와 product_data를 사용하여 주문 데이터 구성
      const orderIds = settlementOrders.map((so: any) => so.order_id);

      // upload_rows에서 기본 정보만 가져오기
      const uploadRowsData = await sql`
        SELECT DISTINCT ON (ur.id)
          ur.id,
          ur.mall_id
        FROM upload_rows ur
        WHERE ur.company_id = ${companyId}
          AND ur.id = ANY(${orderIds})
        ORDER BY ur.id
      `;

      const uploadRowsMap = new Map(
        uploadRowsData.map((ur: any) => [ur.id, ur]),
      );

      // 저장된 order_data, product_data와 결합
      const orders = settlementOrders.map((so: any) => {
        const productData = so.product_data || {};
        const productCode =
          productData.code ||
          so.order_data?.["매핑코드"] ||
          so.order_data?.["productId"] ||
          null;
        return {
          id: so.order_id,
          row_data: so.order_data || {}, // 저장된 주문 데이터 사용
          mall_id: uploadRowsMap.get(so.order_id)?.mall_id || mallId,
          productCode: productCode,
          productSalePrice: productData.sale_price || null, // 저장된 상품 정보 사용
          productSabangName: productData.sabang_name || null, // 저장된 상품 정보 사용
          productBillType: productData.bill_type || null, // 저장된 상품 정보 사용
        };
      });

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

        // 공급가 우선순위:
        // 1. 주문 데이터의 공급단가 (row_data["공급단가"])
        // 2. 주문 데이터의 공급가 (row_data["공급가"])
        // 3. 매핑된 상품의 공급단가 (order.productSalePrice)
        // 4. 기타 (row_data["sale_price"] 등)
        let salePrice =
          rowData["공급단가"] ||
          rowData["공급가"] ||
          order.productSalePrice ||
          rowData["sale_price"] ||
          0;
        const salePriceNum =
          typeof salePrice === "number"
            ? salePrice
            : parseFloat(String(salePrice)) || 0;

        // 행사가가 있으면 행사가 사용 (매핑코드로 조회)
        const eventPrice = promotionMap[mappingCode] || null;
        const unitPrice = eventPrice !== null ? eventPrice : salePriceNum;

        // 배송비 계산: 건당 배송비가 체크 해제되어 있으면 각 주문건마다 배송비 계산 적용
        // 각 주문건마다: (공급가 * 수량) - (4000 * (수량 - 1))
        // 즉, 각 주문건의 첫 번째 상품에만 배송비가 포함되고 나머지는 배송비가 빠짐
        const calculatedAmount =
          perOrderShippingFee === false
            ? unitPrice * quantityNum - 4000 * (quantityNum - 1)
            : unitPrice * quantityNum;

        // 사방넷명: products의 sabang_name 또는 row_data의 사방넷명
        const sabangName =
          order.productSabangName ||
          rowData["사방넷명"] ||
          rowData["sabangName"] ||
          rowData["sabang_name"] ||
          rowData["상품명"] ||
          "";

        // 과세/면세: products의 bill_type
        const billType = (
          order.productBillType === "과세" || order.productBillType === "면세"
            ? order.productBillType
            : "과세"
        ) as "과세" | "면세";

        // 매핑코드가 같은 상품들은 합산
        // 각 주문건별로 계산된 배송비가 포함된 금액을 합산
        if (orderDataMap[mappingCode]) {
          orderDataMap[mappingCode].quantity += quantityNum;
          orderDataMap[mappingCode].amount += calculatedAmount;
        } else {
          orderDataMap[mappingCode] = {
            sabangName,
            quantity: quantityNum,
            unitPrice,
            amount: calculatedAmount,
            billType,
            mappingCode,
          };
        }
      });

      // 배열로 변환 및 정렬 (사방넷명 오름차순)
      const orderDataList: SettlementOrderData[] = Object.values(
        orderDataMap,
      ).sort((a, b) => {
        const nameA = (a.sabangName || "").toLowerCase();
        const nameB = (b.sabangName || "").toLowerCase();
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return 0;
      });

      // 합계 계산
      const totalAmount = orderDataList.reduce(
        (sum, order) => sum + order.amount,
        0,
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
      const fileName = `${dateStr}_정산서_${mallName}.xlsx`;
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
      {
        success: false,
        error: error.message || "알 수 없는 오류가 발생했습니다.",
      },
      {status: 500},
    );
  }
}
