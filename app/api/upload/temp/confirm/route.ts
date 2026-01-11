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
          vendor_name
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
          vendor_name
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

    // 모든 업체명 추출하여 내부코드 일괄 생성
    const allVendorNames: string[] = [];
    confirmedFiles.forEach((file) => {
      const tableData = file.table_data;
      if (!tableData || !Array.isArray(tableData) || tableData.length < 2) {
        return;
      }

      const headerRow = tableData[0];
      const vendorIdx = headerRow.findIndex(
        (h: any) => h === "업체명" || h === "업체"
      );

      if (vendorIdx === -1) {
        // 업체명 컬럼이 없으면 빈 문자열
        const rowCount = tableData.length - 1;
        for (let i = 0; i < rowCount; i++) {
          allVendorNames.push("");
        }
      } else {
        // 각 row의 업체명 추출
        tableData.slice(1).forEach((row: any[]) => {
          const vendorName = String(row[vendorIdx] || "").trim();
          allVendorNames.push(vendorName);
        });
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

    for (const file of confirmedFiles) {
      const tableData = file.table_data;
      const productCodeMap = file.product_code_map || {};
      const productIdMap = file.product_id_map || {};

      if (!tableData || !Array.isArray(tableData) || tableData.length < 2) {
        console.warn(`파일 ${file.file_name}의 데이터가 비어있습니다.`);
        continue;
      }

      // 헤더와 데이터 행 분리
      const headerRow = tableData[0];
      const dataRows = tableData.slice(1);

      // 상품명 인덱스 찾기
      const nameIdx = headerRow.findIndex(
        (h: any) => h && typeof h === "string" && h.includes("상품명")
      );

      // 배송메시지 자동 생성을 위해 원본 메시지 저장
      const originalMessagesRef: {[rowIdx: number]: string} = {};

      // 배송메시지 자동 생성 적용
      const updatedTableData = generateAutoDeliveryMessage(
        tableData,
        originalMessagesRef
      );
      const updatedDataRows = updatedTableData.slice(1);

      // 배열을 객체로 변환 (헤더를 키로 사용)
      const rowObjects = updatedDataRows.map((row: any[], rowIndex: number) => {
        const rowObj: any = {};
        headerRow.forEach((header: string, index: number) => {
          rowObj[header] =
            row[index] !== undefined && row[index] !== null ? row[index] : "";
        });

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

        return rowObj;
      });

      // 업체명 확인 및 디버깅
      // file.vendor_name이 없으면 table_data에서 업체명 추출
      let vendorName = file.vendor_name || null;
      
      if (!vendorName || vendorName.trim() === "") {
        // table_data에서 업체명 추출
        const vendorIdx = headerRow.findIndex(
          (h: any) => h === "업체명" || h === "업체"
        );
        
        if (vendorIdx !== -1 && dataRows.length > 0 && dataRows[0][vendorIdx]) {
          vendorName = String(dataRows[0][vendorIdx]).trim();
          console.log(`📝 file.vendor_name이 없어서 table_data에서 업체명 추출: "${vendorName}"`);
        } else if (rowObjects.length > 0 && rowObjects[0]["업체명"]) {
          vendorName = String(rowObjects[0]["업체명"]).trim();
          console.log(`📝 file.vendor_name이 없어서 rowObjects에서 업체명 추출: "${vendorName}"`);
        } else {
          console.warn(`⚠️ 업체명을 찾을 수 없습니다. file.vendor_name: ${file.vendor_name}, vendorIdx: ${vendorIdx}`);
        }
      }
      
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

      // 업체명으로 mall 테이블에서 해당 mall 찾기 (uploads 저장 전에 미리 찾기)
      let mallId: number | null = null;
      if (vendorName) {
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
            console.log(`✅ 업체명 "${trimmedVendorName}"에 해당하는 mall 찾음: mall_id=${mallId}, mall_name="${mallResult[0].name}"`);
          } else {
            // 대소문자 구분 없이 매칭 시도
            mallResult = await sql`
              SELECT id, name FROM mall 
              WHERE LOWER(TRIM(name)) = LOWER(${trimmedVendorName})
              LIMIT 1
            `;
            
            if (mallResult.length > 0) {
              mallId = mallResult[0].id;
              console.log(`✅ 업체명 "${trimmedVendorName}"에 해당하는 mall 찾음 (대소문자 무시): mall_id=${mallId}, mall_name="${mallResult[0].name}"`);
            } else {
              console.warn(`⚠️ 업체명 "${trimmedVendorName}"에 해당하는 mall을 찾을 수 없습니다.`);
              // mall 테이블의 모든 name 목록 출력 (디버깅용)
              const allMalls = await sql`SELECT id, name FROM mall ORDER BY name LIMIT 20`;
              console.log("mall 테이블 샘플 (처음 20개):", allMalls.map((m: any) => ({id: m.id, name: m.name})));
            }
          }
        } catch (error) {
          console.error("mall 조회 실패:", error);
        }
      } else {
        console.warn("⚠️ vendor_name이 없습니다. file.vendor_name:", file.vendor_name);
      }
      
      console.log(`📝 저장 전 확인: vendorName="${vendorName}", mallId=${mallId}`);

      // uploads 테이블에 저장 (vendor_name 포함)
      const uploadResult = await sql`
        INSERT INTO uploads (file_name, row_count, data, company_id, vendor_name, created_at)
        VALUES (
          ${file.file_name},
          ${rowObjects.length},
          ${JSON.stringify(rowObjects)},
          ${companyId},
          ${vendorName},
          ${koreaTime.toISOString()}::timestamp
        )
        RETURNING id, created_at
      `;

      const uploadId = uploadResult[0].id;
      const createdAt = uploadResult[0].created_at;
      console.log(`✅ uploads 저장 완료: upload_id=${uploadId}, vendor_name=${vendorName}`);

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

      // 각 행을 upload_rows에 저장 (객체 형태로)
      const insertPromises = rowObjects.map((rowObj: any, index: number) => {
        // 쇼핑몰명 추출 (여러 가능한 키에서 찾기)
        const shopName =
          rowObj["쇼핑몰명"] || rowObj["쇼핑몰명(1)"] || rowObj["쇼핑몰"] || "";

        // 첫 번째 row만 상세 로그 출력
        if (index === 0) {
          console.log(`📝 upload_rows 저장 시작: upload_id=${uploadId}, mall_id=${mallId}, vendor_name="${vendorName}"`);
        }

        return sql`
          INSERT INTO upload_rows (upload_id, row_data, shop_name, company_id, mall_id, vendor_name, created_at)
          VALUES (
            ${uploadId},
            ${JSON.stringify(rowObj)},
            ${shopName},
            ${companyId},
            ${mallId},
            ${vendorName},
            ${koreaTime.toISOString()}::timestamp
          )
          RETURNING id, mall_id, vendor_name
        `;
      });

      const rowResults = await Promise.all(insertPromises);
      
      // 저장 후 검증: 실제로 저장된 값 확인
      if (rowResults.length > 0) {
        const firstRowResult = rowResults[0][0];
        console.log(`✅ upload_rows 저장 완료: 첫 번째 row - id=${firstRowResult.id}, mall_id=${firstRowResult.mall_id}, vendor_name="${firstRowResult.vendor_name}"`);
        
        // 전체 저장된 row 중 mall_id가 있는지 확인
        const savedMallIds = rowResults.map((r: any) => r[0].mall_id).filter((id: any) => id !== null);
        console.log(`📊 저장 통계: 총 ${rowResults.length}개 row 중 ${savedMallIds.length}개에 mall_id가 설정됨`);
        
        if (savedMallIds.length === 0 && vendorName) {
          console.error(`❌ 경고: vendor_name="${vendorName}"이 있지만 mall_id가 저장되지 않았습니다!`);
        }
        
        // DB에서 실제로 저장된 값 다시 조회하여 검증
        try {
          const verifyResult = await sql`
            SELECT id, mall_id, vendor_name 
            FROM upload_rows 
            WHERE upload_id = ${uploadId} 
            LIMIT 5
          `;
          console.log(`🔍 DB 검증 결과 (upload_id=${uploadId}):`, verifyResult.map((r: any) => ({
            id: r.id,
            mall_id: r.mall_id,
            vendor_name: r.vendor_name
          })));
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
