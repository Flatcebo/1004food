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

// 배송메시지에서 ★ 뒤의 숫자를 추출하는 함수
// ★ 뒤에는 무조건 숫자만 있음 (예: ★123456)
function extractOrderNumberFromDeliveryMessage(message: string): string | null {
  if (!message || typeof message !== "string") {
    return null;
  }

  const trimmedMessage = message.trim();

  // ★ 뒤에 오는 모든 숫자 추출
  // ★123456 또는 ★ 123456 같은 형식
  const pattern = /★\s*(\d+)/;
  const match = trimmedMessage.match(pattern);
  if (match && match[1]) {
    return match[1];
  }

  return null;
}

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

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        {success: false, error: "파일이 제공되지 않았습니다."},
        {status: 400},
      );
    }

    // 엑셀 파일 읽기
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, {type: "array"});

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return NextResponse.json(
        {success: false, error: "워크시트가 없습니다."},
        {status: 400},
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
        {status: 400},
      );
    }

    // 헤더 행 자동 감지 (1~6행 사이에서 찾기)
    const requiredHeaders = [
      {
        name: "주문번호",
        aliases: ["주문번호", "고객주문번호", "자체주문번호"],
      },
      {
        name: "운송장번호",
        aliases: ["운송장번호", "운송장", "송장번호", "송장", "등기번호"],
      },
      {
        name: "택배사",
        aliases: ["택배사", "배송사", "배송업체"],
      },
    ];

    const headerRowIndex = detectHeaderRowByRequiredHeaders(
      raw,
      requiredHeaders,
      9,
    );
    const headers = raw[headerRowIndex] as string[];

    // console.log(
    //   `헤더 행 감지: ${headerRowIndex + 1}행 (인덱스: ${headerRowIndex})`,
    // );
    // console.log("엑셀 헤더:", headers);

    // 헤더 파싱 및 필수 헤더 인덱스 찾기
    let orderNumberIdx = -1;
    let trackingNumberIdx = -1;
    let carrierIdx = -1;
    let deliveryMessageIdx = -1; // 배송메시지 헤더 인덱스

    // 첫 번째 패스: 정확한 매칭 우선 (운송장번호, 주문번호 등)
    headers.forEach((header, index) => {
      const headerStr = String(header).trim();
      const normalized = normalizeHeader(headerStr);

      // 배송메시지 정확한 매칭
      if (deliveryMessageIdx === -1) {
        if (
          normalized === "배송메시지" ||
          normalized === "배송메세지" ||
          normalized === "배송요청" ||
          normalized === "요청사항" ||
          normalized === "배송요청사항"
        ) {
          deliveryMessageIdx = index;
          // console.log(
          //   `배송메시지 헤더 발견 (정확한 매칭): "${headerStr}" (인덱스: ${index})`,
          // );
        }
      }

      // 주문번호 정확한 매칭
      if (orderNumberIdx === -1) {
        if (
          normalized === "주문번호" ||
          normalized === "자체주문번호" ||
          normalized === "고객주문번호"
        ) {
          orderNumberIdx = index;
          // console.log(
          //   `주문번호 헤더 발견 (정확한 매칭): "${headerStr}" (인덱스: ${index})`,
          // );
        }
      }

      // 운송장번호 정확한 매칭 (운송장보다 우선)
      if (trackingNumberIdx === -1) {
        if (
          normalized === "운송장번호" ||
          normalized === "송장번호" ||
          normalized === "등기번호"
        ) {
          trackingNumberIdx = index;
          // console.log(
          //   `운송장번호 헤더 발견 (정확한 매칭): "${headerStr}" (인덱스: ${index})`,
          // );
        }
      }

      // 택배사 정확한 매칭
      if (carrierIdx === -1) {
        if (normalized === "택배사") {
          carrierIdx = index;
          // console.log(
          //   `택배사 헤더 발견 (정확한 매칭): "${headerStr}" (인덱스: ${index})`,
          // );
        }
      }
    });

    // 두 번째 패스: 포함 검사 (정확한 매칭이 없을 경우)
    headers.forEach((header, index) => {
      const headerStr = String(header).trim();
      const normalized = normalizeHeader(headerStr);

      // 배송메시지 포함 검사
      if (deliveryMessageIdx === -1) {
        if (
          (normalized.includes("배송") && normalized.includes("메시지")) ||
          (normalized.includes("배송") && normalized.includes("메세지")) ||
          normalized.includes("배송요청") ||
          normalized.includes("요청사항")
        ) {
          deliveryMessageIdx = index;
          // console.log(
          //   `배송메시지 헤더 발견 (포함 검사): "${headerStr}" (인덱스: ${index})`,
          // );
        }
      }

      // 주문번호 포함 검사
      if (orderNumberIdx === -1) {
        if (
          normalized.includes("주문번호") ||
          normalized.includes("자체주문번호") ||
          normalized.includes("고객주문번호")
        ) {
          orderNumberIdx = index;
          // console.log(
          //   `주문번호 헤더 발견 (포함 검사): "${headerStr}" (인덱스: ${index})`,
          // );
        }
      }

      // 운송장 포함 검사 (운송장번호가 없을 때만)
      if (trackingNumberIdx === -1) {
        if (
          normalized.includes("운송장") ||
          normalized.includes("송장번호") ||
          normalized.includes("송장") ||
          normalized.includes("등기번호") ||
          normalized.includes("등기")
        ) {
          trackingNumberIdx = index;
          // console.log(
          //   `운송장 헤더 발견 (포함 검사): "${headerStr}" (인덱스: ${index})`,
          // );
        }
      }

      // 택배사 포함 검사
      if (carrierIdx === -1) {
        if (normalized.includes("배송사") || normalized.includes("배송업체")) {
          carrierIdx = index;
          // console.log(
          //   `택배사 헤더 발견 (포함 검사): "${headerStr}" (인덱스: ${index})`,
          // );
        }
      }
    });

    // 필수 헤더 검증: 배송메시지 또는 주문번호 중 하나는 필수
    if (deliveryMessageIdx === -1 && orderNumberIdx === -1) {
      return NextResponse.json(
        {
          success: false,
          error: `주문번호 또는 배송메시지 헤더를 찾을 수 없습니다. '주문번호' 또는 '배송메시지' 헤더 중 하나가 필요합니다.\n발견된 헤더: ${headers.join(
            ", ",
          )}`,
          foundHeaders: headers,
          missingHeaders: ["주문번호", "배송메시지"],
        },
        {status: 400},
      );
    }

    if (trackingNumberIdx === -1) {
      return NextResponse.json(
        {
          success: false,
          error: `운송장 헤더를 찾을 수 없습니다. '운송장', '운송장번호', 또는 '등기번호' 헤더가 필요합니다.\n발견된 헤더: ${headers.join(
            ", ",
          )}`,
          foundHeaders: headers,
          missingHeaders: ["운송장", "운송장번호", "등기번호"],
        },
        {status: 400},
      );
    }

    if (carrierIdx === -1) {
      return NextResponse.json(
        {
          success: false,
          error: `택배사 헤더를 찾을 수 없습니다. '택배사' 헤더가 필요합니다.\n발견된 헤더: ${headers.join(
            ", ",
          )}`,
          foundHeaders: headers,
          missingHeaders: ["택배사"],
        },
        {status: 400},
      );
    }

    // console.log("헤더 매핑 완료:", {
    //   배송메시지:
    //     deliveryMessageIdx !== -1 ? headers[deliveryMessageIdx] : "없음",
    //   주문번호: orderNumberIdx !== -1 ? headers[orderNumberIdx] : "없음",
    //   운송장: headers[trackingNumberIdx],
    //   택배사: headers[carrierIdx],
    // });

    // 데이터 행 파싱 및 검증
    const deliveryUpdates = [];
    const errors = [];

    // 헤더 행 다음부터 데이터로 사용
    const dataStartIndex = headerRowIndex + 1;

    for (let i = dataStartIndex; i < raw.length; i++) {
      const row = raw[i];
      if (!row || row.length === 0) continue;

      // 1순위: 배송메시지에서 ★주문번호 또는 ★내부코드 추출
      let orderNumber = "";
      if (deliveryMessageIdx !== -1) {
        const deliveryMessage = String(row[deliveryMessageIdx] || "").trim();
        const extractedNumber =
          extractOrderNumberFromDeliveryMessage(deliveryMessage);
        if (extractedNumber) {
          orderNumber = extractedNumber;
          // console.log(
          //   `행 ${i + 1}: 배송메시지에서 주문번호 추출: "${extractedNumber}" (원본: "${deliveryMessage}")`,
          // );
        }
      }

      // 2순위: 주문번호 헤더에서 읽기 (배송메시지에서 추출하지 못한 경우)
      if (!orderNumber && orderNumberIdx !== -1) {
        orderNumber = String(row[orderNumberIdx] || "").trim();
      }

      const trackingNumber = String(row[trackingNumberIdx] || "").trim();
      const carrier = normalizeCarrierName(
        String(row[carrierIdx] || "").trim(),
      );

      // 필수 값 검증
      if (!orderNumber) {
        errors.push({
          row: i + 1,
          error:
            "주문번호를 찾을 수 없습니다. (배송메시지 또는 주문번호 헤더에서)",
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
        {status: 400},
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

      // 배치 조회: 주문번호로 한 번에 조회 (같은 주문번호를 가진 모든 주문 조회)
      let ordersByOrderNumber: any[] = [];
      if (orderNumbers.length > 0) {
        ordersByOrderNumber = await sql`
          SELECT 
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

      // 배치 조회: 내부코드로 한 번에 조회 (주문번호로 찾지 못한 항목만, 같은 내부코드를 가진 모든 주문 조회)
      const foundOrderNumbers = new Set(
        ordersByOrderNumber.map((o: any) => o.order_number),
      );
      const notFoundByOrderNumber = orderNumbers.filter(
        (on) => !foundOrderNumbers.has(on),
      );

      let ordersByInternalCode: any[] = [];
      if (notFoundByOrderNumber.length > 0) {
        ordersByInternalCode = await sql`
          SELECT 
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

      // 주문번호/내부코드 -> ID 배열 매핑 생성 (같은 내부코드를 가진 모든 주문 ID 수집)
      const orderNumberToIdsMap = new Map<string, number[]>();
      const internalCodeToIdsMap = new Map<string, number[]>();

      ordersByOrderNumber.forEach((order: any) => {
        if (order.order_number) {
          if (!orderNumberToIdsMap.has(order.order_number)) {
            orderNumberToIdsMap.set(order.order_number, []);
          }
          orderNumberToIdsMap.get(order.order_number)!.push(order.id);
        }
      });

      ordersByInternalCode.forEach((order: any) => {
        if (order.internal_code) {
          if (!internalCodeToIdsMap.has(order.internal_code)) {
            internalCodeToIdsMap.set(order.internal_code, []);
          }
          internalCodeToIdsMap.get(order.internal_code)!.push(order.id);
        }
      });

      // 같은 내부코드/주문번호를 가진 운송장들을 그룹화
      const trackingNumbersByOrderNumber = new Map<string, Set<string>>();
      const carriersByOrderNumber = new Map<string, string>();

      for (const update of deliveryUpdates) {
        if (!trackingNumbersByOrderNumber.has(update.orderNumber)) {
          trackingNumbersByOrderNumber.set(update.orderNumber, new Set());
        }
        trackingNumbersByOrderNumber
          .get(update.orderNumber)!
          .add(update.trackingNumber);
        // 택배사는 첫 번째 것으로 설정 (같은 주문번호면 같은 택배사일 것으로 가정)
        if (!carriersByOrderNumber.has(update.orderNumber)) {
          carriersByOrderNumber.set(update.orderNumber, update.carrier);
        }
      }

      // 업데이트할 데이터 준비
      const updatesToProcess: Array<{
        ids: number[];
        orderNumber: string;
        trackingNumbers: string[];
        carrier: string;
        matchType: string;
      }> = [];

      for (const update of deliveryUpdates) {
        let orderIds: number[] = [];
        let matchType = "";

        // 주문번호로 먼저 찾기
        orderIds = orderNumberToIdsMap.get(update.orderNumber) || [];
        if (orderIds.length > 0) {
          matchType = "주문번호";
        } else {
          // 내부코드로 찾기
          orderIds = internalCodeToIdsMap.get(update.orderNumber) || [];
          if (orderIds.length > 0) {
            matchType = "내부코드";
          }
        }

        if (orderIds.length === 0) {
          results.push({
            orderNumber: update.orderNumber,
            success: false,
            error: `주문번호/내부코드를 찾을 수 없습니다. (검색값: ${update.orderNumber})`,
            rowNumber: update.rowNumber,
          });
          failCount++;
          continue;
        }

        // 같은 주문번호/내부코드를 가진 모든 운송장 번호 수집
        const trackingNumbers = Array.from(
          trackingNumbersByOrderNumber.get(update.orderNumber) || [],
        );
        const carrier =
          carriersByOrderNumber.get(update.orderNumber) || update.carrier;

        // 이미 처리된 주문번호는 스킵 (중복 방지)
        const alreadyProcessed = updatesToProcess.some(
          (u) => u.orderNumber === update.orderNumber,
        );
        if (!alreadyProcessed) {
          updatesToProcess.push({
            ids: orderIds,
            orderNumber: update.orderNumber,
            trackingNumbers,
            carrier,
            matchType,
          });
        }
      }

      // 배치 업데이트 처리 (배치 크기로 나누어 처리)
      const BATCH_SIZE = 100;
      for (let i = 0; i < updatesToProcess.length; i += BATCH_SIZE) {
        const batch = updatesToProcess.slice(i, i + BATCH_SIZE);

        // 배치 내 각 항목 업데이트
        for (const {
          ids,
          orderNumber,
          trackingNumbers,
          carrier,
          matchType,
        } of batch) {
          try {
            // 운송장 번호들을 쉼표로 구분하여 합치기
            const combinedTrackingNumber = trackingNumbers.join(", ");

            // 같은 내부코드/주문번호를 가진 모든 주문 업데이트
            for (const id of ids) {
              const orderData = orderMap.get(id);
              if (!orderData) {
                results.push({
                  orderNumber,
                  success: false,
                  error: `데이터를 찾을 수 없습니다. (ID: ${id})`,
                  rowNumber: 0,
                });
                failCount++;
                continue;
              }

              // 운송장 정보 업데이트
              const updatedData = {
                ...orderData.row_data,
                택배사: carrier,
                운송장번호: combinedTrackingNumber,
                주문상태: "배송중", // 운송장 입력 시 배송중으로 상태 변경
              };

              await sql`
                UPDATE upload_rows
                SET row_data = ${JSON.stringify(updatedData)}
                WHERE id = ${id}
              `;
            }

            results.push({
              orderNumber,
              success: true,
              carrier,
              trackingNumber: combinedTrackingNumber,
              rowNumber: 0,
            });
            successCount += ids.length;
          } catch (error: any) {
            results.push({
              orderNumber,
              success: false,
              error: error.message || "업데이트 중 오류가 발생했습니다.",
              rowNumber: 0,
            });
            failCount += ids.length;
          }
        }
      }

      await sql`COMMIT`;

      // 실제 처리할 항목 수 (필수 값이 모두 있는 행만 포함)
      const totalCount = deliveryUpdates.length;

      // 중복 수량 계산: 파일 내에서 같은 운송장 번호의 총합
      // 예: 00000 운송장이 5개면 5, 2개면 2, 1개면 0
      const trackingNumberCounts = new Map<string, number>();
      deliveryUpdates.forEach((update) => {
        const trackingNumber = update.trackingNumber.trim();
        if (trackingNumber) {
          trackingNumberCounts.set(
            trackingNumber,
            (trackingNumberCounts.get(trackingNumber) || 0) + 1,
          );
        }
      });

      // 2개 이상인 운송장들의 총합 계산
      let duplicateCount = 0;
      trackingNumberCounts.forEach((count) => {
        if (count >= 2) {
          duplicateCount += count;
        }
      });

      return NextResponse.json({
        success: true,
        message: `총 ${totalCount}건 중 ${successCount}건 성공, ${failCount}건 실패`,
        totalCount, // 실제 처리할 항목 수
        successCount,
        failCount,
        duplicateCount, // 중복 수량
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
      {status: 500},
    );
  }
}
