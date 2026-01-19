import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {generateUniqueCodesForVendors} from "@/utils/internalCode";
import {generateAutoDeliveryMessage} from "@/utils/vendorMessageUtils";
import {getCompanyIdFromRequest, getUserIdFromRequest} from "@/lib/company";

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

    // user_id 추출
    const userId = await getUserIdFromRequest(request);

    // user grade 확인 (온라인인지 확인)
    let userGrade: string | null = null;
    if (userId && companyId) {
      try {
        const userResult = await sql`
          SELECT grade
          FROM users
          WHERE id = ${userId} AND company_id = ${companyId}
        `;
        
        if (userResult.length > 0) {
          userGrade = userResult[0].grade;
        }
      } catch (error) {
        console.error("사용자 정보 조회 실패:", error);
      }
    }

    // user_id 컬럼 존재 여부 확인
    let hasUserIdColumn = false;
    try {
      const columnCheck = await sql`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'temp_files' AND column_name = 'user_id'
      `;
      hasUserIdColumn = columnCheck.length > 0;
    } catch (error) {
      // 테이블이 없거나 다른 에러인 경우 무시
      console.log("컬럼 확인 실패:", error);
    }

    // uploads 테이블에 vendor_name 컬럼이 있는지 확인하고 없으면 추가
    try {
      const vendorNameColumnExists = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'uploads' 
        AND column_name = 'vendor_name'
      `;

      if (vendorNameColumnExists.length === 0) {
        await sql`
          ALTER TABLE uploads 
          ADD COLUMN vendor_name VARCHAR(255)
        `;
        console.log("✅ uploads 테이블에 vendor_name 컬럼 추가 완료");
      }
    } catch (error) {
      console.error("vendor_name 컬럼 확인/추가 실패:", error);
    }

    // uploads 테이블에 header_order 컬럼이 있는지 확인하고 없으면 추가
    try {
      const headerOrderColumnExists = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'uploads' 
        AND column_name = 'header_order'
      `;

      if (headerOrderColumnExists.length === 0) {
        await sql`
          ALTER TABLE uploads 
          ADD COLUMN header_order JSONB
        `;
        console.log("✅ uploads 테이블에 header_order 컬럼 추가 완료");
      }
    } catch (error) {
      console.error("header_order 컬럼 확인/추가 실패:", error);
    }

    // uploads 테이블에 header_format 컬럼이 있는지 확인하고 없으면 추가 (헤더 순서 및 양식 정보 저장)
    try {
      const headerFormatColumnExists = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'uploads' 
        AND column_name = 'header_format'
      `;

      if (headerFormatColumnExists.length === 0) {
        await sql`
          ALTER TABLE uploads 
          ADD COLUMN header_format JSONB
        `;
        console.log("✅ uploads 테이블에 header_format 컬럼 추가 완료");
      }
    } catch (error) {
      console.error("header_format 컬럼 확인/추가 실패:", error);
    }

    // upload_rows 테이블에 mall_id 컬럼이 있는지 확인하고 없으면 추가
    try {
      const mallIdColumnExists = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'upload_rows' 
        AND column_name = 'mall_id'
      `;

      if (mallIdColumnExists.length === 0) {
        await sql`
          ALTER TABLE upload_rows 
          ADD COLUMN mall_id INTEGER REFERENCES mall(id) ON DELETE SET NULL
        `;
        console.log("✅ upload_rows 테이블에 mall_id 컬럼 추가 완료");

        // 인덱스 생성
        await sql`
          CREATE INDEX IF NOT EXISTS idx_upload_rows_mall_id ON upload_rows(mall_id)
        `;
        console.log("✅ upload_rows 테이블에 mall_id 인덱스 생성 완료");
      }
    } catch (error) {
      console.error("mall_id 컬럼 확인/추가 실패:", error);
    }

    // 확인된 모든 임시 파일들을 조회 (세션 구분 없음, company_id, user_id 필터링)
    let confirmedFiles;
    if (userId && hasUserIdColumn) {
      confirmedFiles = await sql`
        SELECT 
          file_id,
          file_name,
          row_count,
          table_data,
          header_index,
          product_code_map,
          product_id_map,
          vendor_name,
          mall_id,
          original_header,
          original_table_data,
          user_id
        FROM temp_files
        WHERE is_confirmed = true AND company_id = ${companyId} AND user_id = ${userId}
        ORDER BY created_at ASC
      `;
    } else {
      confirmedFiles = await sql`
        SELECT 
          file_id,
          file_name,
          row_count,
          table_data,
          header_index,
          product_code_map,
          product_id_map,
          vendor_name,
          mall_id,
          original_header,
          original_table_data,
          user_id
        FROM temp_files
        WHERE is_confirmed = true AND company_id = ${companyId}
        ORDER BY created_at ASC
      `;
    }

    if (confirmedFiles.length === 0) {
      return NextResponse.json(
        {success: false, error: "확인된 파일이 없습니다."},
        {status: 400}
      );
    }

    // 한국 시간(KST) 생성
    const koreaTime = new Date(Date.now() + 9 * 60 * 60 * 1000);

    // 사용자가 드롭다운에서 선택한 업체명을 기반으로 내부코드 일괄 생성
    // 각 파일의 모든 행에 대해 동일한 업체명(file.vendor_name) 사용
    const allVendorNames: string[] = [];
    confirmedFiles.forEach((file) => {
      const tableData = file.table_data;
      if (!tableData || !Array.isArray(tableData) || tableData.length < 2) {
        return;
      }

      // 사용자가 드롭다운에서 선택한 업체명 사용 (DB에 저장된 vendor_name)
      let vendorName = file.vendor_name || "";

      // vendor_name이 비어있으면 테이블 데이터에서 업체명 찾기 (하위 호환성)
      if (!vendorName || vendorName.trim() === "") {
        const headerRow = tableData[0];
        const vendorIdx = headerRow.findIndex(
          (h: any) =>
            h && typeof h === "string" && (h === "업체명" || h === "업체")
        );

        if (vendorIdx !== -1 && tableData.length > 1) {
          // 첫 번째 데이터 행에서 업체명 찾기
          const firstDataRow = tableData[1];
          const vendorFromTable = firstDataRow[vendorIdx];
          if (vendorFromTable && typeof vendorFromTable === "string") {
            vendorName = String(vendorFromTable).trim();
            console.warn(
              `⚠️ 파일 "${file.file_name}": DB의 vendor_name이 비어있어 테이블 데이터에서 업체명을 찾았습니다: "${vendorName}"`
            );
          }
        }

        // 여전히 비어있으면 경고 로그
        if (!vendorName || vendorName.trim() === "") {
          console.error(
            `❌ 파일 "${file.file_name}": 업체명을 찾을 수 없습니다. DB의 vendor_name도 비어있고 테이블 데이터에도 업체명 컬럼이 없습니다.`
          );
        }
      } else {
        console.log(
          `✅ 파일 "${file.file_name}": DB의 vendor_name 사용: "${vendorName}"`
        );
      }

      const rowCount = tableData.length - 1; // 헤더 제외한 데이터 행 개수

      // 각 행에 대해 동일한 업체명 사용
      for (let i = 0; i < rowCount; i++) {
        allVendorNames.push(vendorName || ""); // 빈 문자열이면 "미지정"이 됨
      }
    });

    // 내부코드 일괄 생성
    let internalCodes: string[] = [];
    if (allVendorNames.length > 0) {
      try {
        internalCodes = await generateUniqueCodesForVendors(allVendorNames);
        console.log("✅ 내부코드 생성 완료:", internalCodes.length);
      } catch (error) {
        console.error("내부코드 생성 실패:", error);
        return NextResponse.json(
          {success: false, error: "내부코드 생성에 실패했습니다."},
          {status: 500}
        );
      }
    }

    // 각 확인된 파일을 정식 uploads/upload_rows 테이블로 이동
    const results = [];
    let globalCodeIndex = 0;

    // uploads 테이블에 이미 저장된 파일명 중복 체크
    const duplicateFileNames: string[] = [];
    for (const file of confirmedFiles) {
      const existingFile = await sql`
        SELECT file_name FROM uploads
        WHERE file_name = ${file.file_name} AND company_id = ${companyId}
        LIMIT 1
      `;

      if (existingFile.length > 0) {
        duplicateFileNames.push(file.file_name);
      }
    }

    // 중복 파일명이 있으면 에러 반환
    if (duplicateFileNames.length > 0) {
      const duplicateList = duplicateFileNames.join(", ");
      return NextResponse.json(
        {
          success: false,
          error: "DUPLICATE_FILENAMES",
          message: `다음 파일명이 이미 존재합니다: ${duplicateList}`,
          duplicateFiles: duplicateFileNames,
        },
        {status: 409}
      );
    }

    for (const file of confirmedFiles) {
      const tableData = file.table_data;
      const productCodeMap = file.product_code_map || {};
      const productIdMap = file.product_id_map || {};

      if (!tableData || !Array.isArray(tableData) || tableData.length < 2) {
        console.warn(`파일 ${file.file_name}의 데이터가 비어있습니다.`);
        continue;
      }

      // 헤더와 데이터 행 분리
      // 기존 방식대로 tableData[0] 사용 (canonicalHeader)
      const headerRow = tableData[0];
      const dataRows = tableData.slice(1);

      // 원본 데이터 가져오기 (original_table_data가 있으면 사용, 없으면 table_data 사용)
      // 원본 순서를 유지하기 위해 original_table_data 사용
      const originalTableDataForOrder =
        file.original_table_data &&
        Array.isArray(file.original_table_data) &&
        file.original_table_data.length > 0
          ? file.original_table_data
          : tableData; // 하위 호환성을 위해 table_data 사용

      // 디버깅: 각 파일의 헤더 확인
      console.log(
        `📋 파일 "${file.file_name}"의 원본 헤더 (DB 저장용):`,
        file.original_header
      );
      console.log(
        `📋 파일 "${file.file_name}"의 사용할 헤더 (데이터 처리용):`,
        headerRow
      );

      // 상품명 인덱스 찾기
      const nameIdx = headerRow.findIndex(
        (h: any) => h && typeof h === "string" && h.includes("상품명")
      );

      // 원본 데이터에서 상품명 인덱스 찾기 (순서 매칭용)
      const originalHeaderRow = originalTableDataForOrder[0] || headerRow;
      const originalNameIdx = originalHeaderRow.findIndex(
        (h: any) => h && typeof h === "string" && h.includes("상품명")
      );
      const originalDataRows = originalTableDataForOrder.slice(1);

      // user grade가 "온라인"인 경우 "주문번호(사방넷)" 헤더 찾기
      const sabangnetOrderNumberIdx = userGrade === "온라인" 
        ? headerRow.findIndex(
            (h: any) => h && typeof h === "string" && (
              h === "주문번호(사방넷)" || 
              h.includes("주문번호(사방넷)") ||
              h === "주문번호(사방넷)" ||
              h.replace(/\s+/g, "") === "주문번호(사방넷)".replace(/\s+/g, "")
            )
          )
        : -1;
      
      if (userGrade === "온라인" && sabangnetOrderNumberIdx !== -1) {
        console.log(`✅ [온라인 사용자] "주문번호(사방넷)" 헤더 발견: 인덱스 ${sabangnetOrderNumberIdx}`);
      }

      // "공급단가" 헤더 찾기 (정규화된 헤더와 원본 헤더 모두에서 찾기)
      let supplyPriceIdx = headerRow.findIndex(
        (h: any) => {
          if (!h || typeof h !== "string") return false;
          const headerStr = String(h).trim();
          return headerStr === "공급단가" || 
                 headerStr.includes("공급단가") ||
                 headerStr.replace(/\s+/g, "") === "공급단가".replace(/\s+/g, "");
        }
      );
      
      // 정규화된 헤더에서 못 찾으면 원본 헤더에서 찾기
      if (supplyPriceIdx === -1 && file.original_header && Array.isArray(file.original_header)) {
        const originalSupplyPriceIdx = file.original_header.findIndex(
          (h: any) => {
            if (!h || typeof h !== "string") return false;
            const headerStr = String(h).trim();
            return headerStr === "공급단가" || 
                   headerStr.includes("공급단가") ||
                   headerStr.replace(/\s+/g, "") === "공급단가".replace(/\s+/g, "");
          }
        );
        
        if (originalSupplyPriceIdx !== -1) {
          // 원본 헤더에서 찾았으면, 정규화된 헤더에서 해당 인덱스의 헤더 이름 찾기
          const originalHeaderName = file.original_header[originalSupplyPriceIdx];
          supplyPriceIdx = headerRow.findIndex((h: any) => String(h).trim() === String(originalHeaderName).trim());
          
          // 여전히 못 찾으면 원본 인덱스 사용 (데이터 행에서 직접 접근)
          if (supplyPriceIdx === -1) {
            supplyPriceIdx = originalSupplyPriceIdx;
            console.log(`✅ [공급단가] 원본 헤더에서 발견: 원본 인덱스 ${originalSupplyPriceIdx}, 헤더명: "${originalHeaderName}"`);
          }
        }
      }
      
      // 디버깅: 헤더 목록 확인
      console.log(`🔍 [공급단가 찾기] 정규화된 headerRow 샘플:`, headerRow.slice(0, 10));
      if (file.original_header && Array.isArray(file.original_header)) {
        console.log(`🔍 [공급단가 찾기] 원본 헤더 샘플:`, file.original_header.slice(0, 10));
      }
      console.log(`🔍 [공급단가 찾기] supplyPriceIdx: ${supplyPriceIdx}`);
      
      if (supplyPriceIdx !== -1) {
        const foundHeaderName = headerRow[supplyPriceIdx] || (file.original_header && file.original_header[supplyPriceIdx]) || "알 수 없음";
        console.log(`✅ "공급단가" 헤더 발견: 인덱스 ${supplyPriceIdx}, 헤더명: "${foundHeaderName}"`);
      } else {
        console.warn(`⚠️ "공급단가" 헤더를 찾을 수 없습니다. 정규화된 헤더:`, headerRow);
        if (file.original_header && Array.isArray(file.original_header)) {
          console.warn(`⚠️ 원본 헤더:`, file.original_header);
        }
      }

      // 배송메시지 자동 생성을 위해 원본 메시지 저장
      const originalMessagesRef: {[rowIdx: number]: string} = {};

      // 배송메시지 자동 생성 적용
      const updatedTableData = generateAutoDeliveryMessage(
        tableData,
        originalMessagesRef
      );
      const updatedDataRows = updatedTableData.slice(1);

      // 배열을 객체로 변환 (헤더를 키로 사용)
      // 중요: rowIndex는 정렬된 순서가 아니라 원본 순서를 사용해야 함
      const rowObjects = updatedDataRows.map((row: any[], rowIndex: number) => {
        const rowObj: any = {};
        headerRow.forEach((header: string, index: number) => {
          rowObj[header] =
            row[index] !== undefined && row[index] !== null ? row[index] : "";
        });

        // "공급단가"는 uploadStore.ts에서 파일 읽을 때 이미 정규화된 헤더와 데이터에 추가되었으므로
        // rowObj에 이미 포함되어 있어야 함 (추가 로직 불필요)

        // 주문상태가 없으면 기본값 "공급중" 설정
        if (!rowObj["주문상태"] || rowObj["주문상태"] === "") {
          rowObj["주문상태"] = "공급중";
        }

        // 매핑코드 및 productId 추가 (productCodeMap, productIdMap에서 가져오기)
        if (nameIdx !== -1) {
          const productName = String(row[nameIdx] || "").trim();
          if (productName) {
            // 매핑코드 추가
            if (productCodeMap[productName]) {
              rowObj["매핑코드"] = productCodeMap[productName];
            }
            // productId 추가 (productIdMap에서 가져오기)
            // 여러 키 변형으로 시도 (정확한 매칭, 공백 제거 등)
            let productId = null;

            // 1순위: 정확한 상품명으로 매칭
            if (productIdMap[productName]) {
              productId = productIdMap[productName];
            } else {
              // 2순위: 공백 제거한 상품명으로 매칭
              const trimmedName = productName.replace(/\s+/g, "");
              if (productIdMap[trimmedName]) {
                productId = productIdMap[trimmedName];
              } else {
                // 3순위: productIdMap의 모든 키를 순회하며 부분 매칭 시도
                for (const [key, value] of Object.entries(productIdMap)) {
                  const trimmedKey = key.replace(/\s+/g, "");
                  if (trimmedKey === trimmedName || key === productName) {
                    productId = value;
                    break;
                  }
                }
              }
            }

            if (productId) {
              rowObj["productId"] = productId;
            } else {
              // 디버깅: productIdMap에 없는 경우 로그 출력 (첫 3개만)
              if (rowIndex < 3) {
                console.log(`⚠️ productIdMap에 없는 상품명: "${productName}"`, {
                  productIdMapKeys: Object.keys(productIdMap),
                  productIdMapSample: Object.entries(productIdMap).slice(0, 3),
                });
              }
            }
          }
        }

        // 내부코드 추가
        if (internalCodes.length > globalCodeIndex) {
          rowObj["내부코드"] = internalCodes[globalCodeIndex];
        }
        globalCodeIndex++;

        // 업로드 시 부여된 row 순서 번호 추가 (1부터 시작)
        // 중요: 정렬된 순서가 아니라 원본 순서를 사용해야 함
        // original_table_data가 있으면 원본 순서를 사용하고, 없으면 현재 순서 사용
        let originalRowIndex = rowIndex; // 기본값은 현재 인덱스
        
        // original_table_data가 있고, 현재 tableData와 다르면 원본 순서 찾기
        if (originalDataRows.length > 0 && originalDataRows.length === updatedDataRows.length) {
          // 현재 행의 데이터로 원본 데이터에서 매칭
          // 상품명과 수취인명을 조합하여 더 정확한 매칭 시도
          if (nameIdx !== -1 && originalNameIdx !== -1) {
            const currentProductName = String(row[nameIdx] || "").trim();
            
            // 수취인명 인덱스 찾기
            const receiverIdx = headerRow.findIndex(
              (h: any) => h && typeof h === "string" && (h.includes("수취인명") || h.includes("이름"))
            );
            const originalReceiverIdx = originalHeaderRow.findIndex(
              (h: any) => h && typeof h === "string" && (h.includes("수취인명") || h.includes("이름"))
            );
            
            const currentReceiverName = receiverIdx !== -1 ? String(row[receiverIdx] || "").trim() : "";
            
            // 원본 데이터에서 매칭되는 행 찾기
            // 같은 상품명+수취인명 조합을 가진 행을 순서대로 매칭
            const matchedIndices = new Set<number>(); // 이미 매칭된 원본 인덱스
            
            for (let origIdx = 0; origIdx < originalDataRows.length; origIdx++) {
              if (matchedIndices.has(origIdx)) continue;
              
              const originalProductName = String(
                originalDataRows[origIdx]?.[originalNameIdx] || ""
              ).trim();
              
              if (originalProductName === currentProductName) {
                // 수취인명도 비교 (있는 경우)
                if (receiverIdx !== -1 && originalReceiverIdx !== -1) {
                  const originalReceiverName = String(
                    originalDataRows[origIdx]?.[originalReceiverIdx] || ""
                  ).trim();
                  if (originalReceiverName !== currentReceiverName) {
                    continue;
                  }
                }
                
                // 현재 행 이전에 같은 조합이 몇 개나 있었는지 확인
                let sameCombinationCount = 0;
                for (let prevIdx = 0; prevIdx < rowIndex; prevIdx++) {
                  const prevProductName = String(
                    updatedDataRows[prevIdx]?.[nameIdx] || ""
                  ).trim();
                  const prevReceiverName = receiverIdx !== -1 
                    ? String(updatedDataRows[prevIdx]?.[receiverIdx] || "").trim() 
                    : "";
                  
                  if (prevProductName === currentProductName && 
                      prevReceiverName === currentReceiverName) {
                    sameCombinationCount++;
                  }
                }
                
                // 원본 데이터에서 같은 조합을 순서대로 찾아서 sameCombinationCount번째 것 사용
                let foundCount = 0;
                for (let origIdx2 = 0; origIdx2 < originalDataRows.length; origIdx2++) {
                  if (matchedIndices.has(origIdx2)) continue;
                  
                  const origProdName = String(
                    originalDataRows[origIdx2]?.[originalNameIdx] || ""
                  ).trim();
                  const origRecName = originalReceiverIdx !== -1
                    ? String(originalDataRows[origIdx2]?.[originalReceiverIdx] || "").trim()
                    : "";
                  
                  if (origProdName === currentProductName && 
                      origRecName === currentReceiverName) {
                    if (foundCount === sameCombinationCount) {
                      originalRowIndex = origIdx2;
                      matchedIndices.add(origIdx2);
                      break;
                    }
                    foundCount++;
                  }
                }
                break;
              }
            }
          }
        }
        
        // 업로드 당시 원본 순서 사용 (1부터 시작)
        rowObj["순서번호"] = originalRowIndex + 1;
        rowObj["rowOrder"] = originalRowIndex + 1;

        return rowObj;
      });

      // 업체명은 드롭다운에서 선택해야만 적용되도록 변경
      // 엑셀 파일에서 자동으로 읽어서 설정하지 않음
      // file.vendor_name만 사용 (드롭다운에서 선택한 값)
      let vendorName = file.vendor_name || null;

      console.log("💾 저장할 데이터 샘플:", {
        fileName: file.file_name,
        rowCount: rowObjects.length,
        vendorName: vendorName,
        fileVendorName: file.vendor_name,
        hasInternalCode: !!rowObjects[0]?.["내부코드"],
        hasMappingCode: !!rowObjects[0]?.["매핑코드"],
        hasProductId: !!rowObjects[0]?.["productId"],
        productIdMapSize: Object.keys(productIdMap).length,
        firstRowProductName: rowObjects[0]?.["상품명"],
        firstRowProductId: rowObjects[0]?.["productId"],
      });

      // mall_id 찾기: temp_files에 저장된 mall_id를 우선 사용, 없으면 vendorName으로 찾기
      let mallId: number | null = file.mall_id || null;

      if (mallId) {
        console.log(`✅ temp_files에 저장된 mall_id 사용: mall_id=${mallId}`);
      } else if (vendorName) {
        try {
          const trimmedVendorName = vendorName.trim();
          console.log(`🔍 mall 조회 시작: vendor_name="${trimmedVendorName}"`);

          // 정확한 매칭 시도
          let mallResult = await sql`
            SELECT id, name FROM mall 
            WHERE name = ${trimmedVendorName}
            LIMIT 1
          `;

          if (mallResult.length > 0) {
            mallId = mallResult[0].id;
            console.log(
              `✅ 업체명 "${trimmedVendorName}"에 해당하는 mall 찾음: mall_id=${mallId}, mall_name="${mallResult[0].name}"`
            );
          } else {
            // 대소문자 구분 없이 매칭 시도
            mallResult = await sql`
              SELECT id, name FROM mall 
              WHERE LOWER(TRIM(name)) = LOWER(${trimmedVendorName})
              LIMIT 1
            `;

            if (mallResult.length > 0) {
              mallId = mallResult[0].id;
              console.log(
                `✅ 업체명 "${trimmedVendorName}"에 해당하는 mall 찾음 (대소문자 무시): mall_id=${mallId}, mall_name="${mallResult[0].name}"`
              );
            } else {
              console.warn(
                `⚠️ 업체명 "${trimmedVendorName}"에 해당하는 mall을 찾을 수 없습니다.`
              );
              // mall 테이블의 모든 name 목록 출력 (디버깅용)
              const allMalls =
                await sql`SELECT id, name FROM mall ORDER BY name LIMIT 20`;
              console.log(
                "mall 테이블 샘플 (처음 20개):",
                allMalls.map((m: any) => ({id: m.id, name: m.name}))
              );
            }
          }
        } catch (error) {
          console.error("mall 조회 실패:", error);
        }
      } else {
        console.warn(
          "⚠️ vendor_name이 없습니다. file.vendor_name:",
          file.vendor_name
        );
      }

      console.log(
        `📝 저장 전 확인: vendorName="${vendorName}", mallId=${mallId}`
      );

      // 헤더 순서 및 양식 정보 구성
      // 원본 헤더는 DB에만 저장하고, 실제 데이터 처리에는 사용하지 않음
      // header_order: 원본 헤더 순서 (DB 저장용)
      // header_format: 상세 양식 정보 객체 (원본 헤더 포함)
      const originalHeader =
        file.original_header &&
        Array.isArray(file.original_header) &&
        file.original_header.length > 0
          ? file.original_header
          : headerRow; // 원본 헤더가 없으면 현재 헤더 사용 (하위 호환성)

      const headerFormat = {
        headers: originalHeader, // 원본 헤더 내용 배열 (DB 저장용)
        headerIndex: file.header_index || {}, // 헤더 인덱스 정보 (예: {nameIdx: 0, ...})
      };

      // 디버깅: 저장할 헤더 정보 확인
      console.log(`💾 파일 "${file.file_name}" 저장 시 헤더 정보:`, {
        originalHeader: originalHeader,
        headerOrder: originalHeader, // 원본 헤더 순서 저장
        headerFormat: headerFormat,
      });

      // uploads 테이블에 user_id 컬럼이 있는지 확인하고 없으면 추가
      try {
        const uploadsUserIdColumnExists = await sql`
          SELECT EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'uploads' 
            AND column_name = 'user_id'
          )
        `;

        if (!uploadsUserIdColumnExists[0]?.exists) {
          await sql`
            ALTER TABLE uploads 
            ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
          `;
          console.log("✅ uploads 테이블에 user_id 컬럼 추가 완료");
        }
      } catch (error) {
        console.error("uploads user_id 컬럼 확인/추가 실패:", error);
      }

      // uploads 테이블에 original_data 컬럼이 있는지 확인하고 없으면 추가
      try {
        const originalDataColumnExists = await sql`
          SELECT EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'uploads' 
            AND column_name = 'original_data'
          )
        `;

        if (!originalDataColumnExists[0]?.exists) {
          await sql`
            ALTER TABLE uploads 
            ADD COLUMN original_data JSONB
          `;
          console.log("✅ uploads 테이블에 original_data 컬럼 추가 완료");
        }
      } catch (error) {
        console.error("uploads original_data 컬럼 확인/추가 실패:", error);
      }

      // temp_files의 user_id 가져오기
      const fileUserId = file.user_id ? parseInt(file.user_id, 10) : null;

      // 디버깅: user_id 확인
      console.log(`🔍 파일 "${file.file_name}" 처리 중:`, {
        fileUserId: fileUserId,
        fileUserIdRaw: file.user_id,
        userIdFromRequest: userId,
      });

      // 원본 데이터 가져오기 (original_table_data가 있으면 사용, 없으면 table_data 사용)
      const originalTableData =
        file.original_table_data &&
        Array.isArray(file.original_table_data) &&
        file.original_table_data.length > 0
          ? file.original_table_data
          : file.table_data; // 하위 호환성을 위해 table_data 사용

      // uploads 테이블에 저장 (vendor_name, header_order, header_format, user_id, original_data 포함)
      // header_order와 header_format에는 원본 헤더 저장
      // original_data에는 원본 테이블 데이터 저장 (업로드 후에도 변하지 않음)
      const uploadResult = await sql`
        INSERT INTO uploads (file_name, row_count, data, company_id, vendor_name, header_order, header_format, user_id, original_data, created_at)
        VALUES (
          ${file.file_name},
          ${rowObjects.length},
          ${JSON.stringify(rowObjects)},
          ${companyId},
          ${vendorName},
          ${JSON.stringify(originalHeader)},
          ${JSON.stringify(headerFormat)},
          ${fileUserId},
          ${JSON.stringify(originalTableData)},
          ${koreaTime.toISOString()}::timestamp
        )
        RETURNING id, created_at, header_order, header_format, original_data
      `;

      // 디버깅: 저장된 헤더 정보 및 원본 데이터 확인
      console.log(`✅ 파일 "${file.file_name}" 저장 완료:`, {
        uploadId: uploadResult[0].id,
        savedHeaderOrder: uploadResult[0].header_order,
        savedHeaderFormat: uploadResult[0].header_format,
        hasOriginalData: !!uploadResult[0].original_data,
        originalDataLength: uploadResult[0].original_data
          ? Array.isArray(uploadResult[0].original_data)
            ? uploadResult[0].original_data.length
            : "not array"
          : null,
      });

      const uploadId = uploadResult[0].id;
      const createdAt = uploadResult[0].created_at;
      console.log(
        `✅ uploads 저장 완료: upload_id=${uploadId}, vendor_name=${vendorName}, user_id=${fileUserId}`
      );

      // uploads 테이블에 저장된 user_id 검증
      try {
        const verifyUpload = await sql`
          SELECT id, file_name, user_id 
          FROM uploads 
          WHERE id = ${uploadId}
        `;
        if (verifyUpload.length > 0) {
          console.log(
            `🔍 uploads 테이블 검증: id=${verifyUpload[0].id}, file_name="${verifyUpload[0].file_name}", user_id=${verifyUpload[0].user_id} (예상: ${fileUserId})`
          );
          if (verifyUpload[0].user_id !== fileUserId) {
            console.error(
              `❌ 경고: uploads 테이블에 저장된 user_id(${verifyUpload[0].user_id})가 예상값(${fileUserId})과 다릅니다!`
            );
          }
        }
      } catch (error) {
        console.error("uploads 테이블 검증 실패:", error);
      }

      // upload_rows 테이블에 vendor_name 컬럼이 있는지 확인하고 없으면 추가
      try {
        const vendorNameColumnExists = await sql`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'upload_rows' 
          AND column_name = 'vendor_name'
        `;

        if (vendorNameColumnExists.length === 0) {
          await sql`
            ALTER TABLE upload_rows 
            ADD COLUMN vendor_name VARCHAR(255)
          `;
          console.log("✅ upload_rows 테이블에 vendor_name 컬럼 추가 완료");
        }
      } catch (error) {
        console.error("upload_rows vendor_name 컬럼 확인/추가 실패:", error);
      }

      // upload_rows 테이블에 user_id 컬럼이 있는지 확인하고 없으면 추가
      try {
        const uploadRowsUserIdColumnExists = await sql`
          SELECT EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'upload_rows' 
            AND column_name = 'user_id'
          )
        `;

        if (!uploadRowsUserIdColumnExists[0]?.exists) {
          await sql`
            ALTER TABLE upload_rows 
            ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
          `;
          console.log("✅ upload_rows 테이블에 user_id 컬럼 추가 완료");
        }
      } catch (error) {
        console.error("upload_rows user_id 컬럼 확인/추가 실패:", error);
      }

      // upload_rows 테이블에 row_order 컬럼이 있는지 확인하고 없으면 추가
      try {
        const rowOrderColumnExists = await sql`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'upload_rows' 
          AND column_name = 'row_order'
        `;

        if (rowOrderColumnExists.length === 0) {
          await sql`
            ALTER TABLE upload_rows 
            ADD COLUMN row_order INTEGER
          `;
          console.log("✅ upload_rows 테이블에 row_order 컬럼 추가 완료");
        }
      } catch (error) {
        console.error("upload_rows row_order 컬럼 확인/추가 실패:", error);
      }

      // upload_rows 테이블에 sabang_code 컬럼이 있는지 확인하고 없으면 추가
      try {
        const sabangCodeColumnExists = await sql`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'upload_rows' 
          AND column_name = 'sabang_code'
        `;

        if (sabangCodeColumnExists.length === 0) {
          await sql`
            ALTER TABLE upload_rows 
            ADD COLUMN sabang_code VARCHAR(255)
          `;
          console.log("✅ upload_rows 테이블에 sabang_code 컬럼 추가 완료");
        }
      } catch (error) {
        console.error("upload_rows sabang_code 컬럼 확인/추가 실패:", error);
      }

      // upload_rows 테이블에 supply_price 컬럼이 있는지 확인하고 없으면 추가
      try {
        const supplyPriceColumnExists = await sql`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'upload_rows' 
          AND column_name = 'supply_price'
        `;

        if (supplyPriceColumnExists.length === 0) {
          await sql`
            ALTER TABLE upload_rows 
            ADD COLUMN supply_price INTEGER
          `;
          console.log("✅ upload_rows 테이블에 supply_price 컬럼 추가 완료");
        }
      } catch (error) {
        console.error("upload_rows supply_price 컬럼 확인/추가 실패:", error);
      }

      // 각 행의 업체명으로 mall을 찾기 위한 캐시 (성능 최적화)
      const mallCache: {[key: string]: number | null} = {};

      // 헤더에서 업체명 컬럼 인덱스 찾기
      const vendorHeaderIdx = headerRow.findIndex(
        (h: any) => h && typeof h === "string" && (h === "업체명" || h === "업체" || h.includes("업체명"))
      );
      const vendorHeaderKey = vendorHeaderIdx !== -1 ? headerRow[vendorHeaderIdx] : null;

      console.log(`🔍 업체명 컬럼 찾기: vendorHeaderIdx=${vendorHeaderIdx}, vendorHeaderKey="${vendorHeaderKey}", headerRow 샘플:`, headerRow.slice(0, 5));

      // 각 행을 upload_rows에 저장 (객체 형태로, row_order 포함)
      const insertPromises = rowObjects.map(async (rowObj: any, index: number) => {
        // 쇼핑몰명 추출 (여러 가능한 키에서 찾기)
        const shopName =
          rowObj["쇼핑몰명"] || rowObj["쇼핑몰명(1)"] || rowObj["쇼핑몰"] || "";

        // 각 행의 업체명 추출 (헤더 키 사용 또는 여러 가능한 키 시도)
        let rowVendorName = "";
        
        // 1순위: 헤더에서 찾은 키 사용
        if (vendorHeaderKey && rowObj[vendorHeaderKey]) {
          rowVendorName = String(rowObj[vendorHeaderKey]).trim();
        } 
        // 2순위: 원본 데이터 행에서 직접 추출 (vendorHeaderIdx 사용)
        else if (vendorHeaderIdx !== -1 && updatedDataRows[index] && updatedDataRows[index][vendorHeaderIdx]) {
          rowVendorName = String(updatedDataRows[index][vendorHeaderIdx]).trim();
        }
        // 3순위: 일반적인 키 이름 시도
        else {
          rowVendorName = String(
            rowObj["업체명"] || 
            rowObj["업체"] || 
            vendorName || 
            ""
          ).trim();
        }
        
        const trimmedRowVendorName = rowVendorName;
        
        // 디버깅: 첫 3개 행만 로그 출력
        if (index < 3) {
          console.log(`🔍 행 ${index + 1} 업체명 추출:`, {
            vendorHeaderKey,
            vendorHeaderIdx,
            rowObjVendorName: rowObj[vendorHeaderKey || "업체명"],
            dataRowVendorName: vendorHeaderIdx !== -1 ? updatedDataRows[index]?.[vendorHeaderIdx] : null,
            finalVendorName: trimmedRowVendorName,
          });
        }

        // 각 행의 업체명으로 mall 찾기
        let rowMallId: number | null = null;
        let rowVendorNameToSave: string | null = null;

        if (trimmedRowVendorName) {
          rowVendorNameToSave = trimmedRowVendorName;
          
          // 캐시에서 먼저 확인
          if (mallCache.hasOwnProperty(trimmedRowVendorName)) {
            rowMallId = mallCache[trimmedRowVendorName];
          } else {
            // 캐시에 없으면 DB에서 조회
            try {
              // 정확한 매칭 시도
              let mallResult = await sql`
                SELECT id, name FROM mall 
                WHERE name = ${trimmedRowVendorName}
                LIMIT 1
              `;

              if (mallResult.length > 0) {
                rowMallId = mallResult[0].id;
              } else {
                // 대소문자 구분 없이 매칭 시도
                mallResult = await sql`
                  SELECT id, name FROM mall 
                  WHERE LOWER(TRIM(name)) = LOWER(${trimmedRowVendorName})
                  LIMIT 1
                `;

                if (mallResult.length > 0) {
                  rowMallId = mallResult[0].id;
                }
              }

              // 캐시에 저장
              mallCache[trimmedRowVendorName] = rowMallId;

              if (rowMallId) {
                console.log(
                  `✅ 행 ${index + 1}: 업체명 "${trimmedRowVendorName}"에 해당하는 mall 찾음: mall_id=${rowMallId}`
                );
              } else if (index < 5) {
                // 처음 5개 행만 경고 로그 출력
                console.warn(
                  `⚠️ 행 ${index + 1}: 업체명 "${trimmedRowVendorName}"에 해당하는 mall을 찾을 수 없습니다.`
                );
              }
            } catch (error) {
              console.error(`행 ${index + 1}: mall 조회 실패:`, error);
            }
          }
        } else {
          // 행에 업체명이 없으면 파일 레벨 업체명과 mallId 사용
          rowVendorNameToSave = vendorName || null;
          rowMallId = mallId;
        }

        // 첫 번째 row만 상세 로그 출력
        if (index === 0) {
          console.log(
            `📝 upload_rows 저장 시작: upload_id=${uploadId}, 각 행별 mall_id 매칭 사용`
          );
        }

        // 업로드 당시 원본 순서 사용 (rowObj에 이미 저장된 순서번호 사용)
        // 절대 index + 1을 사용하지 않고, 업로드 시 부여된 원본 순서를 사용
        const originalRowOrder = rowObj["rowOrder"] || rowObj["순서번호"] || (index + 1);
        
        // user grade가 "온라인"이고 "주문번호(사방넷)" 헤더가 있으면 sabang_code에 저장
        let sabangCode: string | null = null;
        if (userGrade === "온라인" && sabangnetOrderNumberIdx !== -1) {
          const sabangnetOrderNumber = rowObj["주문번호(사방넷)"] || 
            (updatedDataRows[index] && updatedDataRows[index][sabangnetOrderNumberIdx] ? 
              String(updatedDataRows[index][sabangnetOrderNumberIdx]).trim() : null);
          
          if (sabangnetOrderNumber && sabangnetOrderNumber !== "") {
            sabangCode = String(sabangnetOrderNumber).trim();
            // row_data에도 sabang_code 추가
            rowObj["sabang_code"] = sabangCode;
          }
        }

        // "공급단가" 헤더가 있으면 supply_price 컬럼에 저장
        // uploadStore.ts에서 파일 읽을 때 이미 정규화된 헤더와 데이터에 추가되었으므로
        // rowObj["공급단가"]에서 직접 값을 가져올 수 있음
        let supplyPrice: number | null = null;
        const supplyPriceValue = rowObj["공급단가"];
        
        // 값 파싱 및 저장
        if (supplyPriceValue !== null && supplyPriceValue !== undefined && supplyPriceValue !== "") {
          // 문자열인 경우 쉼표 제거 후 파싱
          const cleanedValue = typeof supplyPriceValue === "string" 
            ? String(supplyPriceValue).replace(/,/g, "").trim()
            : String(supplyPriceValue);
          
          const parsedValue = parseFloat(cleanedValue);
          
          if (!isNaN(parsedValue) && parsedValue > 0) {
            supplyPrice = Math.round(parsedValue);
            if (index < 3) {
              console.log(`✅ [공급단가] 저장 성공: 원본값="${supplyPriceValue}", 파싱값=${parsedValue}, 저장값=${supplyPrice}`);
            }
          } else if (index < 3) {
            console.warn(`⚠️ [공급단가] 파싱 실패: 원본값="${supplyPriceValue}", cleanedValue="${cleanedValue}", parsedValue=${parsedValue}`);
          }
        } else if (supplyPriceIdx !== -1 && index < 3) {
          console.warn(`⚠️ [공급단가] 값이 비어있음:`, {
            정규화인덱스: supplyPriceIdx,
            rowObj공급단가: rowObj["공급단가"],
            rowObj키목록: Object.keys(rowObj).slice(0, 20)
          });
        }
        
        return sql`
          INSERT INTO upload_rows (upload_id, row_data, shop_name, company_id, mall_id, vendor_name, row_order, user_id, sabang_code, supply_price, created_at)
          VALUES (
            ${uploadId},
            ${JSON.stringify(rowObj)},
            ${shopName},
            ${companyId},
            ${rowMallId},
            ${rowVendorNameToSave},
            ${originalRowOrder},
            ${fileUserId},
            ${sabangCode},
            ${supplyPrice},
            ${koreaTime.toISOString()}::timestamp
          )
          RETURNING id, mall_id, vendor_name, row_order, user_id, sabang_code, supply_price
        `;
      });

      const rowResults = await Promise.all(insertPromises);

      // 저장 후 검증: 실제로 저장된 값 확인
      if (rowResults.length > 0) {
        const firstRowResult = rowResults[0][0];
        console.log(
          `✅ upload_rows 저장 완료: 첫 번째 row - id=${firstRowResult.id}, mall_id=${firstRowResult.mall_id}, vendor_name="${firstRowResult.vendor_name}", user_id=${firstRowResult.user_id}`
        );

        // 전체 저장된 row 중 mall_id가 있는지 확인
        const savedMallIds = rowResults
          .map((r: any) => r[0].mall_id)
          .filter((id: any) => id !== null);
        console.log(
          `📊 저장 통계: 총 ${rowResults.length}개 row 중 ${savedMallIds.length}개에 mall_id가 설정됨`
        );

        if (savedMallIds.length === 0 && vendorName) {
          console.error(
            `❌ 경고: vendor_name="${vendorName}"이 있지만 mall_id가 저장되지 않았습니다!`
          );
        }

        // DB에서 실제로 저장된 값 다시 조회하여 검증
        try {
          const verifyResult = await sql`
            SELECT id, mall_id, vendor_name, user_id 
            FROM upload_rows 
            WHERE upload_id = ${uploadId} 
            LIMIT 5
          `;
          console.log(
            `🔍 DB 검증 결과 (upload_id=${uploadId}):`,
            verifyResult.map((r: any) => ({
              id: r.id,
              mall_id: r.mall_id,
              vendor_name: r.vendor_name,
              user_id: r.user_id,
            }))
          );

          // user_id 검증
          const savedUserIds = verifyResult
            .map((r: any) => r.user_id)
            .filter((id: any) => id !== null);
          console.log(
            `📊 user_id 저장 통계: 총 ${verifyResult.length}개 row 중 ${savedUserIds.length}개에 user_id가 설정됨 (예상: ${fileUserId})`
          );

          if (savedUserIds.length === 0 && fileUserId) {
            console.error(
              `❌ 경고: fileUserId=${fileUserId}이 있지만 upload_rows에 user_id가 저장되지 않았습니다!`
            );
          }
        } catch (error) {
          console.error("DB 검증 쿼리 실패:", error);
        }
      }

      results.push({
        uploadId,
        fileName: file.file_name,
        rowCount: rowObjects.length,
        rowIds: rowResults.map((r) => r[0].id),
        mallId: mallId, // 결과에 mall_id 포함
        vendorName: vendorName, // 결과에 vendor_name 포함
      });
    }

    // 확인된 임시 저장 데이터 삭제 (company_id, user_id 필터링)
    const confirmedFileIds = confirmedFiles.map((f) => f.file_id);
    if (confirmedFileIds.length > 0) {
      if (userId && hasUserIdColumn) {
        await sql`
          DELETE FROM temp_files
          WHERE file_id = ANY(${confirmedFileIds}) AND company_id = ${companyId} AND user_id = ${userId}
        `;
      } else {
        await sql`
          DELETE FROM temp_files
          WHERE file_id = ANY(${confirmedFileIds}) AND company_id = ${companyId}
        `;
      }
    }

    return NextResponse.json({
      success: true,
      savedCount: results.length,
      totalRows: results.reduce((sum, r) => sum + r.rowCount, 0),
      uploads: results,
      message: `${results.length}개 파일이 정식으로 저장되고 임시 데이터가 삭제되었습니다.`,
    });
  } catch (error: any) {
    console.error("임시 데이터 확정 및 저장 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
