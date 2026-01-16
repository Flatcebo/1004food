import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";
import * as XLSX from "xlsx";

// 한국 시간(KST, UTC+9)을 반환하는 함수
function getKoreaTime(): Date {
  const now = new Date();
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
  const koreaTime = new Date(utcTime + 9 * 3600000);
  return koreaTime;
}

// 필수 헤더 매칭 정의 (기본 한글 헤더만 사용)
const REQUIRED_HEADERS = {
  category: ["카테고리"],
  bill_type: ["세금구분"],
  name: ["상품명"], // 상품명은 name과 sabang_name에 동일하게 저장
  code: ["품번코드"],
  purchase: ["매입처"],
  product_type: ["상품구분"],
  sale_price: ["판매가"],
  price: ["원가"],
  post_fee: ["배송비"],
};

// 헤더를 찾아서 인덱스 반환 (완전 일치만)
function findHeaderIndex(headers: string[], possibleNames: string[]): number | null {
  for (let i = 0; i < headers.length; i++) {
    const header = String(headers[i]).trim();

    for (const name of possibleNames) {
      // 공백 제거 후 완전 일치 비교 (대소문자 구분 없음)
      const normalizedHeader = header.replace(/\s+/g, "");
      const normalizedName = name.replace(/\s+/g, "");

      // 완전 일치하는 경우만 (원가2는 원가와 매칭되지 않음)
      if (normalizedHeader.toLowerCase() === normalizedName.toLowerCase() && 
          normalizedHeader.length === normalizedName.length) {
        return i;
      }
    }
  }
  return null;
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
      `배치 상품 업로드 시작: ${file.name} (${(file.size / 1024 / 1024).toFixed(
        2
      )}MB)`
    );

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

    // 헤더 매칭
    const headers = raw[0] as string[];
    console.log("엑셀 헤더 목록:", headers);

    const columnMapping: {[dbColumn: string]: number} = {};

    // 필수 헤더들 매칭 확인
    for (const [dbColumn, possibleNames] of Object.entries(REQUIRED_HEADERS)) {
      console.log(`헤더 찾기: ${dbColumn} -> ${possibleNames.join(", ")}`);
      const index = findHeaderIndex(headers, possibleNames);
      if (index !== null) {
        columnMapping[dbColumn] = index;
        console.log(`✓ 매칭 성공: ${dbColumn} -> "${headers[index]}" (인덱스: ${index})`);
      } else {
        console.log(`✗ 매칭 실패: ${dbColumn} -> 가능한 이름들: ${possibleNames.join(", ")}`);
        // 원가 헤더 매칭 실패 시 디버깅 정보 출력
        if (dbColumn === "price") {
          console.log(`  원가 헤더 디버깅:`, {
            headers: headers,
            원가헤더들: headers.filter(h => String(h).includes("원가")),
            원가2헤더들: headers.filter(h => String(h).includes("원가2")),
          });
        }
      }
    }

    console.log("최종 매칭 결과:", columnMapping);

    // 필수 칼럼 확인 (price는 선택사항이므로 제외)
    const requiredFields = Object.keys(REQUIRED_HEADERS).filter(field => field !== "price");
    const missingFields = requiredFields.filter(field => columnMapping[field] === undefined);

    if (missingFields.length > 0) {
      // 사용자에게 어떤 헤더를 찾아야 하는지 명확히 표시
      const missingHeaderInfo = missingFields.map(field => {
        const possibleHeaders = REQUIRED_HEADERS[field as keyof typeof REQUIRED_HEADERS];
        return `${field} (가능한 헤더: ${possibleHeaders.join(", ")})`;
      });

      return NextResponse.json(
        {
          success: false,
          error: `필수 헤더를 찾을 수 없습니다. 다음 중 하나를 포함해야 합니다:\n${missingHeaderInfo.join("\n")}`,
          foundHeaders: headers,
          missingFields,
          requiredHeaders: REQUIRED_HEADERS,
        },
        {status: 400}
      );
    }

    // 데이터 행 파싱
    const products = [];
    const totalRows = raw.length - 1; // 헤더 제외

    for (let i = 1; i < raw.length; i++) {
      const row = raw[i];
      if (!row || row.length === 0) continue;

      const product: any = {};

      // 각 필드 매핑
      console.log(`행 ${i} 데이터 파싱 시작:`, row);
      console.log(`현재 columnMapping:`, columnMapping);
      for (const [dbColumn, index] of Object.entries(columnMapping)) {
        const value = row[index];
        console.log(`  ${dbColumn} (인덱스 ${index}): "${value}" (타입: ${typeof value})`);
        
        // 숫자 타입 필드 처리 (price, sale_price, post_fee는 0도 유효한 값)
        if (["sale_price", "price", "post_fee"].includes(dbColumn)) {
          // 값이 있으면 숫자로 변환 (0도 유효한 값)
          if (value !== undefined && value !== null) {
            let numValue: number | null = null;
            
            // 이미 숫자 타입인 경우
            if (typeof value === "number") {
              if (isFinite(value) && !isNaN(value)) {
                numValue = value;
              }
            } else {
              // 문자열인 경우 처리
              const trimmedValue = String(value).trim();
              
              // 빈 문자열이 아니고, "-", "N/A"가 아닌 경우에만 처리
              if (trimmedValue !== "" && trimmedValue !== "-" && trimmedValue !== "N/A" && trimmedValue.toLowerCase() !== "null") {
                // 쉼표 제거 (예: "1,234" -> "1234")
                const cleanedValue = trimmedValue.replace(/,/g, "");
                
                // 숫자로 변환 시도
                const parsed = parseFloat(cleanedValue);
                if (!isNaN(parsed) && isFinite(parsed)) {
                  numValue = parsed;
                } else {
                  console.log(`    -> ${dbColumn} 숫자 변환 실패: "${trimmedValue}" (원본: ${value}, 타입: ${typeof value})`);
                }
              } else {
                console.log(`    -> ${dbColumn} 값이 비어있거나 유효하지 않음: "${trimmedValue}" (원본: ${value})`);
              }
            }
            
            // 숫자 값이 성공적으로 변환된 경우에만 저장
            if (numValue !== null) {
              product[dbColumn] = numValue;
              console.log(`    -> ${dbColumn} 저장됨: ${numValue} (원본: ${value}, 타입: ${typeof value})`);
            }
          } else {
            console.log(`    -> ${dbColumn} 값이 undefined 또는 null (인덱스 ${index}, row 길이: ${row.length})`);
            // price는 필수는 아니지만, 값이 없으면 null로 명시적으로 설정하지 않음 (undefined 상태 유지)
          }
        } else {
          // 문자열 필드는 빈 값 제외
          if (value !== undefined && value !== null && value !== "") {
            product[dbColumn] = String(value).trim();
          }
        }
      }
      console.log(`행 ${i} 파싱 결과:`, product);

      // 상품구분에 따라 type 설정
      if (product.product_type) {
        const productTypeValue = String(product.product_type).trim();
        if (productTypeValue === "위탁") {
          product.type = "외주";
        } else {
          // 사입, 제조 등 다른 경우는 내주
          product.type = "내주";
        }
      }

      // 상품명은 name과 sabang_name에 동일하게 저장
      if (product.name) {
        product.sabang_name = product.name;
      }

      // 필수 필드 확인 (name, code는 필수)
      if (product.name && product.code) {
        // code에서 하이픈 이후 제거
        product.code = String(product.code).trim().split("-")[0].trim();
        // post_type이 없으면 빈 문자열로 설정 (NULL 방지)
        product.post_type = product.post_type || "";
        products.push(product);
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

    // UNIQUE 제약조건 확인 및 업데이트 (company_id 포함)
    try {
      const constraintExists = await sql`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.table_constraints 
          WHERE table_name = 'products' 
          AND constraint_name = 'products_company_name_code_post_type_key'
          AND constraint_type = 'UNIQUE'
        )
      `;

      if (!constraintExists[0].exists) {
        // 기존 UNIQUE 제약조건 확인 및 삭제 (company_id를 포함하지 않는 제약조건)
        const constraints = await sql`
          SELECT constraint_name 
          FROM information_schema.table_constraints 
          WHERE table_name = 'products' 
          AND constraint_type = 'UNIQUE'
          AND constraint_name != 'products_pkey'
          AND constraint_name != 'products_company_name_code_post_type_key'
        `;

        for (const constraint of constraints) {
          try {
            await sql`
              ALTER TABLE products 
              DROP CONSTRAINT IF EXISTS ${sql(constraint.constraint_name)}
            `;
            console.log(`기존 제약조건 삭제: ${constraint.constraint_name}`);
          } catch (dropError: any) {
            console.log(`제약조건 삭제 실패 (무시): ${constraint.constraint_name}`, dropError.message);
          }
        }

        // 새로운 UNIQUE 제약조건 추가 (company_id 포함)
        try {
          await sql`
            ALTER TABLE products 
            ADD CONSTRAINT products_company_name_code_post_type_key 
            UNIQUE (company_id, name, code, post_type)
          `;
          console.log("새로운 제약조건 추가: products_company_name_code_post_type_key");
        } catch (addError: any) {
          console.log("제약조건 추가 실패 (계속 진행):", addError.message);
        }
      }
    } catch (error: any) {
      console.log("제약조건 확인 실패 (계속 진행):", error.message);
    }

    // 배치 크기 설정 (100건씩)
    const BATCH_SIZE = 100;
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // 배치 단위로 DB 저장
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      // 타임아웃 체크
      const elapsedTime = (Date.now() - startTime) / 1000;
      if (elapsedTime > 8) {
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

        // 배치 내의 쿼리들을 병렬로 실행
        // 중복 체크: name, code, sabang_name, post_type이 모두 일치하면 업데이트
        // 각 Promise에 개별 에러 처리를 추가하여 하나가 실패해도 다른 것들은 계속 진행되도록 함
        const insertPromises = batch.map(async (product, idx) => {
          try {
            console.log(`배치 상품 ${idx + 1}:`, product);
            const normalizedPostType = product.post_type || "";
            
            // 먼저 중복 체크: name, code, sabang_name, post_type이 모두 일치하는 상품이 있는지 확인
            const existingProduct = await sql`
              SELECT id FROM products 
              WHERE company_id = ${companyId}
                AND name = ${product.name}
                AND code = ${product.code}
                AND sabang_name = ${product.sabang_name}
                AND post_type = ${normalizedPostType}
              LIMIT 1
            `;
            
            if (existingProduct.length > 0) {
              // 중복이 있으면 업데이트 (값이 있을 때만 업데이트)
              // sale_price와 price는 0도 유효한 값이므로 undefined 체크만 하면 됨
              const updateFields: any[] = [];
              
              if (product.type !== undefined) {
                updateFields.push(sql`type = ${product.type || null}`);
              }
              if (product.category !== undefined) {
                updateFields.push(sql`category = ${product.category || null}`);
              }
              if (product.bill_type !== undefined) {
                updateFields.push(sql`bill_type = ${product.bill_type || null}`);
              }
              if (product.purchase !== undefined) {
                updateFields.push(sql`purchase = ${product.purchase || null}`);
              }
              if (product.product_type !== undefined) {
                updateFields.push(sql`product_type = ${product.product_type || null}`);
              }
              // sale_price는 0도 유효한 값이므로 undefined가 아닐 때만 업데이트
              if (product.sale_price !== undefined) {
                updateFields.push(sql`sale_price = ${product.sale_price}`);
              }
              // price는 0도 유효한 값이므로 undefined가 아닐 때만 업데이트
              if (product.price !== undefined) {
                updateFields.push(sql`price = ${product.price}`);
              }
              if (product.post_fee !== undefined) {
                updateFields.push(sql`post_fee = ${product.post_fee}`);
              }
              if (product.sabang_name !== undefined) {
                updateFields.push(sql`sabang_name = ${product.sabang_name}`);
              }
              
              // updated_at은 항상 업데이트
              updateFields.push(sql`updated_at = ${koreaTime.toISOString()}::timestamp`);
              
              if (updateFields.length > 0) {
                // sql 템플릿 리터럴을 동적으로 조합
                let updateQuery = sql`UPDATE products SET ${updateFields[0]}`;
                for (let i = 1; i < updateFields.length; i++) {
                  updateQuery = sql`${updateQuery}, ${updateFields[i]}`;
                }
                updateQuery = sql`${updateQuery} WHERE id = ${existingProduct[0].id}`;
                
                await updateQuery;
              }
              
              console.log(`✓ 상품 업데이트 성공: ${product.name} (${product.code}), sale_price: ${product.sale_price}, price: ${product.price}`);
              return {success: true, product};
            } else {
              // 중복이 없으면 INSERT (ON CONFLICT로 안전하게 처리)
              try {
                const insertResult = await sql`
                  INSERT INTO products (
                    company_id, type, name, sabang_name, code, category, bill_type, purchase,
                    product_type, sale_price, price, post_fee, post_type, created_at, updated_at
                  ) VALUES (
                    ${companyId},
                    ${product.type || null},
                    ${product.name},
                    ${product.sabang_name},
                    ${product.code},
                    ${product.category || null},
                    ${product.bill_type || null},
                    ${product.purchase || null},
                    ${product.product_type || null},
                    ${product.sale_price !== undefined ? product.sale_price : null},
                    ${product.price !== undefined && product.price !== null ? product.price : null},
                    ${product.post_fee !== undefined ? product.post_fee : null},
                    ${normalizedPostType},
                    ${koreaTime.toISOString()}::timestamp,
                    ${koreaTime.toISOString()}::timestamp
                  )
                  ON CONFLICT (company_id, name, code, post_type) DO UPDATE SET
                    type = EXCLUDED.type,
                    category = EXCLUDED.category,
                    bill_type = EXCLUDED.bill_type,
                    purchase = EXCLUDED.purchase,
                    product_type = EXCLUDED.product_type,
                    sale_price = COALESCE(EXCLUDED.sale_price, products.sale_price),
                    price = COALESCE(EXCLUDED.price, products.price),
                    post_fee = COALESCE(EXCLUDED.post_fee, products.post_fee),
                    sabang_name = EXCLUDED.sabang_name,
                    updated_at = ${koreaTime.toISOString()}::timestamp
                `;
                console.log(`✓ 상품 저장 성공: ${product.name} (${product.code})`);
                return {success: true, product};
              } catch (insertError: any) {
                // 제약조건이 company_id를 포함하지 않는 경우, 다시 중복 체크 후 업데이트
                if (insertError.code === '23505') {
                  console.log(`제약조건 충돌 감지, 재시도: ${product.name} (${product.code})`);
                  // 다른 company_id에 같은 상품이 있을 수 있으므로, 현재 company_id로 다시 확인
                  const retryCheck = await sql`
                    SELECT id FROM products 
                    WHERE company_id = ${companyId}
                      AND name = ${product.name}
                      AND code = ${product.code}
                      AND post_type = ${normalizedPostType}
                    LIMIT 1
                  `;
                  
                  if (retryCheck.length > 0) {
                    // 업데이트
                    await sql`
                      UPDATE products 
                      SET 
                        type = ${product.type || null},
                        category = ${product.category || null},
                        bill_type = ${product.bill_type || null},
                        purchase = ${product.purchase || null},
                        product_type = ${product.product_type || null},
                        sale_price = ${product.sale_price !== undefined ? product.sale_price : null},
                        price = ${product.price !== undefined && product.price !== null ? product.price : null},
                        post_fee = ${product.post_fee !== undefined ? product.post_fee : null},
                        sabang_name = ${product.sabang_name},
                        updated_at = ${koreaTime.toISOString()}::timestamp
                      WHERE id = ${retryCheck[0].id}
                    `;
                    console.log(`✓ 상품 업데이트 성공 (재시도): ${product.name} (${product.code})`);
                    return {success: true, product};
                  } else {
                    throw insertError; // 재시도 실패 시 원래 에러 throw
                  }
                } else {
                  throw insertError; // 다른 에러는 그대로 throw
                }
              }
            }
          } catch (productError: any) {
            console.error(`✗ 상품 저장 실패: ${product.name} (${product.code})`, productError);
            return {success: false, product, error: productError.message};
          }
        });

        // 모든 Promise를 실행하고 결과를 수집
        const results = await Promise.allSettled(insertPromises);
        
        // 성공/실패 개수 계산
        let batchSuccessCount = 0;
        let batchErrorCount = 0;
        
        results.forEach((result, idx) => {
          if (result.status === 'fulfilled') {
            if (result.value.success) {
              batchSuccessCount++;
            } else {
              batchErrorCount++;
              const product = result.value.product;
              errors.push(`상품 저장 실패: ${product.name} (${product.code}) - ${result.value.error}`);
            }
          } else {
            batchErrorCount++;
            const product = batch[idx];
            errors.push(`상품 저장 실패: ${product.name} (${product.code}) - ${result.reason?.message || '알 수 없는 오류'}`);
          }
        });

        successCount += batchSuccessCount;
        errorCount += batchErrorCount;
        
        const batchTime = (Date.now() - batchStartTime) / 1000;
        console.log(
          `배치 ${batchNum} 완료: ${batchSuccessCount}건 성공, ${batchErrorCount}건 실패, 총 ${successCount}/${
            products.length
          }건 처리됨 (${batchTime.toFixed(2)}초)`
        );
      } catch (batchError: any) {
        errorCount += batch.length;
        errors.push(`배치 ${batchNum} 처리 실패: ${batchError.message}`);
        console.error(`배치 ${batchNum} 처리 실패:`, batchError);
      }
    }

    // 전체 처리 시간 계산
    const totalTime = (Date.now() - startTime) / 1000;
    console.log(
      `배치 상품 업로드 완료: ${successCount}건 성공, ${errorCount}건 실패, 총 ${totalTime.toFixed(
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
          processingTime: totalTime.toFixed(1),
        },
        {status: 207}
      );
    }

    return NextResponse.json({
      success: true,
      message: `${successCount}개의 상품이 성공적으로 배치 저장되었습니다. (${totalTime.toFixed(
        1
      )}초)`,
      count: successCount,
      processingTime: totalTime.toFixed(1),
    });
  } catch (error: any) {
    console.error("배치 상품 업로드 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}