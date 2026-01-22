import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {generateUniqueCodesForVendors} from "@/utils/internalCode";
import {generateAutoDeliveryMessage} from "@/utils/vendorMessageUtils";
import {getCompanyIdFromRequest, getUserIdFromRequest} from "@/lib/company";

export async function POST(request: NextRequest) {
  try {
    // 요청 body에서 fileIds 추출 (클라이언트에서 전달한 저장할 파일 ID 목록)
    let requestFileIds: string[] = [];
    try {
      const body = await request.json();
      if (body.fileIds && Array.isArray(body.fileIds)) {
        requestFileIds = body.fileIds;
      }
    } catch (error) {
      // body가 없거나 파싱 실패하면 빈 배열 사용
    }

    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400}
      );
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
    }

    // user_id 추출 (헤더에서 먼저 시도)
    let userId = await getUserIdFromRequest(request);

    // user_id가 없으면 에러 반환 (다른 사용자의 파일을 저장하지 않도록)
    if (!userId && hasUserIdColumn) {
      return NextResponse.json(
        {
          success: false,
          error: "user_id가 필요합니다. 로그인 후 다시 시도해주세요.",
        },
        {status: 400}
      );
    }

    // temp_files에서 user_id를 가져와서 검증 (헤더의 user_id와 일치하는지 확인용)
    // 주의: 다른 사용자의 user_id를 가져와서 사용하지 않도록 제거
    // 기존 로직 제거: temp_files에서 임의의 user_id를 가져오는 것은 보안상 위험

    // user grade 확인 (온라인인지 확인)
    let userGrade: string | null = null;

    // user grade 조회
    if (userId && companyId) {
      try {
        const userResult = await sql`
          SELECT grade
          FROM users
          WHERE id = ${userId} AND company_id = ${companyId}
        `;

        if (userResult.length > 0) {
          userGrade = userResult[0].grade;
          console.log(
            `🔍 [userGrade 확인] userGrade=${userGrade}, userId=${userId}, companyId=${companyId}`
          );
        } else {
          console.warn(
            `🔍 [userGrade 확인] 사용자를 찾을 수 없음: userId=${userId}, companyId=${companyId}`
          );
        }
      } catch (error) {
        console.error("사용자 정보 조회 실패:", error);
      }
    } else {
      console.warn(
        `🔍 [userGrade 확인] userId 또는 companyId가 없음: userId=${userId}, companyId=${companyId}`
      );
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

        // 인덱스 생성
        await sql`
          CREATE INDEX IF NOT EXISTS idx_upload_rows_mall_id ON upload_rows(mall_id)
        `;
      }
    } catch (error) {
      console.error("mall_id 컬럼 확인/추가 실패:", error);
    }

    // 확인된 임시 파일들을 조회 (세션 구분 없음, company_id, user_id 필터링)
    // 중요: 클라이언트에서 전달한 fileIds가 있으면 해당 파일만 조회하고, 항상 user_id로 필터링
    let confirmedFiles;

    // fileIds가 전달되었고 user_id가 있는 경우: 해당 파일만 조회 (가장 안전한 방법)
    if (requestFileIds.length > 0 && userId && hasUserIdColumn) {
      console.log(
        `📋 [confirm] 클라이언트에서 전달된 fileIds로 조회: ${requestFileIds.length}개, userId=${userId}`
      );
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
        WHERE file_id = ANY(${requestFileIds}) 
          AND is_confirmed = true 
          AND company_id = ${companyId} 
          AND user_id = ${userId}
        ORDER BY created_at ASC
      `;
    } else if (userId && hasUserIdColumn) {
      // fileIds가 없지만 user_id가 있는 경우: 해당 사용자의 모든 확인된 파일 조회
      console.log(`📋 [confirm] user_id로 필터링하여 조회: userId=${userId}`);
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
    } else if (requestFileIds.length > 0) {
      // user_id 컬럼이 없지만 fileIds가 있는 경우: 해당 파일만 조회 (하위 호환성)
      console.log(
        `📋 [confirm] fileIds만으로 조회 (user_id 컬럼 없음): ${requestFileIds.length}개`
      );
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
          NULL as user_id
        FROM temp_files
        WHERE file_id = ANY(${requestFileIds}) 
          AND is_confirmed = true 
          AND company_id = ${companyId}
        ORDER BY created_at ASC
      `;
    } else {
      // user_id도 없고 fileIds도 없는 경우: 에러 반환 (다른 사용자 파일 저장 방지)
      console.error(`❌ [confirm] user_id와 fileIds가 모두 없어 저장 불가`);
      return NextResponse.json(
        {
          success: false,
          error: "저장할 파일을 식별할 수 없습니다. 다시 시도해주세요.",
        },
        {status: 400}
      );
    }

    if (confirmedFiles.length === 0) {
      return NextResponse.json(
        {success: false, error: "확인된 파일이 없습니다."},
        {status: 400}
      );
    }

    // 한국 시간(KST) 생성
    const koreaTime = new Date(Date.now() + 9 * 60 * 60 * 1000);

    // 각 행의 mall_id를 찾아서 내부코드 생성에 사용
    // 온라인 유저의 경우: 각 행의 업체명/쇼핑몰명 컬럼 값을 사용하여 mall_id 찾기
    // 일반 유저의 경우: 파일 레벨의 vendor_name을 사용하여 mall_id 찾기
    const allMallIds: (number | null)[] = [];
    const isOnlineUserForInternalCode =
      userGrade === "온라인" || String(userGrade || "").trim() === "온라인";

    // mall 조회를 위한 캐시 (성능 최적화)
    const mallCache: {[key: string]: number | null} = {};

    // 각 행의 mall_id를 찾는 헬퍼 함수
    const findMallIdForRow = async (
      vendorName: string,
      fileMallId: number | null
    ): Promise<number | null> => {
      if (!vendorName || vendorName.trim() === "") {
        return fileMallId;
      }

      const trimmedVendorName = vendorName.trim();

      // 캐시에서 먼저 확인
      if (mallCache.hasOwnProperty(trimmedVendorName)) {
        return mallCache[trimmedVendorName];
      }

      // 파일 레벨 mall_id가 있으면 우선 사용
      if (fileMallId) {
        mallCache[trimmedVendorName] = fileMallId;
        return fileMallId;
      }

      // DB에서 조회
      try {
        // 정확한 매칭 시도
        let mallResult = await sql`
          SELECT id, name FROM mall 
          WHERE name = ${trimmedVendorName}
          LIMIT 1
        `;

        if (mallResult.length > 0) {
          const foundMallId = mallResult[0].id;
          mallCache[trimmedVendorName] = foundMallId;
          return foundMallId;
        }

        // 대소문자 구분 없이 매칭 시도
        mallResult = await sql`
          SELECT id, name FROM mall 
          WHERE LOWER(TRIM(name)) = LOWER(${trimmedVendorName})
          LIMIT 1
        `;

        if (mallResult.length > 0) {
          const foundMallId = mallResult[0].id;
          mallCache[trimmedVendorName] = foundMallId;
          return foundMallId;
        }

        // 찾지 못한 경우 null 저장
        mallCache[trimmedVendorName] = null;
        return null;
      } catch (error) {
        console.error("mall 조회 실패:", error);
        mallCache[trimmedVendorName] = null;
        return null;
      }
    };

    // 각 파일의 행별로 mall_id 찾기
    for (const file of confirmedFiles) {
      const tableData = file.table_data;
      if (!tableData || !Array.isArray(tableData) || tableData.length < 2) {
        continue;
      }

      const headerRow = tableData[0];
      const fileVendorName = file.vendor_name || null;
      const fileMallId = file.mall_id || null;

      // 파일 레벨 mall_id가 없으면 vendor_name으로 찾기
      let resolvedFileMallId = fileMallId;
      if (!resolvedFileMallId && fileVendorName) {
        resolvedFileMallId = await findMallIdForRow(fileVendorName, null);
      }

      // 온라인 유저인 경우: 각 행의 업체명/쇼핑몰명을 사용
      if (isOnlineUserForInternalCode) {
        // 업체명 또는 쇼핑몰명 컬럼 인덱스 찾기
        const vendorIdx = headerRow.findIndex(
          (h: any) =>
            h &&
            typeof h === "string" &&
            (h === "업체명" || h === "업체" || h.includes("업체명"))
        );

        const shopNameIdx = headerRow.findIndex(
          (h: any) =>
            h &&
            typeof h === "string" &&
            (h === "쇼핑몰명" ||
              h === "쇼핑몰명(1)" ||
              h === "쇼핑몰" ||
              h.includes("쇼핑몰명"))
        );

        // 데이터 행 순회하면서 각 행의 업체명으로 mall_id 찾기
        for (let i = 1; i < tableData.length; i++) {
          const dataRow = tableData[i];
          let rowVendorName = "";

          // 1순위: 업체명 컬럼
          if (vendorIdx !== -1 && dataRow[vendorIdx]) {
            rowVendorName = String(dataRow[vendorIdx]).trim();
          }
          // 2순위: 쇼핑몰명 컬럼 (업체명이 없는 경우)
          if (!rowVendorName && shopNameIdx !== -1 && dataRow[shopNameIdx]) {
            rowVendorName = String(dataRow[shopNameIdx]).trim();
          }
          // 3순위: 파일 레벨 vendor_name (fallback)
          if (!rowVendorName && fileVendorName) {
            rowVendorName = String(fileVendorName).trim();
          }

          // 해당 행의 mall_id 찾기
          const rowMallId = await findMallIdForRow(
            rowVendorName || "",
            resolvedFileMallId
          );
          allMallIds.push(rowMallId);
        }
      } else {
        // 일반 유저: 파일 레벨 vendor_name 사용
        const rowCount = tableData.length - 1; // 헤더 제외한 데이터 행 개수

        // 각 행에 대해 동일한 mall_id 사용
        for (let i = 0; i < rowCount; i++) {
          allMallIds.push(resolvedFileMallId);
        }
      }
    }

    // 내부코드 일괄 생성
    let internalCodes: string[] = [];
    if (allMallIds.length > 0) {
      try {
        internalCodes = await generateUniqueCodesForVendors(
          companyId,
          allMallIds
        );
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

      // 상품명 인덱스 찾기
      const nameIdx = headerRow.findIndex(
        (h: any) => h && typeof h === "string" && h.includes("상품명")
      );

      // 원본 순서 인덱스 컬럼 찾기 (_originalRowIndex)
      const originalRowIndexIdx = headerRow.findIndex(
        (h: any) => h && typeof h === "string" && h === "_originalRowIndex"
      );

      // 배송메시지 인덱스 찾기 (내부코드 추가용)
      const messageIdx = headerRow.findIndex(
        (h: any) =>
          h &&
          typeof h === "string" &&
          (h === "배송메시지" ||
            h === "배송메세지" ||
            h === "배송요청" ||
            h === "요청사항" ||
            h === "배송요청사항")
      );

      // user grade가 "온라인"인 경우 "주문번호(사방넷)" 헤더 찾기
      const isOnlineUser =
        userGrade === "온라인" || String(userGrade || "").trim() === "온라인";
      const sabangnetOrderNumberIdx = isOnlineUser
        ? headerRow.findIndex(
            (h: any) =>
              h &&
              typeof h === "string" &&
              (h === "주문번호(사방넷)" ||
                h.includes("주문번호(사방넷)") ||
                h === "주문번호(사방넷)" ||
                h.replace(/\s+/g, "") ===
                  "주문번호(사방넷)".replace(/\s+/g, ""))
          )
        : -1;

      // sabang_code 디버깅: 헤더 발견 여부 확인
      console.log(`🔍 [sabang_code 디버깅] 헤더 찾기:`, {
        userGrade,
        isOnlineUser,
        sabangnetOrderNumberIdx,
        headerRowSample: headerRow.slice(0, 10),
      });

      if (isOnlineUser && sabangnetOrderNumberIdx !== -1) {
        console.log(
          `🔍 [sabang_code 디버깅] "주문번호(사방넷)" 헤더 발견: 인덱스 ${sabangnetOrderNumberIdx}`
        );
      } else if (isOnlineUser) {
        console.warn(
          `🔍 [sabang_code 디버깅] "주문번호(사방넷)" 헤더를 찾을 수 없음`
        );
      }

      // "공급단가" 헤더 찾기 (정규화된 헤더와 원본 헤더 모두에서 찾기)
      let supplyPriceIdx = headerRow.findIndex((h: any) => {
        if (!h || typeof h !== "string") return false;
        const headerStr = String(h).trim();
        return (
          headerStr === "공급단가" ||
          headerStr.includes("공급단가") ||
          headerStr.replace(/\s+/g, "") === "공급단가".replace(/\s+/g, "")
        );
      });

      // 정규화된 헤더에서 못 찾으면 원본 헤더에서 찾기
      if (
        supplyPriceIdx === -1 &&
        file.original_header &&
        Array.isArray(file.original_header)
      ) {
        const originalSupplyPriceIdx = file.original_header.findIndex(
          (h: any) => {
            if (!h || typeof h !== "string") return false;
            const headerStr = String(h).trim();
            return (
              headerStr === "공급단가" ||
              headerStr.includes("공급단가") ||
              headerStr.replace(/\s+/g, "") === "공급단가".replace(/\s+/g, "")
            );
          }
        );

        if (originalSupplyPriceIdx !== -1) {
          // 원본 헤더에서 찾았으면, 정규화된 헤더에서 해당 인덱스의 헤더 이름 찾기
          const originalHeaderName =
            file.original_header[originalSupplyPriceIdx];
          supplyPriceIdx = headerRow.findIndex(
            (h: any) => String(h).trim() === String(originalHeaderName).trim()
          );

          // 여전히 못 찾으면 원본 인덱스 사용 (데이터 행에서 직접 접근)
          if (supplyPriceIdx === -1) {
            supplyPriceIdx = originalSupplyPriceIdx;
          }
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

        // user grade가 "온라인"인 경우 주문번호 처리
        if (userGrade === "온라인") {
          // "주문번호(사방넷)" 값을 찾아서 "주문번호"에 저장하고 sabang_code에도 저장
          if (sabangnetOrderNumberIdx !== -1 && row[sabangnetOrderNumberIdx]) {
            const sabangnetOrderNumber = String(
              row[sabangnetOrderNumberIdx]
            ).trim();
            if (sabangnetOrderNumber) {
              rowObj["주문번호"] = sabangnetOrderNumber;
              rowObj["주문번호(사방넷)"] = sabangnetOrderNumber;
              // sabang_code도 함께 저장 (upload_rows 테이블의 sabang_code 컬럼에 저장하기 위해)
              rowObj["sabang_code"] = sabangnetOrderNumber;

              // 디버깅: 첫 3개 행만 로그 출력
              if (rowIndex < 3) {
                console.log(
                  `🔍 [sabang_code 디버깅] rowObjects 생성 시 주문번호 처리:`,
                  {
                    rowIndex: rowIndex + 1,
                    sabangnetOrderNumberIdx,
                    sabangnetOrderNumber,
                    주문번호: rowObj["주문번호"],
                    sabang_code: rowObj["sabang_code"],
                  }
                );
              }
            }
          } else if (rowIndex < 3) {
            console.warn(
              `🔍 [sabang_code 디버깅] rowObjects 생성 시 "주문번호(사방넷)" 헤더를 찾을 수 없음:`,
              {
                rowIndex: rowIndex + 1,
                sabangnetOrderNumberIdx,
                headerRow: headerRow,
              }
            );
          }
          // "주문번호(쇼핑몰)"는 제거
          if (rowObj["주문번호(쇼핑몰)"]) {
            delete rowObj["주문번호(쇼핑몰)"];
          }
        }

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
            }
          }
        }

        // 내부코드 추가
        let currentInternalCode = "";
        if (internalCodes.length > globalCodeIndex) {
          currentInternalCode = internalCodes[globalCodeIndex];
          rowObj["내부코드"] = currentInternalCode;
        }
        globalCodeIndex++;

        // 배송메시지에 ★내부코드 추가 (온라인 유저 제외)
        // - 온라인 유저: 업로드 시 이미 ★주문번호가 추가되어 있으므로 배송메시지 처리 스킵
        // - 일반 유저: confirm 시 ★내부코드 추가
        if (
          messageIdx !== -1 &&
          userGrade !== "온라인" &&
          currentInternalCode
        ) {
          const currentMessage =
            rowObj["배송메시지"] ||
            rowObj["배송메세지"] ||
            rowObj["배송요청"] ||
            rowObj["요청사항"] ||
            rowObj["배송요청사항"] ||
            "";
          let messageStr = String(currentMessage).trim();

          // 기존 ★ 이후 부분 제거 (이전에 추가된 ★ 코드 모두 제거)
          if (messageStr.includes("★")) {
            messageStr = messageStr.split("★")[0].trim();
          }

          // ★내부코드 추가
          const newMessage = messageStr
            ? `${messageStr}★${currentInternalCode}`
            : `★${currentInternalCode}`;

          // 해당하는 컬럼명에 저장
          if (rowObj["배송메시지"] !== undefined) {
            rowObj["배송메시지"] = newMessage;
          } else if (rowObj["배송메세지"] !== undefined) {
            rowObj["배송메세지"] = newMessage;
          } else if (rowObj["배송요청"] !== undefined) {
            rowObj["배송요청"] = newMessage;
          } else if (rowObj["요청사항"] !== undefined) {
            rowObj["요청사항"] = newMessage;
          } else if (rowObj["배송요청사항"] !== undefined) {
            rowObj["배송요청사항"] = newMessage;
          } else {
            // 컬럼이 없으면 "배송메시지"로 새로 추가
            rowObj["배송메시지"] = newMessage;
          }
        }

        // 업로드 시 부여된 row 순서 번호 추가 (1부터 시작)
        // _originalRowIndex 컬럼에서 원본 순서를 가져옴 (정렬이 발생해도 원본 순서 유지)
        // _originalRowIndex가 없으면 rowIndex + 1 사용 (하위 호환성)
        let originalRowOrder = rowIndex + 1;
        if (originalRowIndexIdx !== -1) {
          const originalRowIndexValue = row[originalRowIndexIdx];
          if (
            originalRowIndexValue !== undefined &&
            originalRowIndexValue !== null
          ) {
            const parsedValue = parseInt(String(originalRowIndexValue), 10);
            if (!isNaN(parsedValue) && parsedValue > 0) {
              originalRowOrder = parsedValue;
            }
          }
        }
        rowObj["순서번호"] = originalRowOrder;
        rowObj["rowOrder"] = originalRowOrder;

        // _originalRowIndex 컬럼은 row_data에 저장하지 않음 (내부용)
        delete rowObj["_originalRowIndex"];

        return rowObj;
      });

      // 업체명은 드롭다운에서 선택해야만 적용되도록 변경
      // 엑셀 파일에서 자동으로 읽어서 설정하지 않음
      // file.vendor_name만 사용 (드롭다운에서 선택한 값)
      let vendorName = file.vendor_name || null;

      // mall_id 찾기: temp_files에 저장된 mall_id를 우선 사용, 없으면 vendorName으로 찾기
      let mallId: number | null = file.mall_id || null;

      if (!mallId && vendorName) {
        try {
          const trimmedVendorName = vendorName.trim();

          // 정확한 매칭 시도
          let mallResult = await sql`
            SELECT id, name FROM mall 
            WHERE name = ${trimmedVendorName}
            LIMIT 1
          `;

          if (mallResult.length > 0) {
            mallId = mallResult[0].id;
          } else {
            // 대소문자 구분 없이 매칭 시도
            mallResult = await sql`
              SELECT id, name FROM mall 
              WHERE LOWER(TRIM(name)) = LOWER(${trimmedVendorName})
              LIMIT 1
            `;

            if (mallResult.length > 0) {
              mallId = mallResult[0].id;
            }
          }
        } catch (error) {
          console.error("mall 조회 실패:", error);
        }
      }

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
        }
      } catch (error) {
        console.error("uploads original_data 컬럼 확인/추가 실패:", error);
      }

      // temp_files의 user_id 가져오기
      const fileUserId = file.user_id ? parseInt(file.user_id, 10) : null;

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

      const uploadId = uploadResult[0].id;
      const createdAt = uploadResult[0].created_at;

      // uploads 테이블에 저장된 user_id 검증
      try {
        const verifyUpload = await sql`
          SELECT id, file_name, user_id 
          FROM uploads 
          WHERE id = ${uploadId}
        `;
        if (verifyUpload.length > 0) {
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
        }
      } catch (error) {
        console.error("upload_rows supply_price 컬럼 확인/추가 실패:", error);
      }

      // 각 행의 업체명으로 mall을 찾기 위한 캐시 (성능 최적화)
      const mallCache: {[key: string]: number | null} = {};

      // 헤더에서 업체명 컬럼 인덱스 찾기
      const vendorHeaderIdx = headerRow.findIndex(
        (h: any) =>
          h &&
          typeof h === "string" &&
          (h === "업체명" || h === "업체" || h.includes("업체명"))
      );
      const vendorHeaderKey =
        vendorHeaderIdx !== -1 ? headerRow[vendorHeaderIdx] : null;

      // 온라인 유저의 경우 쇼핑몰명 컬럼 인덱스도 찾기
      const shopNameHeaderIdx = isOnlineUser
        ? headerRow.findIndex(
            (h: any) =>
              h &&
              typeof h === "string" &&
              (h === "쇼핑몰명" ||
                h === "쇼핑몰명(1)" ||
                h === "쇼핑몰" ||
                h.includes("쇼핑몰명"))
          )
        : -1;
      const shopNameHeaderKey =
        shopNameHeaderIdx !== -1 ? headerRow[shopNameHeaderIdx] : null;

      // 각 행을 upload_rows에 저장 (객체 형태로, row_order 포함)
      const insertPromises = rowObjects.map(
        async (rowObj: any, index: number) => {
          // 쇼핑몰명 추출 (여러 가능한 키에서 찾기)
          const shopName =
            rowObj["쇼핑몰명"] ||
            rowObj["쇼핑몰명(1)"] ||
            rowObj["쇼핑몰"] ||
            "";

          // 각 행의 업체명 추출 (헤더 키 사용 또는 여러 가능한 키 시도)
          // 온라인 유저의 경우 쇼핑몰명도 고려
          let rowVendorName = "";

          // 1순위: 헤더에서 찾은 업체명 키 사용
          if (vendorHeaderKey && rowObj[vendorHeaderKey]) {
            rowVendorName = String(rowObj[vendorHeaderKey]).trim();
          }
          // 2순위: 원본 데이터 행에서 업체명 직접 추출 (vendorHeaderIdx 사용)
          else if (
            vendorHeaderIdx !== -1 &&
            updatedDataRows[index] &&
            updatedDataRows[index][vendorHeaderIdx]
          ) {
            rowVendorName = String(
              updatedDataRows[index][vendorHeaderIdx]
            ).trim();
          }
          // 3순위: 일반적인 업체명 키 이름 시도
          else {
            rowVendorName = String(
              rowObj["업체명"] || rowObj["업체"] || ""
            ).trim();
          }

          // 온라인 유저의 경우: 업체명이 없으면 쇼핑몰명 사용
          if (isOnlineUser && !rowVendorName) {
            if (shopNameHeaderKey && rowObj[shopNameHeaderKey]) {
              rowVendorName = String(rowObj[shopNameHeaderKey]).trim();
            } else if (
              shopNameHeaderIdx !== -1 &&
              updatedDataRows[index] &&
              updatedDataRows[index][shopNameHeaderIdx]
            ) {
              rowVendorName = String(
                updatedDataRows[index][shopNameHeaderIdx]
              ).trim();
            } else {
              rowVendorName = String(
                rowObj["쇼핑몰명"] ||
                  rowObj["쇼핑몰명(1)"] ||
                  rowObj["쇼핑몰"] ||
                  ""
              ).trim();
            }
          }

          // 여전히 없으면 파일 레벨 vendor_name 사용 (fallback)
          if (!rowVendorName && vendorName) {
            rowVendorName = String(vendorName).trim();
          }

          const trimmedRowVendorName = rowVendorName;

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

                if (!rowMallId && index < 5) {
                  // 처음 5개 행만 경고 로그 출력
                  console.warn(
                    `⚠️ 행 ${
                      index + 1
                    }: 업체명 "${trimmedRowVendorName}"에 해당하는 mall을 찾을 수 없습니다.`
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

          // 업로드 당시 원본 순서 사용 (rowObj에 이미 저장된 순서번호 사용)
          // 절대 index + 1을 사용하지 않고, 업로드 시 부여된 원본 순서를 사용
          const originalRowOrder =
            rowObj["rowOrder"] || rowObj["순서번호"] || index + 1;

          // user grade가 "온라인"인 경우 rowObj["주문번호"] 값을 sabang_code에 저장
          // uploads 테이블의 data에 저장된 "주문번호" 값을 upload_rows의 sabang_code 컬럼에 저장
          let sabangCode: string | null = null;

          // userGrade 확인 로그 (모든 행에 대해 첫 번째 행만 출력)
          // isOnlineUser는 이미 파일 처리 루프 상단(398줄)에서 선언됨
          if (index === 0) {
            console.log(`🔍 [sabang_code 디버깅] userGrade 확인:`, {
              userGrade,
              userGradeType: typeof userGrade,
              userGradeTrimmed: String(userGrade || "").trim(),
              isOnline: isOnlineUser,
              userId,
              companyId,
            });
          }

          if (isOnlineUser) {
            // 우선순위 1: rowObjects 생성 시점에서 이미 저장된 rowObj["sabang_code"] 확인
            if (
              rowObj["sabang_code"] !== undefined &&
              rowObj["sabang_code"] !== null
            ) {
              const sabangCodeValue = String(rowObj["sabang_code"]).trim();
              if (sabangCodeValue && sabangCodeValue !== "") {
                sabangCode = sabangCodeValue;
              }
            }

            // 우선순위 2: rowObj["주문번호"]에서 값을 가져오기 (빈 문자열도 확인)
            if (
              (!sabangCode || sabangCode === "") &&
              rowObj["주문번호"] !== undefined &&
              rowObj["주문번호"] !== null
            ) {
              const orderNumber = String(rowObj["주문번호"]).trim();
              if (orderNumber && orderNumber !== "") {
                sabangCode = orderNumber;
                // row_data에도 sabang_code 추가 (uploads 테이블의 data에도 저장됨)
                rowObj["sabang_code"] = sabangCode;
              }
            }

            // 우선순위 3: rowObj["주문번호(사방넷)"]에서 값을 가져오기
            if (
              (!sabangCode || sabangCode === "") &&
              rowObj["주문번호(사방넷)"] !== undefined &&
              rowObj["주문번호(사방넷)"] !== null
            ) {
              const sabangnetOrderNumber = String(
                rowObj["주문번호(사방넷)"]
              ).trim();
              if (sabangnetOrderNumber && sabangnetOrderNumber !== "") {
                sabangCode = sabangnetOrderNumber;
                // row_data에도 sabang_code 추가
                rowObj["sabang_code"] = sabangCode;
              }
            }

            // 디버깅: 첫 3개 행만 로그 출력
            if (index < 3) {
              if (sabangCode && sabangCode !== "") {
                console.log(`🔍 [sabang_code 디버깅] sabang_code 저장 성공:`, {
                  index: index + 1,
                  sabangCode,
                  rowObj주문번호: rowObj["주문번호"],
                  rowObj주문번호타입: typeof rowObj["주문번호"],
                  rowObj주문번호사방넷: rowObj["주문번호(사방넷)"],
                  rowObjSabangCode: rowObj["sabang_code"],
                });
              } else {
                console.warn(
                  `🔍 [sabang_code 디버깅] sabang_code가 비어있음:`,
                  {
                    index: index + 1,
                    rowObj주문번호: rowObj["주문번호"],
                    rowObj주문번호타입: typeof rowObj["주문번호"],
                    rowObj주문번호값: String(rowObj["주문번호"] || "").trim(),
                    rowObj주문번호사방넷: rowObj["주문번호(사방넷)"],
                    rowObjSabangCode: rowObj["sabang_code"],
                    rowObjKeys: Object.keys(rowObj).filter(
                      (k) => k.includes("주문") || k.includes("sabang")
                    ),
                    sabangnetOrderNumberIdx,
                    전체rowObj샘플: Object.keys(rowObj).slice(0, 10),
                  }
                );
              }
            }
          } else {
            // userGrade가 "온라인"이 아닌 경우 로그 출력 (첫 번째 행만)
            if (index === 0) {
              console.warn(
                `🔍 [sabang_code 디버깅] userGrade가 "온라인"이 아님:`,
                {
                  userGrade,
                  userGradeType: typeof userGrade,
                  userGradeTrimmed: String(userGrade || "").trim(),
                  isOnline: isOnlineUser,
                  userId,
                  companyId,
                }
              );
            }
          }

          // "공급단가" 헤더가 있으면 supply_price 컬럼에 저장
          // uploadStore.ts에서 파일 읽을 때 이미 정규화된 헤더와 데이터에 추가되었으므로
          // rowObj["공급단가"]에서 직접 값을 가져올 수 있음
          let supplyPrice: number | null = null;
          const supplyPriceValue = rowObj["공급단가"];

          // 값 파싱 및 저장
          if (
            supplyPriceValue !== null &&
            supplyPriceValue !== undefined &&
            supplyPriceValue !== ""
          ) {
            // 문자열인 경우 쉼표 제거 후 파싱
            const cleanedValue =
              typeof supplyPriceValue === "string"
                ? String(supplyPriceValue).replace(/,/g, "").trim()
                : String(supplyPriceValue);

            const parsedValue = parseFloat(cleanedValue);

            if (!isNaN(parsedValue) && parsedValue > 0) {
              supplyPrice = Math.round(parsedValue);
            }
          }

          // INSERT 직전 sabang_code 값 확인 (디버깅용)
          if (index < 3) {
            console.log(`🔍 [sabang_code 디버깅] INSERT 직전 확인:`, {
              index: index + 1,
              userGrade,
              sabangCode,
              sabangCodeType: typeof sabangCode,
              rowObj주문번호: rowObj["주문번호"],
              rowObj주문번호타입: typeof rowObj["주문번호"],
              rowObjSabangCode: rowObj["sabang_code"],
              isOnline: isOnlineUser,
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
        }
      );

      const rowResults = await Promise.all(insertPromises);

      // 저장 후 검증: sabang_code 저장 확인
      // isOnlineUser는 이미 파일 레벨에서 선언됨 (325줄)
      if (rowResults.length > 0 && isOnlineUser) {
        const firstRowResult = rowResults[0][0];
        console.log(`🔍 [sabang_code 디버깅] upload_rows 저장 후 검증:`, {
          uploadId,
          첫번째행sabang_code: firstRowResult.sabang_code,
          첫번째행id: firstRowResult.id,
        });

        // DB에서 실제로 저장된 sabang_code 확인
        try {
          const verifyResult = await sql`
            SELECT id, sabang_code, row_data->>'주문번호' as 주문번호
            FROM upload_rows 
            WHERE upload_id = ${uploadId} 
            LIMIT 5
          `;
          console.log(
            `🔍 [sabang_code 디버깅] DB 검증 결과:`,
            verifyResult.map((r: any) => ({
              id: r.id,
              sabang_code: r.sabang_code,
              주문번호: r.주문번호,
            }))
          );
        } catch (error) {
          console.error("sabang_code 검증 쿼리 실패:", error);
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
