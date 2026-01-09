import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import * as XLSX from "xlsx";

// 헤더를 찾아서 인덱스 반환
function findHeaderIndex(headers: string[], possibleNames: string[]): number | null {
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const normalizedHeader = header.replace(/\s+/g, "").toLowerCase();

    for (const name of possibleNames) {
      const normalizedName = name.replace(/\s+/g, "").toLowerCase();

      if (normalizedHeader === normalizedName) {
        return i;
      }
    }
  }
  return null;
}

// 상품코드에서 -0001 제거
function normalizeProductCode(code: string): string {
  if (!code) return "";
  const trimmed = String(code).trim();
  // 맨 뒤에 -0001이 있으면 제거
  if (trimmed.endsWith("-0001")) {
    return trimmed.slice(0, -5);
  }
  return trimmed;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // supply_price 컬럼이 없으면 추가
    try {
      await sql`
        ALTER TABLE products 
        ADD COLUMN IF NOT EXISTS supply_price INTEGER
      `;
      console.log("supply_price 컬럼 확인 완료");
    } catch (columnError: any) {
      // 컬럼이 이미 있거나 다른 에러인 경우 무시
      console.log("supply_price 컬럼 확인:", columnError.message);
    }
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        {success: false, error: "파일이 제공되지 않았습니다."},
        {status: 400}
      );
    }

    // 파일 크기 제한 체크 (10MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error:
            "파일 크기가 너무 큽니다. 10MB 이하의 파일만 업로드 가능합니다.",
        },
        {status: 400}
      );
    }

    console.log(
      `공급단가 업데이트 시작: ${file.name} (${(file.size / 1024 / 1024).toFixed(
        2
      )}MB)`
    );

    // 엑셀 파일 읽기
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    
    let workbook;
    try {
      workbook = XLSX.read(data, {
        type: "array",
        cellStyles: false, // 셀 스타일 무시
        cellDates: false, // 날짜 셀 무시
        cellNF: false, // 숫자 포맷 무시
        cellText: false, // 텍스트 무시
        raw: true, // 원시 값 사용 (서식 무시)
        dense: false,
      });
    } catch (readError: any) {
      // 압축 관련 에러 특별 처리
      if (
        readError.message &&
        (readError.message.includes("Bad uncompressed size") ||
          readError.message.includes("uncompressed size") ||
          readError.message.includes("ZIP") ||
          readError.message.includes("corrupt"))
      ) {
        // 경고만 출력하고 계속 진행 (파일이 읽힐 수 있음)
        console.warn("Excel 파일 압축 경고 (계속 진행):", readError.message);
        // 기본 옵션으로 재시도
        try {
          workbook = XLSX.read(data, {type: "array"});
        } catch (retryError: any) {
          return NextResponse.json(
            {
              success: false,
              error:
                "Excel 파일이 손상되었거나 비표준 형식입니다. Excel에서 파일을 열어 '다른 이름으로 저장'(Excel 통합 문서 .xlsx) 후 다시 시도해주세요.",
            },
            {status: 400}
          );
        }
      } else {
        return NextResponse.json(
          {
            success: false,
            error: `파일을 읽을 수 없습니다: ${readError.message || "알 수 없는 오류"}`,
          },
          {status: 400}
        );
      }
    }

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

    // 헤더 매칭
    const headers = raw[0] as string[];
    console.log("엑셀 헤더 목록:", headers);

    // 상품코드와 공급단가 헤더 찾기
    const productCodeIndex = findHeaderIndex(headers, ["상품코드", "품번코드", "product_code", "code"]);
    const salePriceIndex = findHeaderIndex(headers, ["공급단가", "sale_price", "판매가"]);

    if (productCodeIndex === null) {
      return NextResponse.json(
        {
          success: false,
          error: "필수 헤더 '상품코드'를 찾을 수 없습니다.",
          foundHeaders: headers,
        },
        {status: 400}
      );
    }

    if (salePriceIndex === null) {
      return NextResponse.json(
        {
          success: false,
          error: "필수 헤더 '공급단가'를 찾을 수 없습니다.",
          foundHeaders: headers,
        },
        {status: 400}
      );
    }

    console.log(`상품코드 헤더: "${headers[productCodeIndex]}" (인덱스: ${productCodeIndex})`);
    console.log(`공급단가 헤더: "${headers[salePriceIndex]}" (인덱스: ${salePriceIndex})`);

    // 1단계: 먼저 각 상품코드의 출현 횟수 카운트
    const codeCountMap = new Map<string, number>(); // code -> 출현 횟수
    
    for (let i = 1; i < raw.length; i++) {
      const row = raw[i];
      if (!row || row.length === 0) continue;

      const productCode = row[productCodeIndex];
      if (!productCode || productCode === "") continue;

      // 상품코드 정규화 (-0001 제거)
      const normalizedCode = normalizeProductCode(String(productCode));
      if (!normalizedCode) continue;

      // 출현 횟수 카운트
      codeCountMap.set(normalizedCode, (codeCountMap.get(normalizedCode) || 0) + 1);
    }

    // 2단계: 수량이 2 이상인 것들 필터링 (제외)
    const filteredCodes = new Set<string>();
    for (const [code, count] of codeCountMap.entries()) {
      if (count >= 2) {
        filteredCodes.add(code);
        console.log(`수량 2 이상 필터링: ${code} (${count}회)`);
      }
    }

    // 3단계: 필터링된 코드를 제외하고 데이터 파싱 및 중복 제거
    const priceMap = new Map<string, number>(); // code -> sale_price 매핑
    const duplicateCodes = new Set<string>(); // 중복된 코드 추적

    for (let i = 1; i < raw.length; i++) {
      const row = raw[i];
      if (!row || row.length === 0) continue;

      const productCode = row[productCodeIndex];
      const salePrice = row[salePriceIndex];

      if (!productCode || productCode === "") continue;

      // 상품코드 정규화 (-0001 제거)
      const normalizedCode = normalizeProductCode(String(productCode));

      if (!normalizedCode) continue;

      // 수량이 2 이상인 코드는 제외
      if (filteredCodes.has(normalizedCode)) {
        continue;
      }

      // 공급단가 파싱
      let priceValue: number | null = null;
      if (salePrice !== undefined && salePrice !== null && salePrice !== "") {
        const numValue = Number(salePrice);
        if (!isNaN(numValue) && numValue >= 0) {
          priceValue = numValue;
        }
      }

      // 중복 체크 (수량 2 이상 필터링 후 남은 것들 중에서)
      if (priceMap.has(normalizedCode)) {
        duplicateCodes.add(normalizedCode);
        // 중복된 경우 첫 번째 값 유지
        continue;
      }

      if (priceValue !== null) {
        priceMap.set(normalizedCode, priceValue);
      }
    }

    // 필터링 및 중복 정보
    const filteredCount = filteredCodes.size;
    const duplicateCount = duplicateCodes.size;
    
    if (filteredCount > 0) {
      console.warn(`수량 2 이상으로 필터링된 상품코드 ${filteredCount}개:`, Array.from(filteredCodes).slice(0, 10));
    }
    if (duplicateCount > 0) {
      console.warn(`중복된 상품코드 ${duplicateCount}개 발견:`, Array.from(duplicateCodes).slice(0, 10));
    }

    if (priceMap.size === 0) {
      return NextResponse.json(
        {success: false, error: "업데이트할 유효한 데이터가 없습니다."},
        {status: 400}
      );
    }

    console.log(`총 ${priceMap.size}개의 상품코드에 대한 가격 업데이트 준비 완료`);

    // 배치 크기 설정 (1000건씩)
    const BATCH_SIZE = 1000;
    const codes = Array.from(priceMap.keys());
    let updatedCount = 0;
    let matchedCount = 0;
    let notFoundCodes: string[] = [];

    // 배치 단위로 DB 업데이트
    for (let i = 0; i < codes.length; i += BATCH_SIZE) {
      const batch = codes.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      // 타임아웃 체크
      const elapsedTime = (Date.now() - startTime) / 1000;
      if (elapsedTime > 25) {
        console.warn(
          `타임아웃 위험: ${elapsedTime.toFixed(1)}초 경과, ${updatedCount}/${
            codes.length
          }건 처리됨`
        );
        return NextResponse.json(
          {
            success: false,
            error: `처리 시간이 너무 오래 걸립니다. ${updatedCount}건까지 처리되었습니다. 더 작은 파일로 나누어 업로드해주세요.`,
            processedCount: updatedCount,
            totalCount: codes.length,
            elapsedTime: elapsedTime.toFixed(1),
          },
          {status: 408}
        );
      }

      try {
        const batchStartTime = Date.now();

        // 먼저 해당 코드들이 DB에 존재하는지 확인
        const matchedProducts = await sql`
          SELECT code FROM products 
          WHERE code = ANY(${batch})
        `;

        const matchedCodesSet = new Set(matchedProducts.map((p: any) => p.code));
        const batchMatchedCount = matchedCodesSet.size;
        const batchNotFoundCodes = batch.filter(code => !matchedCodesSet.has(code));

        matchedCount += batchMatchedCount;
        notFoundCodes.push(...batchNotFoundCodes);

        if (batchMatchedCount > 0) {
          // 매칭된 코드들만 업데이트
          const matchedBatch = batch.filter(code => matchedCodesSet.has(code));
          
          // 각 코드에 대해 개별 UPDATE를 실행하되, 병렬로 처리하여 성능 최적화
          const updatePromises = matchedBatch.map(code => {
            const price = priceMap.get(code)!;
            return sql`
              UPDATE products 
              SET supply_price = ${price},
                  updated_at = NOW()
              WHERE code = ${code}
            `;
          });

          // 병렬로 실행하되, 한 번에 너무 많이 실행하지 않도록 제한 (200개씩)
          const PARALLEL_SIZE = 200;
          for (let j = 0; j < updatePromises.length; j += PARALLEL_SIZE) {
            const parallelBatch = updatePromises.slice(j, j + PARALLEL_SIZE);
            await Promise.all(parallelBatch);
          }

          updatedCount += matchedBatch.length;
        }

        const batchTime = (Date.now() - batchStartTime) / 1000;
        console.log(
          `배치 ${batchNum} 완료: ${batchMatchedCount}건 업데이트됨 (${batchTime.toFixed(2)}초)`
        );
      } catch (batchError: any) {
        console.error(`배치 ${batchNum} 처리 실패:`, batchError);
        // 에러가 발생해도 다음 배치는 계속 진행
      }
    }

    // 전체 처리 시간 계산
    const totalTime = (Date.now() - startTime) / 1000;
    console.log(
      `공급단가 업데이트 완료: ${updatedCount}건 업데이트, ${codes.length - matchedCount}건 미매칭, 총 ${totalTime.toFixed(
        1
      )}초 소요`
    );

    // 결과 메시지 구성
    let message = `${updatedCount}개의 상품 가격이 성공적으로 업데이트되었습니다.`;
    if (filteredCount > 0) {
      message += ` (수량 2 이상 필터링: ${filteredCount}개)`;
    }
    if (duplicateCount > 0) {
      message += ` (중복 제거: ${duplicateCount}개)`;
    }
    if (notFoundCodes.length > 0) {
      message += ` (DB에 없는 상품코드: ${notFoundCodes.length}개)`;
      if (notFoundCodes.length <= 10) {
        message += `: ${notFoundCodes.join(", ")}`;
      } else {
        message += `: ${notFoundCodes.slice(0, 10).join(", ")} 외 ${notFoundCodes.length - 10}개`;
      }
    }

    return NextResponse.json({
      success: true,
      message,
      updatedCount,
      totalCodes: codes.length,
      notFoundCount: notFoundCodes.length,
      filteredCount,
      duplicateCount,
      processingTime: totalTime.toFixed(1),
      notFoundCodes: notFoundCodes.slice(0, 50), // 최대 50개만 반환
      filteredCodes: Array.from(filteredCodes).slice(0, 50), // 최대 50개만 반환
    });
  } catch (error: any) {
    console.error("공급단가 업데이트 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message || "업데이트 중 오류가 발생했습니다."},
      {status: 500}
    );
  }
}
