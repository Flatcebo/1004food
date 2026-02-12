import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";
import {getTodayDate} from "@/utils/date";

/**
 * 특정 매입처의 주문 상세 목록 조회 API
 * GET: 매입처별 주문 목록 조회 (발주여부 필터 가능)
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

    // URL 파라미터 추출
    const {searchParams} = new URL(request.url);
    const purchaseId = searchParams.get("purchaseId");
    const purchaseName = searchParams.get("purchaseName");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const orderFilter = searchParams.get("orderFilter") || "unordered"; // all, ordered, unordered

    if (!purchaseId && !purchaseName) {
      return NextResponse.json(
        {success: false, error: "purchaseId 또는 purchaseName이 필요합니다."},
        {status: 400},
      );
    }

    // 오늘 날짜 기본값 (한국 시간 기준)
    const today = getTodayDate();
    const queryStartDate = startDate || today;
    const queryEndDate = endDate || today;

    // 한국 시간(KST) 기준으로 날짜 범위를 UTC로 변환
    // 예: 2026-02-12 → 한국 00:00:00 ~ 23:59:59 = UTC 2026-02-11 15:00 ~ 2026-02-12 14:59
    const startKoreaStr = `${queryStartDate}T00:00:00+09:00`;
    const endKoreaStr = `${queryEndDate}T23:59:59.999+09:00`;
    const dateFromUTC = new Date(startKoreaStr);
    const dateToUTC = new Date(endKoreaStr);

    // 매입처 정보 조회
    let purchase;
    if (purchaseId) {
      const result = await sql`
        SELECT id, name, submit_type, email, kakaotalk, template_headers
        FROM purchase
        WHERE id = ${purchaseId} AND company_id = ${companyId}
      `;
      purchase = result[0];
    } else {
      const result = await sql`
        SELECT id, name, submit_type, email, kakaotalk, template_headers
        FROM purchase
        WHERE name = ${purchaseName} AND company_id = ${companyId}
      `;
      purchase = result[0];
    }

    if (!purchase) {
      return NextResponse.json(
        {success: false, error: "매입처를 찾을 수 없습니다."},
        {status: 404},
      );
    }

    // 주문 목록 조회 (purchase_id FK 사용)
    let orderFilterCondition = sql``;
    if (orderFilter === "ordered") {
      orderFilterCondition = sql`AND ur.is_ordered = true`;
    } else if (orderFilter === "unordered") {
      orderFilterCondition = sql`AND (ur.is_ordered = false OR ur.is_ordered IS NULL)`;
    }

    // 날짜 조건: 업로드일(u.created_at) 또는 발주일(ob.batch_date)이 기간 내
    // - 미발주 주문: 업로드일만 해당
    // - 발주된 주문: 업로드일 또는 배치 발주일(batch_date)이 기간 내면 포함
    //   (1차가 전날 업로드·당일 발주된 경우도 당일 조회에 포함)
    const orders = await sql`
      SELECT DISTINCT ON (ur.id)
        ur.id,
        ur.row_data,
        ur.is_ordered,
        ur.purchase_id,
        ur.order_batch_id,
        ur.created_at,
        u.created_at as upload_date,
        pr.id as product_id,
        pr.code as product_code,
        pr.name as product_name,
        pr.sale_price,
        pr.sabang_name,
        ob.batch_number,
        ob.batch_date,
        ob.created_at as batch_created_at
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
        LIMIT 1
      ) pr ON true
      LEFT JOIN order_batches ob ON ur.order_batch_id = ob.id
      WHERE ur.purchase_id = ${purchase.id}
        AND ur.row_data->>'주문상태' NOT IN ('취소')
        AND (
          (u.created_at >= ${dateFromUTC.toISOString()}::timestamptz
            AND u.created_at <= ${dateToUTC.toISOString()}::timestamptz)
          OR (
            ur.is_ordered = true
            AND ob.id IS NOT NULL
            AND ob.batch_date >= ${queryStartDate}::date
            AND ob.batch_date <= ${queryEndDate}::date
          )
        )
        ${orderFilterCondition}
      ORDER BY ur.id, u.created_at DESC
    `;

    // 발주 차수별 그룹화 정보 생성
    const batches: {
      [key: string]: {
        batchNumber: number;
        batchDate: string;
        batchCreatedAt: string | null;
        orderIds: number[];
      };
    } = {};
    orders.forEach((row: any) => {
      if (row.order_batch_id && row.batch_number && row.batch_date) {
        // batch_date를 문자열로 변환 (Date 객체일 수 있음)
        const batchDateStr =
          row.batch_date instanceof Date
            ? row.batch_date.toISOString().split("T")[0]
            : String(row.batch_date);

        const batchKey = `${batchDateStr}_${row.batch_number}`;
        if (!batches[batchKey]) {
          // batch_created_at은 이미 한국 시간으로 저장되어 있음
          // 문자열로 변환 (Date 객체일 수 있음)
          let batchCreatedAtStr: string | null = null;
          if (row.batch_created_at) {
            try {
              if (row.batch_created_at instanceof Date) {
                // Date 객체인 경우 포맷팅
                const year = row.batch_created_at.getFullYear();
                const month = String(
                  row.batch_created_at.getMonth() + 1,
                ).padStart(2, "0");
                const day = String(row.batch_created_at.getDate()).padStart(
                  2,
                  "0",
                );
                const hours = String(row.batch_created_at.getHours()).padStart(
                  2,
                  "0",
                );
                const minutes = String(
                  row.batch_created_at.getMinutes(),
                ).padStart(2, "0");
                const seconds = String(
                  row.batch_created_at.getSeconds(),
                ).padStart(2, "0");
                batchCreatedAtStr = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
              } else {
                // 문자열인 경우 그대로 사용 (이미 포맷팅되어 있을 수 있음)
                const dateStr = String(row.batch_created_at);
                // ISO 형식이면 파싱 후 포맷팅
                if (dateStr.includes("T") || dateStr.includes("Z")) {
                  const date = new Date(dateStr);
                  const year = date.getFullYear();
                  const month = String(date.getMonth() + 1).padStart(2, "0");
                  const day = String(date.getDate()).padStart(2, "0");
                  const hours = String(date.getHours()).padStart(2, "0");
                  const minutes = String(date.getMinutes()).padStart(2, "0");
                  const seconds = String(date.getSeconds()).padStart(2, "0");
                  batchCreatedAtStr = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
                } else {
                  batchCreatedAtStr = dateStr;
                }
              }
            } catch (error) {
              console.error("batch_created_at 처리 실패:", error);
              batchCreatedAtStr = String(row.batch_created_at);
            }
          }

          batches[batchKey] = {
            batchNumber: row.batch_number,
            batchDate: batchDateStr,
            batchCreatedAt: batchCreatedAtStr,
            orderIds: [],
          };
        }
        batches[batchKey].orderIds.push(row.id);
      }
    });

    // 차수 정보를 배열로 변환 (날짜 오름차순, 차수 오름차순)
    const batchList = Object.values(batches).sort((a, b) => {
      const dateA = String(a.batchDate || "");
      const dateB = String(b.batchDate || "");
      if (dateA !== dateB) {
        return dateA.localeCompare(dateB);
      }
      return a.batchNumber - b.batchNumber;
    });

    return NextResponse.json({
      success: true,
      purchase: {
        id: purchase.id,
        name: purchase.name,
        submitType: purchase.submit_type || [],
        email: purchase.email,
        kakaotalk: purchase.kakaotalk,
        templateHeaders: purchase.template_headers,
      },
      data: orders.map((row: any) => ({
        id: row.id,
        rowData: row.row_data,
        isOrdered: row.is_ordered,
        purchaseId: row.purchase_id,
        orderBatchId: row.order_batch_id,
        batchNumber: row.batch_number,
        batchDate: row.batch_date,
        createdAt: row.created_at,
        uploadDate: row.upload_date,
        productId: row.product_id,
        productCode: row.product_code,
        productName: row.product_name,
        salePrice: row.sale_price,
        sabangName: row.sabang_name,
      })),
      batches: batchList,
      count: orders.length,
      period: {
        startDate: queryStartDate,
        endDate: queryEndDate,
      },
    });
  } catch (error: any) {
    console.error("매입처별 주문 목록 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500},
    );
  }
}

/**
 * 주문 발주 상태 업데이트 API
 * PUT: 주문들의 발주 상태를 업데이트
 */
export async function PUT(request: NextRequest) {
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
    const {orderIds, isOrdered} = body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json(
        {success: false, error: "orderIds가 필요합니다."},
        {status: 400},
      );
    }

    // 주문 발주 상태 업데이트
    const result = await sql`
      UPDATE upload_rows ur
      SET is_ordered = ${isOrdered}
      FROM uploads u
      WHERE ur.upload_id = u.id 
        AND u.company_id = ${companyId}
        AND ur.id = ANY(${orderIds})
    `;

    return NextResponse.json({
      success: true,
      message: `${orderIds.length}건의 발주 상태가 업데이트되었습니다.`,
      updatedCount: orderIds.length,
    });
  } catch (error: any) {
    console.error("발주 상태 업데이트 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500},
    );
  }
}
