import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import * as XLSX from "xlsx";
import {getCompanyIdFromRequest} from "@/lib/company";

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
      `사방넷 엑셀 파일 처리 시작: ${file.name} (${(file.size / 1024 / 1024).toFixed(
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
        // 경고만 출력하고 기본 옵션으로 재시도
        console.warn("Excel 파일 압축 경고 (재시도):", readError.message);
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

    // A열과 B열만 읽기 (header: 1로 설정하면 첫 행부터 데이터로 읽음)
    const raw = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      raw: false,
    }) as any[][];

    if (!raw.length || raw[0].length === 0) {
      return NextResponse.json(
        {success: false, error: "파일이 비어있습니다."},
        {status: 400}
      );
    }

    // A열(인덱스 0)과 B열(인덱스 1) 추출
    // 첫 행이 헤더일 수도 있으므로, 빈 행은 제외하고 데이터만 추출
    const sabangnetData: Array<{sabangCode: string; internalCode: string}> =
      [];

    for (let i = 0; i < raw.length; i++) {
      const row = raw[i];
      const sabangCode = row[0] ? String(row[0]).trim() : ""; // A열
      const internalCode = row[1] ? String(row[1]).trim() : ""; // B열

      // 둘 다 값이 있어야 유효한 데이터
      if (sabangCode && internalCode) {
        sabangnetData.push({
          sabangCode,
          internalCode,
        });
      }
    }

    if (sabangnetData.length === 0) {
      return NextResponse.json(
        {success: false, error: "유효한 데이터가 없습니다. A열과 B열에 데이터가 있는지 확인해주세요."},
        {status: 400}
      );
    }

    console.log(`사방넷 데이터 추출 완료: ${sabangnetData.length}개 항목`);

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

    // 내부코드 목록 추출
    const internalCodes = sabangnetData.map((d) => d.internalCode);

    // 내부코드를 키로 하는 맵 생성
    const sabangnetMap = new Map<string, string>();
    sabangnetData.forEach((d) => {
      sabangnetMap.set(d.internalCode, d.sabangCode);
    });

    // uploads 테이블의 data 배열에서 내부코드 매칭하여 upload_id 찾기
    // JSONB 배열에서 내부코드를 검색
    const matchingUploads = await sql`
      SELECT u.id as upload_id, u.data
      FROM uploads u
      WHERE u.company_id = ${companyId}
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(u.data) AS row
          WHERE row->>'내부코드' = ANY(${internalCodes})
        )
    `;

    console.log(
      `내부코드 매칭 결과: ${matchingUploads.length}개 업로드 파일 발견 (전체 ${sabangnetData.length}개 항목 중)`
    );

    // 각 upload의 data 배열을 순회하며 내부코드 매칭 및 업데이트
    let updatedCount = 0;
    const updatePromises = matchingUploads.map(async (upload: any) => {
      const uploadId = upload.upload_id;
      const dataArray = upload.data || [];
      
      // data 배열에서 내부코드가 매칭되는 항목 찾기
      let hasUpdates = false;
      const updatedDataArray = dataArray.map((row: any) => {
        const internalCode = String(row["내부코드"] || "").trim();
        
        if (internalCode && sabangnetMap.has(internalCode)) {
          const sabangCode = sabangnetMap.get(internalCode)!;
          hasUpdates = true;
          return {
            ...row,
            sabang_code: sabangCode,
          };
        }
        return row;
      });

      // 업데이트가 있으면 uploads 테이블의 data 업데이트
      if (hasUpdates) {
        await sql`
          UPDATE uploads
          SET data = ${JSON.stringify(updatedDataArray)}
          WHERE id = ${uploadId}
        `;

        // 해당 upload_id를 가진 모든 upload_rows도 업데이트
        const uploadRows = await sql`
          SELECT ur.id, ur.row_data
          FROM upload_rows ur
          WHERE ur.upload_id = ${uploadId}
        `;

        for (const row of uploadRows) {
          const rowData = row.row_data || {};
          const internalCode = String(rowData["내부코드"] || "").trim();

          if (internalCode && sabangnetMap.has(internalCode)) {
            const sabangCode = sabangnetMap.get(internalCode)!;

            // row_data에 sabang_code 추가
            const updatedRowData = {
              ...rowData,
              sabang_code: sabangCode,
            };

            // upload_rows 테이블의 sabang_code 컬럼과 row_data 업데이트
            await sql`
              UPDATE upload_rows
              SET sabang_code = ${sabangCode},
                  row_data = ${JSON.stringify(updatedRowData)}
              WHERE id = ${row.id}
            `;

            updatedCount++;
          }
        }
      }
    });

    await Promise.all(updatePromises);

    console.log(`✅ 사방넷 코드 업데이트 완료: ${updatedCount}개 행 업데이트됨`);

    return NextResponse.json({
      success: true,
      message: `사방넷 코드 업로드가 완료되었습니다.`,
      updatedCount,
      totalItems: sabangnetData.length,
      matchedUploads: matchingUploads.length,
    });
  } catch (error: any) {
    console.error("사방넷 파일 업로드 실패:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "사방넷 파일 업로드 중 오류가 발생했습니다.",
      },
      {status: 500}
    );
  }
}
