import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import * as XLSX from "xlsx";
import {getCompanyIdFromRequest} from "@/lib/company";

// 한국 시간(KST, UTC+9)을 반환하는 함수
function getKoreaTime(): Date {
  const now = new Date();
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
  const koreaTime = new Date(utcTime + 9 * 3600000);
  return koreaTime;
}

// 다음 코드 생성 (shop0001, shop0002, ...)
async function getNextMallCode(startNumber?: number): Promise<string> {
  try {
    if (startNumber !== undefined) {
      return `shop${String(startNumber).padStart(4, "0")}`;
    }

    // 현재 가장 큰 코드 번호 찾기
    const result = await sql`
      SELECT code 
      FROM mall 
      WHERE code LIKE 'shop%' 
      ORDER BY CAST(SUBSTRING(code FROM 5) AS INTEGER) DESC 
      LIMIT 1
    `;

    if (result.length === 0) {
      return "shop0001";
    }

    const lastCode = result[0].code;
    const match = lastCode.match(/shop(\d+)/);
    
    if (match) {
      const lastNumber = parseInt(match[1], 10);
      const nextNumber = lastNumber + 1;
      return `shop${String(nextNumber).padStart(4, "0")}`;
    }

    return "shop0001";
  } catch (error) {
    console.error("코드 생성 실패:", error);
    return "shop0001";
  }
}

// 시작 코드 번호 가져오기
async function getStartCodeNumber(): Promise<number> {
  try {
    const result = await sql`
      SELECT code 
      FROM mall 
      WHERE code LIKE 'shop%' 
      ORDER BY CAST(SUBSTRING(code FROM 5) AS INTEGER) DESC 
      LIMIT 1
    `;

    if (result.length === 0) {
      return 1;
    }

    const lastCode = result[0].code;
    const match = lastCode.match(/shop(\d+)/);
    
    if (match) {
      return parseInt(match[1], 10) + 1;
    }

    return 1;
  } catch (error) {
    console.error("시작 코드 번호 조회 실패:", error);
    return 1;
  }
}

// 헤더 매핑 함수 (더 강력한 매칭)
function mapHeaderToColumn(header: string): string | null {
  if (!header) return null;
  
  const headerStr = String(header).trim();
  if (!headerStr) return null;
  
  // 직접 매핑 테이블 (정확한 매칭 우선)
  const directMapping: {[key: string]: string} = {
    "쇼핑몰명": "name",
    "법인명": "company_name",
    "대표자명": "representative_name",
    "사업자번호": "business_number",
    "마켓분류": "market_category",
    "우편번호": "postal_code",
    "주소1": "address1",
    "주소2": "address2",
    "업태": "business_type",
    "업종": "business_category",
    "등록일": "registration_date",
  };

  // 정확한 매칭 먼저 시도
  if (directMapping[headerStr]) {
    return directMapping[headerStr];
  }

  // 공백 제거 후 매칭
  const noSpace = headerStr.replace(/\s+/g, "");
  if (directMapping[noSpace]) {
    return directMapping[noSpace];
  }

  // 정규화된 매칭 (공백, 특수문자 제거 후 소문자 변환)
  const normalized = headerStr.replace(/[\s\-_\(\)\[\]]/g, "").toLowerCase();
  
  // 매핑 테이블 (여러 변형 포함)
  const mapping: Array<{keywords: string[], column: string}> = [
    {keywords: ["쇼핑몰명", "쇼핑몰", "mallname", "mall"], column: "name"},
    {keywords: ["법인명", "법인", "companyname", "company"], column: "company_name"},
    {keywords: ["대표자명", "대표자", "representativename", "representative", "ceo"], column: "representative_name"},
    {keywords: ["사업자번호", "사업자번호", "사업자", "businessnumber", "bizno"], column: "business_number"},
    {keywords: ["마켓분류", "마켓", "marketcategory", "market"], column: "market_category"},
    {keywords: ["우편번호", "우편", "postalcode", "postal", "zipcode", "zip"], column: "postal_code"},
    {keywords: ["주소1", "address1", "addr1"], column: "address1"},
    {keywords: ["주소2", "address2", "addr2"], column: "address2"},
    {keywords: ["업태", "businesstype"], column: "business_type"},
    {keywords: ["업종", "businesscategory", "category"], column: "business_category"},
    {keywords: ["등록일", "registrationdate", "registration", "regdate"], column: "registration_date"},
  ];

  // 정규화된 매칭 시도
  for (const {keywords, column} of mapping) {
    for (const keyword of keywords) {
      const keywordNormalized = keyword.replace(/[\s\-_\(\)\[\]]/g, "").toLowerCase();
      if (normalized === keywordNormalized) {
        return column;
      }
    }
  }

  // 부분 매칭 (헤더에 키워드가 포함되어 있는지 확인)
  for (const {keywords, column} of mapping) {
    for (const keyword of keywords) {
      const keywordNormalized = keyword.replace(/[\s\-_\(\)\[\]]/g, "").toLowerCase();
      // 헤더에 키워드가 포함되어 있으면 매칭
      if (normalized.includes(keywordNormalized) && keywordNormalized.length >= 2) {
        return column;
      }
    }
  }

  return null;
}

// mall 테이블이 존재하는지 확인하고 없으면 생성
async function ensureMallTableExists() {
  try {
    // 테이블 존재 여부 확인
    const tableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'mall'
      )
    `;

    if (!tableExists[0].exists) {
      console.log("mall 테이블이 없습니다. 생성 중...");
      
      // mall 테이블 생성
      await sql`
        CREATE TABLE IF NOT EXISTS mall (
          id SERIAL PRIMARY KEY,
          code VARCHAR(50) NOT NULL UNIQUE,
          name VARCHAR(255) NOT NULL,
          company_name VARCHAR(255),
          representative_name VARCHAR(255),
          business_number VARCHAR(50),
          market_category VARCHAR(255),
          postal_code VARCHAR(20),
          address1 VARCHAR(500),
          address2 VARCHAR(500),
          business_type VARCHAR(255),
          business_category VARCHAR(255),
          registration_date DATE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;

      // 인덱스 생성
      await sql`
        CREATE INDEX IF NOT EXISTS idx_mall_code ON mall(code)
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS idx_mall_name ON mall(name)
      `;

      console.log("mall 테이블 생성 완료");
    }
  } catch (error) {
    console.error("mall 테이블 생성 실패:", error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // 테이블이 없으면 생성
    await ensureMallTableExists();

    // company_id 추출 (필요한 경우)
    const companyId = await getCompanyIdFromRequest(request);

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
      `쇼핑몰 엑셀 파일 처리 시작: ${file.name} (${(file.size / 1024 / 1024).toFixed(
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
    const columnMapping: {[dbColumn: string]: number} = {};

    console.log("=== 엑셀 헤더 분석 시작 ===");
    console.log("원본 헤더 배열:", headers);
    console.log("헤더 개수:", headers.length);

    headers.forEach((header, index) => {
      const headerStr = String(header).trim();
      const dbColumn = mapHeaderToColumn(headerStr);
      if (dbColumn) {
        columnMapping[dbColumn] = index;
        console.log(`✅ 헤더 매핑 성공: [${index}] "${headerStr}" -> ${dbColumn}`);
      } else {
        console.log(`❌ 헤더 매핑 실패: [${index}] "${headerStr}"`);
      }
    });

    console.log("=== 매핑 결과 ===");
    console.log("매핑된 칼럼:", JSON.stringify(columnMapping, null, 2));
    console.log("매핑된 칼럼 개수:", Object.keys(columnMapping).length);

    // 필수 칼럼 확인 (쇼핑몰명은 필수)
    if (columnMapping["name"] === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: "필수 칼럼이 없습니다. '쇼핑몰명' 칼럼은 필수입니다.",
          foundColumns: Object.keys(columnMapping),
          allHeaders: headers,
        },
        {status: 400}
      );
    }

    // 데이터 행 파싱
    const malls = [];
    const totalRows = raw.length - 1; // 헤더 제외

    for (let i = 1; i < raw.length; i++) {
      const row = raw[i];
      if (!row || row.length === 0) continue;

      const name = row[columnMapping["name"]];

      // 쇼핑몰명이 비어있는 행은 스킵
      if (!name || String(name).trim() === "") continue;

      const mall: any = {
        name: String(name).trim(),
      };

      // 나머지 칼럼들 매핑
      Object.keys(columnMapping).forEach((dbColumn) => {
        if (dbColumn !== "name") {
          const columnIndex = columnMapping[dbColumn];
          if (columnIndex !== undefined && columnIndex >= 0 && row.length > columnIndex) {
            const value = row[columnIndex];
            // null, undefined 체크
            if (value !== undefined && value !== null) {
              // 빈 문자열도 체크하되, 공백만 있는 경우는 null로 처리
              const valueStr = String(value).trim();
              
              // 디버깅: 첫 번째 행만 상세 로그
              if (i === 1) {
                console.log(`  📝 ${dbColumn} [인덱스 ${columnIndex}]: 원본타입=${typeof value}, 원본값="${value}", 변환값="${valueStr}"`);
              }
              
              // 빈 문자열이 아닌 경우에만 저장
              if (valueStr !== "" && valueStr !== "null" && valueStr !== "undefined") {
                // 등록일은 날짜 형식으로 변환
                if (dbColumn === "registration_date") {
                  try {
                    // 엑셀 날짜 번호를 날짜로 변환
                    if (typeof value === "number") {
                      const excelDate = XLSX.SSF.parse_date_code(value);
                      if (excelDate) {
                        const date = new Date(
                          excelDate.y,
                          excelDate.m - 1,
                          excelDate.d
                        );
                        mall[dbColumn] = date.toISOString().split("T")[0];
                      } else {
                        mall[dbColumn] = valueStr;
                      }
                    } else {
                      // 문자열 날짜 파싱
                      if (valueStr) {
                        // YYYY-MM-DD 형식인지 확인
                        if (/^\d{4}-\d{2}-\d{2}$/.test(valueStr)) {
                          mall[dbColumn] = valueStr;
                        } else {
                          // 다른 형식 시도
                          const parsed = new Date(valueStr);
                          if (!isNaN(parsed.getTime())) {
                            mall[dbColumn] = parsed.toISOString().split("T")[0];
                          } else {
                            mall[dbColumn] = valueStr;
                          }
                        }
                      }
                    }
                  } catch (error) {
                    console.error("날짜 파싱 실패:", error);
                    mall[dbColumn] = valueStr;
                  }
                } else {
                  mall[dbColumn] = valueStr;
                }
              } else if (i === 1) {
                console.log(`  ⚠️ ${dbColumn}: 빈 값이므로 저장하지 않음`);
              }
            } else if (i === 1) {
              console.log(`  ⚠️ ${dbColumn} [인덱스 ${columnIndex}]: 값이 null 또는 undefined`);
            }
          } else if (i === 1) {
            console.log(`  ❌ ${dbColumn}: 인덱스 ${columnIndex}가 유효하지 않음 (행 길이: ${row.length})`);
          }
        }
      });

      // 디버깅: 첫 번째 행만 최종 결과 로그
      if (i === 1) {
        console.log("첫 번째 쇼핑몰 파싱 결과:", mall);
      }

      malls.push(mall);
    }

    if (malls.length === 0) {
      return NextResponse.json(
        {success: false, error: "저장할 유효한 데이터가 없습니다."},
        {status: 400}
      );
    }

    // 한국 시간 생성
    const koreaTime = getKoreaTime();

    // 시작 코드 번호 가져오기
    const startCodeNumber = await getStartCodeNumber();

    // 각 쇼핑몰에 코드 미리 할당
    malls.forEach((mall, index) => {
      const codeNumber = startCodeNumber + index;
      mall.code = `shop${String(codeNumber).padStart(4, "0")}`;
    });

    // 배치 크기 설정
    const BATCH_SIZE = 50;
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // 배치 단위로 DB 저장
    for (let i = 0; i < malls.length; i += BATCH_SIZE) {
      const batch = malls.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      // 타임아웃 체크
      const elapsedTime = (Date.now() - startTime) / 1000;
      if (elapsedTime > 8) {
        console.warn(
          `타임아웃 위험: ${elapsedTime.toFixed(1)}초 경과, ${successCount}/${
            malls.length
          }건 처리됨`
        );
        return NextResponse.json(
          {
            success: false,
            error: `처리 시간이 너무 오래 걸립니다. ${successCount}건까지 처리되었습니다. 더 작은 파일로 나누어 업로드해주세요.`,
            processedCount: successCount,
            totalCount: malls.length,
            elapsedTime: elapsedTime.toFixed(1),
          },
          {status: 408}
        );
      }

      try {
        const batchStartTime = Date.now();

        // 디버깅: 첫 번째 배치의 첫 번째 항목만 상세 로그
        if (batchNum === 1 && batch.length > 0) {
          console.log("=== DB 저장 데이터 확인 ===");
          console.log("첫 번째 저장할 데이터:", JSON.stringify(batch[0], null, 2));
        }

        // 각 쇼핑몰 저장
        const insertPromises = batch.map((mall, idx) => {
          // null/undefined를 명시적으로 처리
          const companyName = mall.company_name && String(mall.company_name).trim() !== "" ? String(mall.company_name).trim() : null;
          const representativeName = mall.representative_name && String(mall.representative_name).trim() !== "" ? String(mall.representative_name).trim() : null;
          const businessNumber = mall.business_number && String(mall.business_number).trim() !== "" ? String(mall.business_number).trim() : null;
          const marketCategory = mall.market_category && String(mall.market_category).trim() !== "" ? String(mall.market_category).trim() : null;
          const postalCode = mall.postal_code && String(mall.postal_code).trim() !== "" ? String(mall.postal_code).trim() : null;
          const address1 = mall.address1 && String(mall.address1).trim() !== "" ? String(mall.address1).trim() : null;
          const address2 = mall.address2 && String(mall.address2).trim() !== "" ? String(mall.address2).trim() : null;
          const businessType = mall.business_type && String(mall.business_type).trim() !== "" ? String(mall.business_type).trim() : null;
          const businessCategory = mall.business_category && String(mall.business_category).trim() !== "" ? String(mall.business_category).trim() : null;
          const registrationDate = mall.registration_date && String(mall.registration_date).trim() !== "" ? String(mall.registration_date).trim() : null;

          // 디버깅: 첫 번째 항목만 상세 로그
          if (batchNum === 1 && idx === 0) {
            console.log("=== SQL 파라미터 확인 ===");
            console.log("code:", mall.code);
            console.log("name:", mall.name);
            console.log("company_name:", companyName);
            console.log("representative_name:", representativeName);
            console.log("business_number:", businessNumber);
            console.log("market_category:", marketCategory);
            console.log("postal_code:", postalCode);
            console.log("address1:", address1);
            console.log("address2:", address2);
            console.log("business_type:", businessType);
            console.log("business_category:", businessCategory);
            console.log("registration_date:", registrationDate);
          }

          return sql`
            INSERT INTO mall (
              code, name, company_name, representative_name, business_number,
              market_category, postal_code, address1, address2,
              business_type, business_category, registration_date,
              created_at, updated_at
            ) VALUES (
              ${mall.code},
              ${mall.name},
              ${companyName},
              ${representativeName},
              ${businessNumber},
              ${marketCategory},
              ${postalCode},
              ${address1},
              ${address2},
              ${businessType},
              ${businessCategory},
              ${registrationDate},
              ${koreaTime.toISOString()}::timestamp,
              ${koreaTime.toISOString()}::timestamp
            )
            ON CONFLICT (code) DO UPDATE SET
              name = EXCLUDED.name,
              company_name = EXCLUDED.company_name,
              representative_name = EXCLUDED.representative_name,
              business_number = EXCLUDED.business_number,
              market_category = EXCLUDED.market_category,
              postal_code = EXCLUDED.postal_code,
              address1 = EXCLUDED.address1,
              address2 = EXCLUDED.address2,
              business_type = EXCLUDED.business_type,
              business_category = EXCLUDED.business_category,
              registration_date = EXCLUDED.registration_date,
              updated_at = ${koreaTime.toISOString()}::timestamp
          `;
        });

        // 배치 내의 쿼리들을 병렬 실행
        await Promise.all(insertPromises);
        
        // 디버깅: 저장 성공 로그
        if (batchNum === 1) {
          console.log(`✅ 배치 ${batchNum} 저장 성공: ${batch.length}건`);
        }

        successCount += batch.length;
        const batchTime = (Date.now() - batchStartTime) / 1000;
        console.log(
          `배치 ${batchNum} 완료: ${successCount}/${
            malls.length
          }건 처리됨 (${batchTime.toFixed(2)}초)`
        );
      } catch (batchError: any) {
        errorCount += batch.length;
        errors.push(`배치 ${batchNum} 실패: ${batchError.message}`);
        console.error(`❌ 배치 ${batchNum} 처리 실패:`, batchError);
        console.error("에러 상세:", {
          message: batchError.message,
          code: batchError.code,
          detail: batchError.detail,
          hint: batchError.hint,
        });
        
        // 첫 번째 배치 실패 시 더 자세한 로그
        if (batchNum === 1) {
          console.error("실패한 배치 데이터:", JSON.stringify(batch, null, 2));
        }
      }
    }

    // 전체 처리 시간 계산
    const totalTime = (Date.now() - startTime) / 1000;
    console.log(
      `쇼핑몰 데이터 업로드 완료: ${successCount}건 성공, ${errorCount}건 실패, 총 ${totalTime.toFixed(
        1
      )}초 소요`
    );

    // 결과 요약
    const totalProcessed = successCount + errorCount;

    if (errorCount > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `일부 쇼핑몰 저장 실패: ${successCount}건 성공, ${errorCount}건 실패 (${totalTime.toFixed(
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
      message: `${successCount}개의 쇼핑몰이 성공적으로 저장되었습니다. (${totalTime.toFixed(
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
