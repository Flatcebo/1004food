import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import * as XLSX from "xlsx";
import {mapExcelHeaderToDbColumn} from "@/constants/productColumnMappings";
import {getCompanyIdFromRequest} from "@/lib/company";

// 한국 시간(KST, UTC+9)을 반환하는 함수
function getKoreaTime(): Date {
  const now = new Date();
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
  const koreaTime = new Date(utcTime + 9 * 3600000);
  return koreaTime;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

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
      `엑셀 파일 처리 시작: ${file.name} (${(file.size / 1024 / 1024).toFixed(
        2
      )}MB)`
    );

    // 엑셀 파일 읽기 (메모리 효율적으로)
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

    // 헤더 매칭
    const headers = raw[0] as string[];
    const columnMapping: {[dbColumn: string]: number} = {};

    headers.forEach((header, index) => {
      const headerStr = String(header).trim();
      const normalized = headerStr.replace(/\s+/g, "").toLowerCase();

      // "상품명(확정)" 같은 헤더는 name과 sabangName 둘 다에 매칭
      if (normalized === "상품명(확정)" || normalized === "상품명(수집)") {
        columnMapping["name"] = index;
        columnMapping["sabangName"] = index;
      } else {
        const dbColumn = mapExcelHeaderToDbColumn(headerStr);
        if (dbColumn) {
          columnMapping[dbColumn] = index;
        }
      }
    });

    // 필수 칼럼 확인 (name과 code는 필수)
    if (
      columnMapping["name"] === undefined ||
      columnMapping["code"] === undefined
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "필수 칼럼이 없습니다. '상품명'과 '매핑코드' 칼럼은 필수입니다.",
          foundColumns: Object.keys(columnMapping),
        },
        {status: 400}
      );
    }

    // 데이터 행 파싱 (메모리 효율적으로 처리)
    const products = [];
    const totalRows = raw.length - 1; // 헤더 제외

    // 1000행 이상인 경우 청크 단위로 처리
    const CHUNK_SIZE = 1000;
    const chunks = [];
    for (let i = 1; i < raw.length; i += CHUNK_SIZE) {
      chunks.push(raw.slice(i, i + CHUNK_SIZE));
    }

    for (const chunk of chunks) {
      for (const row of chunk) {
        if (!row || row.length === 0) continue;

        const name = row[columnMapping["name"]];
        const code = row[columnMapping["code"]];

        // name과 code가 비어있는 행은 스킵
        if (!name || !code) continue;

        // 매핑코드에서 하이픈(-) 이후의 문자 제거 (예: "PROD-0001" → "PROD")
        const cleanedCode = String(code).trim().split("-")[0].trim();

        const product: any = {
          name: String(name).trim(),
          code: cleanedCode,
        };

        // 나머지 칼럼들 매핑
        Object.keys(columnMapping).forEach((dbColumn) => {
          if (dbColumn !== "name" && dbColumn !== "code") {
            const value = row[columnMapping[dbColumn]];
            if (value !== undefined && value !== null && value !== "") {
              // 숫자 타입 칼럼 처리
              if (["price", "salePrice", "postFee"].includes(dbColumn)) {
                const numValue = Number(value);
                if (!isNaN(numValue)) {
                  product[dbColumn] = numValue;
                }
              } else {
                product[dbColumn] = String(value).trim();
              }
            }
          }
        });

        // 매입처명에 따라 내외주 자동 설정
        if (product.purchase) {
          const purchaseValue = String(product.purchase).trim();
          if (purchaseValue === "천사-제조" || purchaseValue === "천사-사입") {
            product.type = "내주";
          } else {
            product.type = "외주";
          }
        }

        products.push(product);
      }

      // 청크 처리 후 잠시 메모리 정리
      if (chunks.length > 1) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    if (products.length === 0) {
      return NextResponse.json(
        {success: false, error: "저장할 유효한 데이터가 없습니다."},
        {status: 400}
      );
    }

    // 한국 시간 생성
    const koreaTime = getKoreaTime();

    // 배치 크기 설정 (더 큰 배치로 성능 향상)
    const BATCH_SIZE = 100;
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // 배치 단위로 DB 저장
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      // 타임아웃 체크 (Vercel 10초 제한 대비)
      const elapsedTime = (Date.now() - startTime) / 1000;
      if (elapsedTime > 8) {
        // 8초 이상 경과시 중단
        console.warn(
          `타임아웃 위험: ${elapsedTime.toFixed(1)}초 경과, ${successCount}/${
            products.length
          }건 처리됨`
        );
        return NextResponse.json(
          {
            success: false,
            error: `처리 시간이 너무 오래 걸립니다. ${successCount}건까지 처리되었습니다. 더 작은 파일로 나누어 업로드해주세요.`,
            processedCount: successCount,
            totalCount: products.length,
            elapsedTime: elapsedTime.toFixed(1),
          },
          {status: 408}
        );
      }

      try {
        const batchStartTime = Date.now();

        // neon에서는 트랜잭션 대신 Promise.all로 배치 처리
        const insertPromises = batch.map((product) => {
          // 택배사가 null이면 빈 문자열로 변환 (NULL은 UNIQUE 제약조건에서 서로 다른 값으로 취급되므로)
          const normalizedPostType = product.postType || "";
          
          return sql`
            INSERT INTO products (
              company_id, type, post_type, name, code, pkg, price, sale_price, post_fee,
              purchase, bill_type, category, product_type, sabang_name, etc,
              created_at, updated_at
            ) VALUES (
              ${companyId},
              ${product.type || null},
              ${normalizedPostType},
              ${product.name},
              ${product.code},
              ${product.pkg || null},
              ${product.price !== undefined ? product.price : null},
              ${product.salePrice !== undefined ? product.salePrice : null},
              ${product.postFee !== undefined ? product.postFee : null},
              ${product.purchase || null},
              ${product.billType || null},
              ${product.category || null},
              ${product.productType || null},
              ${product.sabangName || null},
              ${product.etc || null},
              ${koreaTime.toISOString()}::timestamp,
              ${koreaTime.toISOString()}::timestamp
            )
            ON CONFLICT (company_id, name, code, post_type) DO UPDATE SET
              type = EXCLUDED.type,
              post_type = COALESCE(EXCLUDED.post_type, ''),
              pkg = EXCLUDED.pkg,
              price = EXCLUDED.price,
              sale_price = EXCLUDED.sale_price,
              post_fee = EXCLUDED.post_fee,
              purchase = EXCLUDED.purchase,
              bill_type = EXCLUDED.bill_type,
              category = EXCLUDED.category,
              product_type = EXCLUDED.product_type,
              sabang_name = EXCLUDED.sabang_name,
              etc = EXCLUDED.etc,
              updated_at = ${koreaTime.toISOString()}::timestamp
          `;
        });

        // 배치 내의 쿼리들을 병렬로 실행 (더 빠름)
        await Promise.all(insertPromises);

        successCount += batch.length;
        const batchTime = (Date.now() - batchStartTime) / 1000;
        console.log(
          `배치 ${batchNum} 완료: ${successCount}/${
            products.length
          }건 처리됨 (${batchTime.toFixed(2)}초)`
        );
      } catch (batchError: any) {
        errorCount += batch.length;
        errors.push(`배치 ${batchNum} 실패: ${batchError.message}`);
        console.error(`배치 ${batchNum} 처리 실패:`, batchError);
      }
    }

    // 전체 처리 시간 계산
    const totalTime = (Date.now() - startTime) / 1000;
    console.log(
      `상품 데이터 업로드 완료: ${successCount}건 성공, ${errorCount}건 실패, 총 ${totalTime.toFixed(
        1
      )}초 소요`
    );

    // 결과 요약
    const totalProcessed = successCount + errorCount;

    if (errorCount > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `일부 상품 저장 실패: ${successCount}건 성공, ${errorCount}건 실패 (${totalTime.toFixed(
            1
          )}초)`,
          successCount,
          errorCount,
          errors,
          foundColumns: Object.keys(columnMapping),
          processingTime: totalTime.toFixed(1),
        },
        {status: 207}
      ); // 207 Multi-Status
    }

    return NextResponse.json({
      success: true,
      message: `${successCount}개의 상품이 성공적으로 저장되었습니다. (${totalTime.toFixed(
        1
      )}초)`,
      count: successCount,
      foundColumns: Object.keys(columnMapping),
      processingTime: totalTime.toFixed(1),
    });
  } catch (error: any) {
    console.error("엑셀 파일 처리 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
