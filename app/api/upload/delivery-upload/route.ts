import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import * as XLSX from "xlsx";
import {normalizeCarrierName} from "@/utils/carrierMapping";

// 한국 시간(KST, UTC+9)을 반환하는 함수
function getKoreaTime(): Date {
  const now = new Date();
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
  const koreaTime = new Date(utcTime + 9 * 3600000);
  return koreaTime;
}

// 헤더를 정규화하는 함수
function normalizeHeader(header: string): string {
  return header.replace(/\s+/g, "").toLowerCase();
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        {success: false, error: "파일이 제공되지 않았습니다."},
        {status: 400}
      );
    }

    // 엑셀 파일 읽기
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, {type: "array"});

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return NextResponse.json(
        {success: false, error: "워크시트가 없습니다."},
        {status: 400}
      );
    }

    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // 헤더와 데이터 추출
    const raw = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      raw: false,
    }) as any[][];

    if (!raw.length || raw[0].length === 0) {
      return NextResponse.json(
        {success: false, error: "파일이 비어있거나 헤더가 없습니다."},
        {status: 400}
      );
    }

    // 헤더 파싱 및 필수 헤더 찾기
    const headers = raw[0] as string[];
    let orderNumberIdx = -1;
    let trackingNumberIdx = -1;
    let carrierIdx = -1;

    headers.forEach((header, index) => {
      const normalized = normalizeHeader(String(header).trim());

      // 다양한 헤더명 패턴 처리
      if (normalized.includes("주문번호") || normalized.includes("ordernumber")) {
        orderNumberIdx = index;
      }
      if (normalized.includes("운송장") || normalized.includes("tracking") ||
          normalized.includes("trackingnumber") || normalized.includes("운송장번호")) {
        trackingNumberIdx = index;
      }
      if (normalized.includes("택배사") || normalized.includes("carrier") ||
          normalized.includes("배송사") || normalized.includes("배송업체")) {
        carrierIdx = index;
      }
    });

    // 필수 헤더 검증
    if (orderNumberIdx === -1) {
      return NextResponse.json(
        {
          success: false,
          error: "주문번호 헤더를 찾을 수 없습니다. '주문번호' 헤더가 필요합니다.",
        },
        {status: 400}
      );
    }

    if (trackingNumberIdx === -1) {
      return NextResponse.json(
        {
          success: false,
          error: "운송장 헤더를 찾을 수 없습니다. '운송장' 또는 '운송장번호' 헤더가 필요합니다.",
        },
        {status: 400}
      );
    }

    if (carrierIdx === -1) {
      return NextResponse.json(
        {
          success: false,
          error: "택배사 헤더를 찾을 수 없습니다. '택배사' 헤더가 필요합니다.",
        },
        {status: 400}
      );
    }

    // 데이터 행 파싱 및 검증
    const deliveryUpdates = [];
    const errors = [];

    for (let i = 1; i < raw.length; i++) {
      const row = raw[i];
      if (!row || row.length === 0) continue;

      const orderNumber = String(row[orderNumberIdx] || "").trim();
      const trackingNumber = String(row[trackingNumberIdx] || "").trim();
      const carrier = normalizeCarrierName(String(row[carrierIdx] || "").trim());

      // 필수 값 검증
      if (!orderNumber) {
        errors.push({
          row: i + 1,
          error: "주문번호가 비어있습니다.",
        });
        continue;
      }

      if (!trackingNumber) {
        errors.push({
          row: i + 1,
          error: "운송장번호가 비어있습니다.",
        });
        continue;
      }

      if (!carrier) {
        errors.push({
          row: i + 1,
          error: "택배사가 비어있습니다.",
        });
        continue;
      }

      deliveryUpdates.push({
        orderNumber,
        trackingNumber,
        carrier,
        rowNumber: i + 1,
      });
    }

    if (deliveryUpdates.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "처리할 유효한 데이터가 없습니다.",
          errors,
        },
        {status: 400}
      );
    }

    // 트랜잭션 시작
    await sql`BEGIN`;

    try {
      let successCount = 0;
      let failCount = 0;
      const results = [];

      // 각 운송장 업데이트 처리 (실시간 효과를 위해 하나씩 처리)
      for (let i = 0; i < deliveryUpdates.length; i++) {
        const update = deliveryUpdates[i];

        try {
          // 주문번호로 해당 데이터 찾기
          const existingOrder = await sql`
            SELECT id, row_data FROM upload_rows
            WHERE row_data->>'주문번호' = ${update.orderNumber}
            ORDER BY id DESC
            LIMIT 1
          `;

          if (existingOrder.length === 0) {
            results.push({
              orderNumber: update.orderNumber,
              success: false,
              error: "주문번호를 찾을 수 없습니다.",
              rowNumber: update.rowNumber,
            });
            failCount++;
            continue;
          }

          const orderId = existingOrder[0].id;
          const currentData = existingOrder[0].row_data;

          // 운송장 정보 업데이트
          const updatedData = {
            ...currentData,
            택배사: update.carrier,
            운송장번호: update.trackingNumber,
            주문상태: "배송중", // 운송장 입력 시 배송중으로 상태 변경
          };

          await sql`
            UPDATE upload_rows
            SET row_data = ${JSON.stringify(updatedData)}
            WHERE id = ${orderId}
          `;

          results.push({
            orderNumber: update.orderNumber,
            success: true,
            carrier: update.carrier,
            trackingNumber: update.trackingNumber,
            rowNumber: update.rowNumber,
          });
          successCount++;

        } catch (error: any) {
          results.push({
            orderNumber: update.orderNumber,
            success: false,
            error: error.message || "업데이트 중 오류가 발생했습니다.",
            rowNumber: update.rowNumber,
          });
          failCount++;
        }

        // 각 처리 사이에 약간의 지연을 주어 실시간 효과를 줌 (클라이언트에서 처리)
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      await sql`COMMIT`;

      return NextResponse.json({
        success: true,
        message: `총 ${deliveryUpdates.length}건 중 ${successCount}건 성공, ${failCount}건 실패`,
        totalCount: deliveryUpdates.length,
        successCount,
        failCount,
        results,
        errors: errors.length > 0 ? errors : undefined,
      });

    } catch (error) {
      await sql`ROLLBACK`;
      throw error;
    }

  } catch (error: any) {
    console.error("운송장 업로드 처리 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
