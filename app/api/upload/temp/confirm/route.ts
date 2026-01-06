import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {generateUniqueCodesForVendors} from "@/utils/internalCode";
import {generateAutoDeliveryMessage} from "@/utils/vendorMessageUtils";

export async function POST(request: NextRequest) {
  try {
    // 확인된 모든 임시 파일들을 조회 (세션 구분 없음)
    const confirmedFiles = await sql`
      SELECT 
        file_id,
        file_name,
        row_count,
        table_data,
        header_index,
        product_code_map,
        product_id_map
      FROM temp_files
      WHERE is_confirmed = true
      ORDER BY created_at ASC
    `;

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

        // 매핑코드 추가 (productCodeMap에서 가져오기)
        if (nameIdx !== -1) {
          const productName = String(row[nameIdx] || "").trim();
          if (productName && productCodeMap[productName]) {
            rowObj["매핑코드"] = productCodeMap[productName];
          }
        }

        // 내부코드 추가
        if (internalCodes.length > globalCodeIndex) {
          rowObj["내부코드"] = internalCodes[globalCodeIndex];
        }
        globalCodeIndex++;

        return rowObj;
      });

      console.log("💾 저장할 데이터 샘플:", {
        fileName: file.file_name,
        rowCount: rowObjects.length,
        sampleRow: rowObjects[0],
        hasInternalCode: !!rowObjects[0]?.["내부코드"],
        hasMappingCode: !!rowObjects[0]?.["매핑코드"],
      });

      // uploads 테이블에 저장
      const uploadResult = await sql`
        INSERT INTO uploads (file_name, row_count, data, created_at)
        VALUES (
          ${file.file_name},
          ${rowObjects.length},
          ${JSON.stringify(rowObjects)},
          ${koreaTime.toISOString()}::timestamp
        )
        RETURNING id, created_at
      `;

      const uploadId = uploadResult[0].id;
      const createdAt = uploadResult[0].created_at;

      // 각 행을 upload_rows에 저장 (객체 형태로)
      const insertPromises = rowObjects.map((rowObj: any) => {
        // 쇼핑몰명 추출 (여러 가능한 키에서 찾기)
        const shopName =
          rowObj["쇼핑몰명"] || rowObj["쇼핑몰명(1)"] || rowObj["쇼핑몰"] || "";

        return sql`
          INSERT INTO upload_rows (upload_id, row_data, shop_name, created_at)
          VALUES (
            ${uploadId},
            ${JSON.stringify(rowObj)},
            ${shopName},
            ${koreaTime.toISOString()}::timestamp
          )
          RETURNING id
        `;
      });

      const rowResults = await Promise.all(insertPromises);

      results.push({
        uploadId,
        fileName: file.file_name,
        rowCount: rowObjects.length,
        rowIds: rowResults.map((r) => r[0].id),
      });
    }

    // 확인된 임시 저장 데이터 삭제
    const confirmedFileIds = confirmedFiles.map((f) => f.file_id);
    if (confirmedFileIds.length > 0) {
      await sql`
        DELETE FROM temp_files
        WHERE file_id = ANY(${confirmedFileIds})
      `;
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
