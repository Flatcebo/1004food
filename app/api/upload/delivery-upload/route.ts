import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import * as XLSX from "xlsx";
import {normalizeCarrierName} from "@/utils/carrierMapping";
import {
  detectHeaderRowByRequiredHeaders,
  normalizeHeader,
} from "@/utils/excelHeaderDetection";
import {getCompanyIdFromRequest} from "@/lib/company";

// 한국 시간(KST, UTC+9)을 반환하는 함수
function getKoreaTime(): Date {
  const now = new Date();
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
  const koreaTime = new Date(utcTime + 9 * 3600000);
  return koreaTime;
}

export async function POST(request: NextRequest) {
  try {
    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400}
      );
    }

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

    // 헤더 행 자동 감지 (1~6행 사이에서 찾기)
    const requiredHeaders = [
      {
        name: "주문번호",
        aliases: ["주문번호", "ordernumber", "고객주문번호"],
      },
      {
        name: "운송장번호",
        aliases: [
          "운송장번호",
          "운송장",
          "송장번호",
          "송장",
          "등기번호",
          "trackingnumber",
          "tracking",
        ],
      },
      {
        name: "택배사",
        aliases: ["택배사", "carrier", "배송사", "배송업체"],
      },
    ];

    const headerRowIndex = detectHeaderRowByRequiredHeaders(
      raw,
      requiredHeaders,
      6
    );
    const headers = raw[headerRowIndex] as string[];

    console.log(
      `헤더 행 감지: ${headerRowIndex + 1}행 (인덱스: ${headerRowIndex})`
    );
    console.log("엑셀 헤더:", headers);

    // 헤더 파싱 및 필수 헤더 인덱스 찾기
    let orderNumberIdx = -1;
    let trackingNumberIdx = -1;
    let carrierIdx = -1;

    // 첫 번째 패스: 정확한 매칭 우선 (운송장번호, 주문번호 등)
    headers.forEach((header, index) => {
      const headerStr = String(header).trim();
      const normalized = normalizeHeader(headerStr);

      // 주문번호 정확한 매칭
      if (orderNumberIdx === -1) {
        if (normalized === "주문번호" || normalized === "ordernumber") {
          orderNumberIdx = index;
          console.log(
            `주문번호 헤더 발견 (정확한 매칭): "${headerStr}" (인덱스: ${index})`
          );
        }
      }

      // 운송장번호 정확한 매칭 (운송장보다 우선)
      if (trackingNumberIdx === -1) {
        if (
          normalized === "운송장번호" ||
          normalized === "송장번호" ||
          normalized === "등기번호" ||
          normalized === "trackingnumber"
        ) {
          trackingNumberIdx = index;
          console.log(
            `운송장번호 헤더 발견 (정확한 매칭): "${headerStr}" (인덱스: ${index})`
          );
        }
      }

      // 택배사 정확한 매칭
      if (carrierIdx === -1) {
        if (normalized === "택배사" || normalized === "carrier") {
          carrierIdx = index;
          console.log(
            `택배사 헤더 발견 (정확한 매칭): "${headerStr}" (인덱스: ${index})`
          );
        }
      }
    });

    // 두 번째 패스: 포함 검사 (정확한 매칭이 없을 경우)
    headers.forEach((header, index) => {
      const headerStr = String(header).trim();
      const normalized = normalizeHeader(headerStr);

      // 주문번호 포함 검사
      if (orderNumberIdx === -1) {
        if (
          normalized.includes("주문번호") ||
          normalized.includes("ordernumber")
        ) {
          orderNumberIdx = index;
          console.log(
            `주문번호 헤더 발견 (포함 검사): "${headerStr}" (인덱스: ${index})`
          );
        }
      }

      // 운송장 포함 검사 (운송장번호가 없을 때만)
      if (trackingNumberIdx === -1) {
        if (
          normalized.includes("운송장") ||
          normalized.includes("송장번호") ||
          normalized.includes("송장") ||
          normalized.includes("등기번호") ||
          normalized.includes("등기") ||
          normalized.includes("trackingnumber") ||
          normalized.includes("tracking")
        ) {
          trackingNumberIdx = index;
          console.log(
            `운송장 헤더 발견 (포함 검사): "${headerStr}" (인덱스: ${index})`
          );
        }
      }

      // 택배사 포함 검사
      if (carrierIdx === -1) {
        if (
          normalized.includes("배송사") ||
          normalized.includes("배송업체") ||
          normalized.includes("carrier")
        ) {
          carrierIdx = index;
          console.log(
            `택배사 헤더 발견 (포함 검사): "${headerStr}" (인덱스: ${index})`
          );
        }
      }
    });

    // 필수 헤더 검증
    if (orderNumberIdx === -1) {
      return NextResponse.json(
        {
          success: false,
          error: `주문번호 헤더를 찾을 수 없습니다. '주문번호' 헤더가 필요합니다.\n발견된 헤더: ${headers.join(
            ", "
          )}`,
          foundHeaders: headers,
          missingHeaders: ["주문번호"],
        },
        {status: 400}
      );
    }

    if (trackingNumberIdx === -1) {
      return NextResponse.json(
        {
          success: false,
          error: `운송장 헤더를 찾을 수 없습니다. '운송장', '운송장번호', 또는 '등기번호' 헤더가 필요합니다.\n발견된 헤더: ${headers.join(
            ", "
          )}`,
          foundHeaders: headers,
          missingHeaders: ["운송장", "운송장번호", "등기번호"],
        },
        {status: 400}
      );
    }

    if (carrierIdx === -1) {
      return NextResponse.json(
        {
          success: false,
          error: `택배사 헤더를 찾을 수 없습니다. '택배사' 헤더가 필요합니다.\n발견된 헤더: ${headers.join(
            ", "
          )}`,
          foundHeaders: headers,
          missingHeaders: ["택배사"],
        },
        {status: 400}
      );
    }

    console.log("헤더 매핑 완료:", {
      주문번호: headers[orderNumberIdx],
      운송장: headers[trackingNumberIdx],
      택배사: headers[carrierIdx],
    });

    // 데이터 행 파싱 및 검증
    const deliveryUpdates = [];
    const errors = [];

    // 헤더 행 다음부터 데이터로 사용
    const dataStartIndex = headerRowIndex + 1;

    for (let i = dataStartIndex; i < raw.length; i++) {
      const row = raw[i];
      if (!row || row.length === 0) continue;

      const orderNumber = String(row[orderNumberIdx] || "").trim();
      const trackingNumber = String(row[trackingNumberIdx] || "").trim();
      const carrier = normalizeCarrierName(
        String(row[carrierIdx] || "").trim()
      );

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

      // 모든 주문번호 추출
      const orderNumbers = deliveryUpdates.map((u) => u.orderNumber);

      // 배치 조회: 주문번호로 한 번에 조회
      let ordersByOrderNumber: any[] = [];
      if (orderNumbers.length > 0) {
        ordersByOrderNumber = await sql`
          SELECT DISTINCT ON (ur.row_data->>'주문번호') 
            ur.id, 
            ur.row_data,
            ur.row_data->>'주문번호' as order_number
          FROM upload_rows ur
          INNER JOIN uploads u ON ur.upload_id = u.id
          WHERE ur.row_data->>'주문번호' = ANY(${orderNumbers})
          AND u.company_id = ${companyId}
          ORDER BY ur.row_data->>'주문번호', ur.id DESC
        `;
      }

      // 배치 조회: 내부코드로 한 번에 조회 (주문번호로 찾지 못한 항목만)
      const foundOrderNumbers = new Set(
        ordersByOrderNumber.map((o: any) => o.order_number)
      );
      const notFoundByOrderNumber = orderNumbers.filter(
        (on) => !foundOrderNumbers.has(on)
      );

      let ordersByInternalCode: any[] = [];
      if (notFoundByOrderNumber.length > 0) {
        ordersByInternalCode = await sql`
          SELECT DISTINCT ON (ur.row_data->>'내부코드') 
            ur.id, 
            ur.row_data,
            ur.row_data->>'내부코드' as internal_code
          FROM upload_rows ur
          INNER JOIN uploads u ON ur.upload_id = u.id
          WHERE ur.row_data->>'내부코드' = ANY(${notFoundByOrderNumber})
          AND u.company_id = ${companyId}
          ORDER BY ur.row_data->>'내부코드', ur.id DESC
        `;
      }

      // 조회 결과를 맵으로 변환 (빠른 조회를 위해)
      const orderMap = new Map<number, any>();
      const matchTypeMap = new Map<number, string>();

      ordersByOrderNumber.forEach((order: any) => {
        orderMap.set(order.id, order);
        matchTypeMap.set(order.id, "주문번호");
      });

      ordersByInternalCode.forEach((order: any) => {
        if (!orderMap.has(order.id)) {
          orderMap.set(order.id, order);
          matchTypeMap.set(order.id, "내부코드");
        }
      });

      // 주문번호/내부코드 -> ID 매핑 생성
      const orderNumberToIdMap = new Map<string, number>();
      const internalCodeToIdMap = new Map<string, number>();

      ordersByOrderNumber.forEach((order: any) => {
        if (order.order_number) {
          orderNumberToIdMap.set(order.order_number, order.id);
        }
      });

      ordersByInternalCode.forEach((order: any) => {
        if (order.internal_code) {
          internalCodeToIdMap.set(order.internal_code, order.id);
        }
      });

      // 업데이트할 데이터 준비
      const updatesToProcess: Array<{
        id: number;
        update: (typeof deliveryUpdates)[0];
        currentData: any;
        matchType: string;
      }> = [];

      for (const update of deliveryUpdates) {
        let orderId: number | undefined;
        let matchType = "";

        // 주문번호로 먼저 찾기
        orderId = orderNumberToIdMap.get(update.orderNumber);
        if (orderId) {
          matchType = "주문번호";
        } else {
          // 내부코드로 찾기
          orderId = internalCodeToIdMap.get(update.orderNumber);
          if (orderId) {
            matchType = "내부코드";
          }
        }

        if (!orderId) {
          results.push({
            orderNumber: update.orderNumber,
            success: false,
            error: `주문번호/내부코드를 찾을 수 없습니다. (검색값: ${update.orderNumber})`,
            rowNumber: update.rowNumber,
          });
          failCount++;
          continue;
        }

        const orderData = orderMap.get(orderId);
        if (!orderData) {
          results.push({
            orderNumber: update.orderNumber,
            success: false,
            error: `데이터를 찾을 수 없습니다. (ID: ${orderId})`,
            rowNumber: update.rowNumber,
          });
          failCount++;
          continue;
        }

        updatesToProcess.push({
          id: orderId,
          update,
          currentData: orderData.row_data,
          matchType,
        });
      }

      // 배치 업데이트 처리 (배치 크기로 나누어 처리)
      const BATCH_SIZE = 100;
      for (let i = 0; i < updatesToProcess.length; i += BATCH_SIZE) {
        const batch = updatesToProcess.slice(i, i + BATCH_SIZE);

        // 배치 내 각 항목 업데이트
        for (const {id, update, currentData, matchType} of batch) {
          try {
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
              WHERE id = ${id}
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
        }
      }

      await sql`COMMIT`;

      // 실제 처리할 항목 수 (필수 값이 모두 있는 행만 포함)
      const totalCount = deliveryUpdates.length;

      return NextResponse.json({
        success: true,
        message: `총 ${totalCount}건 중 ${successCount}건 성공, ${failCount}건 실패`,
        totalCount, // 실제 처리할 항목 수
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
