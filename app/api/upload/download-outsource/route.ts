import sql from "@/lib/db";
import {NextRequest, NextResponse} from "next/server";
import {getCompanyIdFromRequest, getUserIdFromRequest} from "@/lib/company";
import * as Excel from "exceljs";
import {mapDataToTemplate, sortExcelData} from "@/utils/excelDataMapping";
import JSZip from "jszip";
import {
  buildFilterConditions,
  buildFilterQuery,
  UploadFilters,
} from "@/utils/uploadFilters";
import {generateExcelFileName, generateDatePrefix} from "@/utils/filename";
import {
  mapDataByColumnKey,
  getTemplateHeaderNames,
  mapRowToTemplateFormat,
} from "@/utils/purchaseTemplateMapping";

// 전화번호에 하이픈을 추가하여 형식 맞춤
function formatPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber || phoneNumber.length < 9) return phoneNumber;

  const numOnly = phoneNumber.replace(/\D/g, "");

  // 이미 하이픈이 제대로 되어 있는지 확인
  if (phoneNumber.includes("-")) {
    const parts = phoneNumber.split("-");
    if (parts.length === 3) {
      // 하이픈이 3부분으로 나뉘어 있는 경우 올바른 형식인지 확인
      const formatted = formatPhoneNumber(parts.join(""));
      if (formatted !== parts.join("")) {
        return formatted;
      }
      return phoneNumber; // 이미 올바른 형식이면 그대로 반환
    }
  }

  // 02 지역번호 (02-XXXX-XXXX)
  if (numOnly.startsWith("02")) {
    if (numOnly.length === 9) {
      // 02-XXX-XXXX
      return `${numOnly.slice(0, 2)}-${numOnly.slice(2, 5)}-${numOnly.slice(
        5
      )}`;
    } else if (numOnly.length === 10) {
      // 02-XXXX-XXXX
      return `${numOnly.slice(0, 2)}-${numOnly.slice(2, 6)}-${numOnly.slice(
        6
      )}`;
    }
  }
  // 휴대폰 및 기타 지역번호 (0XX-XXXX-XXXX)
  else if (numOnly.startsWith("0") && numOnly.length === 11) {
    // 010-XXXX-XXXX 등
    return `${numOnly.slice(0, 3)}-${numOnly.slice(3, 7)}-${numOnly.slice(7)}`;
  }
  // 0508 대역 (0508-XXXX-XXXX)
  else if (numOnly.startsWith("0508") && numOnly.length === 12) {
    // 0508-XXXX-XXXX
    return `${numOnly.slice(0, 4)}-${numOnly.slice(4, 8)}-${numOnly.slice(8)}`;
  }
  // 050X 대역 (050X-XXXX-XXXX) - 0508 제외
  else if (numOnly.startsWith("050") && numOnly.length === 12) {
    // 050X-XXXX-XXXX (0500, 0501, 0502, 0503, 0504, 0505, 0506, 0507, 0509)
    return `${numOnly.slice(0, 4)}-${numOnly.slice(4, 8)}-${numOnly.slice(8)}`;
  }

  // 기타 경우는 그대로 반환
  return phoneNumber;
}

// grade가 "온라인"인 경우 전화번호1에 공백 추가
function formatPhoneNumber1ForOnline(phoneNumber: string): string {
  if (!phoneNumber || phoneNumber.trim() === "") return phoneNumber;

  // 하이픈이 있는 경우: 첫 번째 하이픈 앞에 공백 추가
  if (phoneNumber.includes("-")) {
    const firstDashIndex = phoneNumber.indexOf("-");
    return (
      phoneNumber.slice(0, firstDashIndex) +
      " " +
      phoneNumber.slice(firstDashIndex)
    );
  }

  // 하이픈이 없는 경우: 앞번호 뒤에 공백 추가
  const numOnly = phoneNumber.replace(/\D/g, "");
  if (numOnly.length === 0) return phoneNumber;

  let prefixLength = 3; // 기본값: 3자리 (010 등)

  if (numOnly.startsWith("02")) {
    prefixLength = 2; // 02
  } else if (numOnly.startsWith("0508") || numOnly.startsWith("050")) {
    prefixLength = 4; // 0508, 050X
  } else if (numOnly.startsWith("0") && numOnly.length >= 11) {
    prefixLength = 3; // 010 등
  }

  const prefix = numOnly.slice(0, prefixLength);
  const suffix = numOnly.slice(prefixLength);

  return prefix + " " + suffix;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      templateId,
      rowIds,
      filters,
      rows,
      preferSabangName,
      useInternalCode = true,
    } = body;

    if (!templateId) {
      return NextResponse.json(
        {success: false, error: "템플릿 ID가 필요합니다."},
        {status: 400}
      );
    }

    // console.log("rows", rows);

    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400}
      );
    }

    // user_id 추출 및 grade 확인
    const userId = await getUserIdFromRequest(request);
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

    const isOnlineUser = userGrade === "온라인";

    // 템플릿 정보 조회 (company_id 필터링)
    const templateResult = await sql`
            SELECT template_data
            FROM upload_templates
            WHERE id = ${templateId} AND company_id = ${companyId}
          `;

    if (!templateResult.length) {
      return NextResponse.json(
        {success: false, error: "템플릿을 찾을 수 없습니다."},
        {status: 404}
      );
    }

    const templateData = templateResult[0].template_data;

    let headers = Array.isArray(templateData.headers)
      ? templateData.headers
      : [];

    // 상품명과 주소 헤더 사이에 빈 칼럼 추가
    const productNameIndex = headers.findIndex((h: any) => {
      const headerStr = typeof h === "string" ? h : String(h || "");
      return headerStr.includes("상품명");
    });
    const addressIndex = headers.findIndex((h: any) => {
      const headerStr = typeof h === "string" ? h : String(h || "");
      return headerStr.includes("주소") && !headerStr.includes("우편");
    });

    // 상품명이 주소보다 앞에 있고, 바로 다음이 아닌 경우에만 빈 칼럼 추가
    if (
      productNameIndex !== -1 &&
      addressIndex !== -1 &&
      productNameIndex < addressIndex &&
      addressIndex - productNameIndex === 1
    ) {
      headers = [
        ...headers.slice(0, addressIndex),
        "", // 빈 칼럼 추가
        ...headers.slice(addressIndex),
      ];
    }

    const columnOrder = Array.isArray(templateData.columnOrder)
      ? templateData.columnOrder
      : headers;

    const columnWidths =
      templateData.columnWidths && typeof templateData.columnWidths === "object"
        ? templateData.columnWidths
        : {};

    if (!columnOrder || columnOrder.length === 0) {
      return NextResponse.json(
        {success: false, error: "템플릿의 컬럼 순서가 설정되지 않았습니다."},
        {status: 400}
      );
    }

    const wb = new Excel.Workbook();
    // sheet 생성
    const sheet = wb.addWorksheet(templateData.worksheetName);

    const headerRow = sheet.addRow(headers);
    // 헤더의 높이값 지정
    headerRow.height = 30.75;

    // 각 헤더 cell에 스타일 지정
    headerRow.eachCell((cell, colNum) => {
      // 배경색 설정 (열별로 다르게)
      let bgColor = "ffffffff"; // 기본 흰색

      if ([1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 15, 16, 17].includes(colNum)) {
        // A~G열(1-7), J~L열(10-12), O~Q열(15-17): 노란색
        bgColor = "fffffd01";
      } else if (colNum === 14) {
        // N열(14): 빨간색
        bgColor = "ffff0000";
      }
      // H~I열(8-9), M열(13): 흰색 (기본값)

      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: {argb: bgColor},
      };

      // 테두리 설정
      cell.border = {
        top: {style: "thin", color: {argb: "ff000000"}},
        left: {style: "thin", color: {argb: "ff000000"}},
        bottom: {style: "thin", color: {argb: "ff000000"}},
        right: {style: "thin", color: {argb: "ff000000"}},
      };

      // 폰트 설정
      cell.font = {
        name: "Arial",
        size: 12,
        bold: true,
        color: {argb: "ff252525"},
      };

      // 정렬 설정
      cell.alignment = {
        vertical: "middle",
        horizontal: "center",
        wrapText: true,
      };
    });

    // 열 너비 설정 (헤더 루프 밖에서 한번에 처리)
    headers.forEach((headerName: string, index: number) => {
      const colNum = index + 1;
      const width =
        typeof columnWidths === "object" && columnWidths[headerName]
          ? columnWidths[headerName]
          : 15;
      sheet.getColumn(colNum).width = width;
    });

    // DB에서 데이터 조회
    let dataRows: any[] = [];
    let dataRowsWithIds: Array<{id: number; row_data: any}> = [];
    let downloadedRowIds: number[] = [];

    if (rows) {
      // rows가 직접 전달된 경우 (app/page.tsx에서 테스트용)
      dataRows = rows;
      // rows가 직접 전달된 경우 ID 추적 불가
      downloadedRowIds = [];
    } else if (rowIds && rowIds.length > 0) {
      // 선택된 행 ID들로 조회
      const rowData = await sql`
        SELECT id, row_data
        FROM upload_rows
        WHERE id = ANY(${rowIds})
      `;
      dataRowsWithIds = rowData.map((r: any) => ({
        id: r.id,
        row_data: r.row_data || {},
      }));
      dataRows = dataRowsWithIds.map((r: any) => r.row_data);
      downloadedRowIds = rowIds;
    } else if (
      (filters && Object.keys(filters).length > 0) ||
      (filters && (filters.uploadTimeFrom || filters.uploadTimeTo))
    ) {
      // 필터 조건으로 조회
      // 외주 발주서인 경우 type 필터가 없으면 "외주" 조건 추가
      const templateNameForFilter = (templateData.name || "")
        .normalize("NFC")
        .trim();
      const isOutsourceTemplateForFilter =
        templateNameForFilter.includes("외주");
      const isCJOutsourceTemplateForFilter =
        templateNameForFilter.includes("CJ");

      // 필터 객체 로깅
      console.log("🔍 받은 필터 객체:", JSON.stringify(filters, null, 2));

      const filtersWithType = {...filters};
      // 외주 발주서인 경우 type 필터가 없으면 "외주" 조건 추가
      if (isOutsourceTemplateForFilter && !filtersWithType.type) {
        filtersWithType.type = "외주";
      }

      // 기간 필터를 별도로 추출 (buildFilterConditions에서 제외)
      const uploadTimeFrom =
        filtersWithType.uploadTimeFrom &&
        typeof filtersWithType.uploadTimeFrom === "string" &&
        filtersWithType.uploadTimeFrom.trim() !== ""
          ? filtersWithType.uploadTimeFrom
          : undefined;
      const uploadTimeTo =
        filtersWithType.uploadTimeTo &&
        typeof filtersWithType.uploadTimeTo === "string" &&
        filtersWithType.uploadTimeTo.trim() !== ""
          ? filtersWithType.uploadTimeTo
          : undefined;

      // 기간 필터를 제외한 필터로 조건 생성
      const filtersWithoutDate = {...filtersWithType};
      delete filtersWithoutDate.uploadTimeFrom;
      delete filtersWithoutDate.uploadTimeTo;

      console.log("🔍 기간 필터 값:", {
        uploadTimeFrom,
        uploadTimeTo,
      });

      const {conditions} = buildFilterConditions(
        filtersWithoutDate as UploadFilters,
        {
          companyId,
        }
      );

      // 조건 로깅
      console.log("🔍 생성된 조건 개수:", conditions.length);

      // CJ외주 발주서인 경우: 지정된 매핑코드만 필터링
      if (isCJOutsourceTemplateForFilter) {
        const allowedCodes = ["106464", "108640", "108788", "108879", "108221"];
        conditions.push(sql`ur.row_data->>'내외주' = '외주'`);
        conditions.push(sql`(
          ur.row_data->>'매핑코드' = '106464'
          OR ur.row_data->>'매핑코드' = '108640'
          OR ur.row_data->>'매핑코드' = '108788'
          OR ur.row_data->>'매핑코드' = '108879'
          OR ur.row_data->>'매핑코드' = '108221'
        )`);
      }

      // 쿼리 구성 (기간 필터를 직접 SQL에 명시)
      let filteredData;
      if (conditions.length === 0) {
        // 조건이 없고 기간 필터만 있는 경우
        if (uploadTimeFrom && uploadTimeTo) {
          filteredData = await sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE u.created_at >= ${uploadTimeFrom}::date
              AND u.created_at < (${uploadTimeTo}::date + INTERVAL '1 day')
            ORDER BY u.created_at DESC, ur.id DESC
          `;
        } else if (uploadTimeFrom) {
          filteredData = await sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE u.created_at >= ${uploadTimeFrom}::date
            ORDER BY u.created_at DESC, ur.id DESC
          `;
        } else if (uploadTimeTo) {
          filteredData = await sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE u.created_at < (${uploadTimeTo}::date + INTERVAL '1 day')
            ORDER BY u.created_at DESC, ur.id DESC
          `;
        } else {
          filteredData = await sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            ORDER BY u.created_at DESC, ur.id DESC
          `;
        }
      } else if (conditions.length === 1) {
        if (uploadTimeFrom && uploadTimeTo) {
          filteredData = await sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE ${conditions[0]}
              AND u.created_at >= ${uploadTimeFrom}::date
              AND u.created_at < (${uploadTimeTo}::date + INTERVAL '1 day')
            ORDER BY u.created_at DESC, ur.id DESC
          `;
        } else if (uploadTimeFrom) {
          filteredData = await sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE ${conditions[0]}
              AND u.created_at >= ${uploadTimeFrom}::date
            ORDER BY u.created_at DESC, ur.id DESC
          `;
        } else if (uploadTimeTo) {
          filteredData = await sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE ${conditions[0]}
              AND u.created_at < (${uploadTimeTo}::date + INTERVAL '1 day')
            ORDER BY u.created_at DESC, ur.id DESC
          `;
        } else {
          filteredData = await sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE ${conditions[0]}
            ORDER BY u.created_at DESC, ur.id DESC
          `;
        }
      } else if (conditions.length === 2) {
        if (uploadTimeFrom && uploadTimeTo) {
          filteredData = await sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE ${conditions[0]} AND ${conditions[1]}
              AND u.created_at >= ${uploadTimeFrom}::date
              AND u.created_at < (${uploadTimeTo}::date + INTERVAL '1 day')
            ORDER BY u.created_at DESC, ur.id DESC
          `;
        } else if (uploadTimeFrom) {
          filteredData = await sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE ${conditions[0]} AND ${conditions[1]}
              AND u.created_at >= ${uploadTimeFrom}::date
            ORDER BY u.created_at DESC, ur.id DESC
          `;
        } else if (uploadTimeTo) {
          filteredData = await sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE ${conditions[0]} AND ${conditions[1]}
              AND u.created_at < (${uploadTimeTo}::date + INTERVAL '1 day')
            ORDER BY u.created_at DESC, ur.id DESC
          `;
        } else {
          filteredData = await sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE ${conditions[0]} AND ${conditions[1]}
            ORDER BY u.created_at DESC, ur.id DESC
          `;
        }
      } else if (conditions.length === 3) {
        if (uploadTimeFrom && uploadTimeTo) {
          filteredData = await sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE ${conditions[0]} AND ${conditions[1]} AND ${conditions[2]}
              AND u.created_at >= ${uploadTimeFrom}::date
              AND u.created_at < (${uploadTimeTo}::date + INTERVAL '1 day')
            ORDER BY u.created_at DESC, ur.id DESC
          `;
        } else if (uploadTimeFrom) {
          filteredData = await sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE ${conditions[0]} AND ${conditions[1]} AND ${conditions[2]}
              AND u.created_at >= ${uploadTimeFrom}::date
            ORDER BY u.created_at DESC, ur.id DESC
          `;
        } else if (uploadTimeTo) {
          filteredData = await sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE ${conditions[0]} AND ${conditions[1]} AND ${conditions[2]}
              AND u.created_at < (${uploadTimeTo}::date + INTERVAL '1 day')
            ORDER BY u.created_at DESC, ur.id DESC
          `;
        } else {
          filteredData = await sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE ${conditions[0]} AND ${conditions[1]} AND ${conditions[2]}
            ORDER BY u.created_at DESC, ur.id DESC
          `;
        }
      } else if (conditions.length === 4) {
        if (uploadTimeFrom && uploadTimeTo) {
          filteredData = await sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE ${conditions[0]} AND ${conditions[1]} AND ${conditions[2]} AND ${conditions[3]}
              AND u.created_at >= ${uploadTimeFrom}::date
              AND u.created_at < (${uploadTimeTo}::date + INTERVAL '1 day')
            ORDER BY u.created_at DESC, ur.id DESC
          `;
        } else if (uploadTimeFrom) {
          filteredData = await sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE ${conditions[0]} AND ${conditions[1]} AND ${conditions[2]} AND ${conditions[3]}
              AND u.created_at >= ${uploadTimeFrom}::date
            ORDER BY u.created_at DESC, ur.id DESC
          `;
        } else if (uploadTimeTo) {
          filteredData = await sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE ${conditions[0]} AND ${conditions[1]} AND ${conditions[2]} AND ${conditions[3]}
              AND u.created_at < (${uploadTimeTo}::date + INTERVAL '1 day')
            ORDER BY u.created_at DESC, ur.id DESC
          `;
        } else {
          filteredData = await sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE ${conditions[0]} AND ${conditions[1]} AND ${conditions[2]} AND ${conditions[3]}
            ORDER BY u.created_at DESC, ur.id DESC
          `;
        }
      } else if (conditions.length === 5) {
        if (uploadTimeFrom && uploadTimeTo) {
          filteredData = await sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE ${conditions[0]} AND ${conditions[1]} AND ${conditions[2]} AND ${conditions[3]} AND ${conditions[4]}
              AND u.created_at >= ${uploadTimeFrom}::date
              AND u.created_at < (${uploadTimeTo}::date + INTERVAL '1 day')
            ORDER BY u.created_at DESC, ur.id DESC
          `;
        } else if (uploadTimeFrom) {
          filteredData = await sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE ${conditions[0]} AND ${conditions[1]} AND ${conditions[2]} AND ${conditions[3]} AND ${conditions[4]}
              AND u.created_at >= ${uploadTimeFrom}::date
            ORDER BY u.created_at DESC, ur.id DESC
          `;
        } else if (uploadTimeTo) {
          filteredData = await sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE ${conditions[0]} AND ${conditions[1]} AND ${conditions[2]} AND ${conditions[3]} AND ${conditions[4]}
              AND u.created_at < (${uploadTimeTo}::date + INTERVAL '1 day')
            ORDER BY u.created_at DESC, ur.id DESC
          `;
        } else {
          filteredData = await sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE ${conditions[0]} AND ${conditions[1]} AND ${conditions[2]} AND ${conditions[3]} AND ${conditions[4]}
            ORDER BY u.created_at DESC, ur.id DESC
          `;
        }
      } else {
        // 6개 이상인 경우 동적 구성 (기간 필터를 마지막에 추가)
        let query = sql`
          SELECT ur.id, ur.row_data
          FROM upload_rows ur
          INNER JOIN uploads u ON ur.upload_id = u.id
          WHERE ${conditions[0]}
        `;
        for (let i = 1; i < conditions.length; i++) {
          query = sql`${query} AND ${conditions[i]}`;
        }
        if (uploadTimeFrom) {
          query = sql`${query} AND u.created_at >= ${uploadTimeFrom}::date`;
        }
        if (uploadTimeTo) {
          query = sql`${query} AND u.created_at < (${uploadTimeTo}::date + INTERVAL '1 day')`;
        }
        query = sql`${query} ORDER BY u.created_at DESC, ur.id DESC`;
        filteredData = await query;
      }

      // ID와 row_data를 함께 저장하여 외주 필터링 후에도 ID 추적 가능하도록 함
      dataRowsWithIds = filteredData.map((r: any) => ({
        id: r.id,
        row_data: r.row_data || {},
      }));
      dataRows = dataRowsWithIds.map((r: any) => r.row_data);
      downloadedRowIds = dataRowsWithIds.map((r: any) => r.id);

      console.log("📊 필터링된 데이터 개수:", dataRows.length);
      console.log("📊 필터링된 데이터 ID 개수:", downloadedRowIds.length);

      // 실제 조회된 데이터의 업로드 날짜 확인
      if (dataRowsWithIds.length > 0) {
        const allIds = dataRowsWithIds.map((r: any) => r.id);
        const allUploadDates = await sql`
          SELECT u.created_at::date as upload_date, COUNT(*) as count
          FROM upload_rows ur
          INNER JOIN uploads u ON ur.upload_id = u.id
          WHERE ur.id = ANY(${allIds})
          GROUP BY u.created_at::date
          ORDER BY u.created_at::date DESC
        `;
        console.log(
          "📅 실제 조회된 데이터의 업로드 날짜 분포:",
          allUploadDates
        );

        // 기간 필터와 비교
        if (filtersWithType.uploadTimeFrom && filtersWithType.uploadTimeTo) {
          const expectedDate = filtersWithType.uploadTimeFrom;
          const hasWrongDates = allUploadDates.some((d: any) => {
            const dateStr = d.upload_date.toISOString().split("T")[0];
            return dateStr !== expectedDate;
          });
          if (hasWrongDates) {
            console.error(
              "❌ 기간 필터 오류: 예상 날짜와 다른 데이터가 포함됨",
              {
                expectedDate,
                actualDates: allUploadDates.map(
                  (d: any) => d.upload_date.toISOString().split("T")[0]
                ),
              }
            );
          } else {
            console.log("✅ 기간 필터 정상 작동");
          }
        }
      }
    } else {
      // 템플릿명 확인 (외주 발주서인지 체크)
      const templateName = (templateData.name || "").normalize("NFC").trim();
      const isOutsourceTemplate = templateName.includes("외주");
      const isCJOutsourceTemplate = templateName.includes("CJ");

      // 일자 필터링 조건 (필터가 없어도 일자 필터가 있으면 적용)
      const uploadTimeFrom =
        filters?.uploadTimeFrom &&
        typeof filters.uploadTimeFrom === "string" &&
        filters.uploadTimeFrom.trim() !== ""
          ? filters.uploadTimeFrom
          : undefined;
      const uploadTimeTo =
        filters?.uploadTimeTo &&
        typeof filters.uploadTimeTo === "string" &&
        filters.uploadTimeTo.trim() !== ""
          ? filters.uploadTimeTo
          : undefined;
      const hasDateFilter = uploadTimeFrom || uploadTimeTo;

      // 외주 발주서인 경우: 필터가 없어도 "외주"만 조회
      if (isOutsourceTemplate) {
        // CJ외주 발주서인 경우: 매핑코드 106464, 108640, 108788, 108879, 108221 포함
        if (isCJOutsourceTemplate) {
          let query = sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE u.company_id = ${companyId}
              AND ur.row_data->>'내외주' = '외주'
              AND ur.row_data->>'매핑코드' IN ('106464', '108640', '108788', '108879', '108221')
          `;

          // 일자 필터링 추가 (빈 문자열 체크)
          if (uploadTimeFrom && uploadTimeFrom.trim() !== "") {
            query = sql`${query} AND u.created_at >= ${uploadTimeFrom}::date`;
          }
          if (uploadTimeTo && uploadTimeTo.trim() !== "") {
            query = sql`${query} AND u.created_at < (${uploadTimeTo}::date + INTERVAL '1 day')`;
          }

          query = sql`${query} ORDER BY u.created_at DESC, ur.id DESC`;

          const allData = await query;
          dataRowsWithIds = allData.map((r: any) => ({
            id: r.id,
            row_data: r.row_data || {},
          }));
          dataRows = dataRowsWithIds.map((r: any) => r.row_data);
        } else {
          // 일반 외주 발주서: CJ 제외
          let query = sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE u.company_id = ${companyId}
              AND ur.row_data->>'내외주' = '외주'
              AND (ur.row_data->>'매핑코드' IS NULL OR ur.row_data->>'매핑코드' != '106464')
              AND (ur.row_data->>'업체명' IS NULL OR ur.row_data->>'업체명' NOT LIKE '%CJ%')
          `;

          // 일자 필터링 추가 (빈 문자열 체크)
          if (uploadTimeFrom && uploadTimeFrom.trim() !== "") {
            query = sql`${query} AND u.created_at >= ${uploadTimeFrom}::date`;
          }
          if (uploadTimeTo && uploadTimeTo.trim() !== "") {
            query = sql`${query} AND u.created_at < (${uploadTimeTo}::date + INTERVAL '1 day')`;
          }

          query = sql`${query} ORDER BY u.created_at DESC, ur.id DESC`;

          const allData = await query;
          dataRowsWithIds = allData.map((r: any) => ({
            id: r.id,
            row_data: r.row_data || {},
          }));
          dataRows = dataRowsWithIds.map((r: any) => r.row_data);
        }
      } else {
        // 외주 발주서가 아닌 경우: 모든 데이터 조회 (일자 필터링 적용)
        let query = sql`
          SELECT ur.id, ur.row_data
          FROM upload_rows ur
          INNER JOIN uploads u ON ur.upload_id = u.id
          WHERE u.company_id = ${companyId}
        `;

        // 일자 필터링 추가 (빈 문자열 체크)
        if (uploadTimeFrom && uploadTimeFrom.trim() !== "") {
          query = sql`${query} AND u.created_at >= ${uploadTimeFrom}::date`;
        }
        if (uploadTimeTo && uploadTimeTo.trim() !== "") {
          query = sql`${query} AND u.created_at < (${uploadTimeTo}::date + INTERVAL '1 day')`;
        }

        query = sql`${query} ORDER BY u.created_at DESC, ur.id DESC`;

        const allData = await query;
        dataRowsWithIds = allData.map((r: any) => ({
          id: r.id,
          row_data: r.row_data || {},
        }));
        dataRows = dataRowsWithIds.map((r: any) => r.row_data);
      }
    }

    // 템플릿명 확인 (외주 발주서인지 체크)
    const templateName = (templateData.name || "").normalize("NFC").trim();
    const isOutsource = templateName.includes("외주");
    const isCJOutsource = templateName.includes("CJ");

    // 외주 발주서인 경우: 매입처별로 그룹화하여 ZIP 생성
    if (isOutsource && !isCJOutsource) {
      // ID와 함께 필터링하여 실제 다운로드된 행의 ID 추적
      // 필터가 있을 때는 이미 필터링된 데이터이므로 추가 필터링 불필요
      // 필터가 없을 때만 "외주" 조건으로 필터링
      if (dataRowsWithIds.length > 0) {
        // 필터가 있었는지 확인 (filters가 있고 키가 있거나, uploadTimeFrom/uploadTimeTo가 있으면 필터가 있었음)
        const hadFilters =
          (filters && Object.keys(filters).length > 0) ||
          (filters && (filters.uploadTimeFrom || filters.uploadTimeTo));

        console.log("🔍 필터 확인:", {
          hadFilters,
          filtersKeys: filters ? Object.keys(filters) : [],
          dataRowsCount: dataRowsWithIds.length,
        });

        let filteredRowsWithIds;
        if (hadFilters) {
          // 필터가 있을 때는 이미 필터링된 데이터 사용 (추가 필터링 불필요)
          filteredRowsWithIds = dataRowsWithIds;
          console.log(
            "✅ 필터가 있어서 이미 필터링된 데이터 사용:",
            filteredRowsWithIds.length
          );
        } else {
          // 필터가 없을 때만 "외주" 조건으로 필터링
          filteredRowsWithIds = dataRowsWithIds.filter(
            (item: any) =>
              item.row_data.내외주 === "외주" &&
              item.row_data.매핑코드 !== "106464" &&
              !item.row_data.업체명?.includes("CJ")
          );
          console.log(
            "🔍 필터가 없어서 외주 조건으로 필터링:",
            filteredRowsWithIds.length
          );
        }
        // 전화번호 필드들에 하이픈 추가 가공 (ID 유지)
        const processedRowsWithIds = filteredRowsWithIds.map((item: any) => {
          const processedRow = {...item.row_data};

          // 수취인 전화번호 가공
          if (processedRow["수취인 전화번호"]) {
            processedRow["수취인 전화번호"] = formatPhoneNumber(
              processedRow["수취인 전화번호"]
            );
          }

          // 주문자 전화번호 가공
          if (processedRow["주문자 전화번호"]) {
            processedRow["주문자 전화번호"] = formatPhoneNumber(
              processedRow["주문자 전화번호"]
            );
          }

          // 전화번호1 가공
          if (processedRow["전화번호1"]) {
            let phone1 = formatPhoneNumber(processedRow["전화번호1"]);
            // grade가 "온라인"인 경우 공백 추가
            if (isOnlineUser) {
              phone1 = formatPhoneNumber1ForOnline(phone1);
            }
            processedRow["전화번호1"] = phone1;
          }

          // 전화번호2 가공
          if (processedRow["전화번호2"]) {
            processedRow["전화번호2"] = formatPhoneNumber(
              processedRow["전화번호2"]
            );
          }

          // 전화번호 가공
          if (processedRow["전화번호"]) {
            processedRow["전화번호"] = formatPhoneNumber(
              processedRow["전화번호"]
            );
          }

          return {
            id: item.id,
            row_data: processedRow,
          };
        });
        dataRows = processedRowsWithIds.map((item: any) => item.row_data);
        downloadedRowIds = processedRowsWithIds.map((item: any) => item.id);
      } else {
        // rows가 직접 전달된 경우
        dataRows = dataRows.filter(
          (row: any) =>
            row.내외주 === "외주" &&
            row.매핑코드 !== "106464" &&
            !row.업체명?.includes("CJ")
        );

        // 전화번호 필드들에 하이픈 추가 가공
        dataRows = dataRows.map((row: any) => {
          const processedRow = {...row};

          // 수취인 전화번호 가공
          if (processedRow["수취인 전화번호"]) {
            processedRow["수취인 전화번호"] = formatPhoneNumber(
              processedRow["수취인 전화번호"]
            );
          }

          // 주문자 전화번호 가공
          if (processedRow["주문자 전화번호"]) {
            processedRow["주문자 전화번호"] = formatPhoneNumber(
              processedRow["주문자 전화번호"]
            );
          }

          // 전화번호1 가공
          if (processedRow["전화번호1"]) {
            let phone1 = formatPhoneNumber(processedRow["전화번호1"]);
            // grade가 "온라인"인 경우 공백 추가
            if (isOnlineUser) {
              phone1 = formatPhoneNumber1ForOnline(phone1);
            }
            processedRow["전화번호1"] = phone1;
          }

          // 전화번호2 가공
          if (processedRow["전화번호2"]) {
            processedRow["전화번호2"] = formatPhoneNumber(
              processedRow["전화번호2"]
            );
          }

          // 전화번호 가공
          if (processedRow["전화번호"]) {
            processedRow["전화번호"] = formatPhoneNumber(
              processedRow["전화번호"]
            );
          }

          return processedRow;
        });
      }

      if (dataRows.length === 0) {
        return NextResponse.json(
          {success: false, error: "외주 데이터가 없습니다."},
          {status: 404}
        );
      }

      // 매핑코드별 가격, 사방넷명, 업체명 정보 조회
      const productCodes = [
        ...new Set(dataRows.map((row: any) => row.매핑코드).filter(Boolean)),
      ];
      const productSalePriceMap: {[code: string]: number | null} = {};
      const productSabangNameMap: {[code: string]: string | null} = {};
      const productVendorNameMap: {[code: string]: string | null} = {};

      if (productCodes.length > 0) {
        const products = await sql`
          SELECT code, sale_price, sabang_name as "sabangName", purchase as "vendorName"
          FROM products
          WHERE code = ANY(${productCodes})
        `;

        products.forEach((p: any) => {
          if (p.code) {
            if (p.sale_price !== null && p.sale_price !== undefined) {
              productSalePriceMap[p.code] = p.sale_price;
            }
            if (p.sabangName !== undefined) {
              productSabangNameMap[p.code] = p.sabangName;
            }
            if (p.vendorName !== undefined) {
              productVendorNameMap[p.code] = p.vendorName;
            }
          }
        });
      }

      // 필터에 vendor가 있으면 해당 vendor만 포함 (purchase 테이블 기준)
      const filterVendors = filters?.vendor;
      const allowedVendors = filterVendors
        ? Array.isArray(filterVendors)
          ? filterVendors
          : [filterVendors]
        : null;

      // 먼저 모든 행에 매핑코드 정보 주입 (사방넷명, 공급가, 매입처명)
      dataRows.forEach((row: any) => {
        // 내주는 제외 (외주만 처리)
        if (row.내외주 !== "외주") {
          return;
        }

        // 공급가와 사방넷명 주입
        if (row.매핑코드) {
          if (productSalePriceMap[row.매핑코드] !== undefined) {
            const salePrice = productSalePriceMap[row.매핑코드];
            if (salePrice !== null) {
              row["공급가"] = salePrice;
            }
          }
          if (productSabangNameMap[row.매핑코드] !== undefined) {
            const sabangName = productSabangNameMap[row.매핑코드];
            if (
              sabangName !== null &&
              sabangName !== undefined &&
              String(sabangName).trim() !== ""
            ) {
              // mapDataToTemplate에서 찾을 수 있도록 여러 키로 저장
              row["사방넷명"] = sabangName;
              row["sabangName"] = sabangName;
              row["sabang_name"] = sabangName;
            } else {
              // 사방넷명이 null이거나 빈 문자열인 경우 명시적으로 제거 (상품명으로 fallback)
              delete row["사방넷명"];
              delete row["sabangName"];
              delete row["sabang_name"];
            }
          } else {
            // productSabangNameMap에 없는 경우 명시적으로 제거 (상품명으로 fallback)
            delete row["사방넷명"];
            delete row["sabangName"];
            delete row["sabang_name"];
          }
        }
      });

      // 매핑코드를 통해 매입처로 업체명 업데이트 및 중복 제거
      const seenOrders = new Map<string, any>(); // 중복 주문 추적 (내부코드 또는 주문번호 사용)
      const processedDataRows: any[] = [];

      dataRows.forEach((row: any) => {
        // 내주는 제외 (외주만 처리)
        if (row.내외주 !== "외주") {
          return;
        }

        // 매핑코드를 통해 매입처명 가져오기
        let vendor = "매입처미지정";
        if (row.매핑코드) {
          const vendorName = productVendorNameMap[row.매핑코드];
          if (vendorName && typeof vendorName === "string") {
            vendor = vendorName;
          }
        }

        // 업체명 설정
        row.업체명 = vendor;

        // 필터에 vendor가 있으면 해당 vendor만 포함 (purchase 테이블 기준)
        if (allowedVendors && !allowedVendors.includes(vendor)) {
          return;
        }

        // 중복 주문 제거 (내부코드 또는 주문번호로 확인)
        // 주문번호 또는 내부코드로 중복 확인 (상품명/사방넷명과 무관하게 주문 단위로 중복 제거)
        const orderIdentifier = row["내부코드"] || row["주문번호"];
        // 주문 단위로만 중복 제거 (매핑코드 제외하여 같은 주문의 다른 상품도 중복으로 처리)
        const orderKey = orderIdentifier
          ? `${vendor}_${orderIdentifier}`
          : `${vendor}_${row["수취인명"]}_${row["주소"]}`;

        if (seenOrders.has(orderKey)) {
          // 이미 처리된 주문이면 건너뛰기 (사방넷명이 있는 경우 우선, 없으면 상품명 사용)
          const existingRow = seenOrders.get(orderKey);
          const hasSabangName =
            row["사방넷명"] || row["sabangName"] || row["sabang_name"];
          const existingHasSabangName =
            existingRow["사방넷명"] ||
            existingRow["sabangName"] ||
            existingRow["sabang_name"];

          // 새 행에 사방넷명이 있고 기존 행에 없으면 교체
          if (hasSabangName && !existingHasSabangName) {
            seenOrders.set(orderKey, row);
            // processedDataRows에서 기존 행 제거하고 새 행 추가
            const index = processedDataRows.findIndex((r: any) => {
              const rVendor =
                r.업체명 ||
                (r.매핑코드 && productVendorNameMap[r.매핑코드]
                  ? productVendorNameMap[r.매핑코드]
                  : "매입처미지정");
              const rOrderIdentifier = r["내부코드"] || r["주문번호"];
              const rOrderKey = rOrderIdentifier
                ? `${rVendor}_${rOrderIdentifier}`
                : `${rVendor}_${r["수취인명"]}_${r["주소"]}`;
              return rOrderKey === orderKey;
            });
            if (index !== -1) {
              processedDataRows[index] = row;
            }
          }
          return; // 이미 처리된 주문은 건너뛰기
        }
        seenOrders.set(orderKey, row);
        processedDataRows.push(row);
      });

      // 매입처별로 그룹화 (필터링 및 중복 제거 완료된 데이터 사용)
      const vendorGroups: {[vendor: string]: any[]} = {};
      processedDataRows.forEach((row) => {
        const vendor = row.업체명;
        if (!vendorGroups[vendor]) {
          vendorGroups[vendor] = [];
        }
        vendorGroups[vendor].push(row);
      });

      // 헤더 Alias 조회 (모든 매입처에서 공통으로 사용)
      let headerAliases: Array<{column_key: string; aliases: string[]}> = [];
      try {
        const aliasResult = await sql`
          SELECT column_key, aliases
          FROM header_aliases
          ORDER BY id
        `;
        headerAliases = aliasResult.map((item: any) => ({
          column_key: item.column_key,
          aliases: Array.isArray(item.aliases) ? item.aliases : [],
        }));
      } catch (error) {
        console.error("헤더 Alias 조회 실패:", error);
      }

      // ZIP 파일 생성
      const zip = new JSZip();
      const dateStr = generateDatePrefix();

      // 각 매입처별로 엑셀 파일 생성
      for (const [vendor, vendorRows] of Object.entries(vendorGroups)) {
        // 매입처의 템플릿 조회
        let purchaseTemplateHeaders: any[] | null = null;
        try {
          const purchaseResult = await sql`
            SELECT template_headers
            FROM purchase
            WHERE name = ${vendor} AND company_id = ${companyId}
            LIMIT 1
          `;
          if (
            purchaseResult.length > 0 &&
            purchaseResult[0].template_headers &&
            Array.isArray(purchaseResult[0].template_headers) &&
            purchaseResult[0].template_headers.length > 0
          ) {
            purchaseTemplateHeaders = purchaseResult[0].template_headers;
          }
        } catch (error) {
          console.error(`매입처 "${vendor}" 템플릿 조회 실패:`, error);
        }

        const wb = new Excel.Workbook();
        const sheet = wb.addWorksheet(templateData.worksheetName);

        // 헤더 결정: purchase 템플릿이 있으면 사용, 없으면 기존 헤더 사용
        let finalHeaders = purchaseTemplateHeaders
          ? getTemplateHeaderNames(purchaseTemplateHeaders)
          : headers;

        // 헤더명 변경: "주문하신분" -> "주문자명", K헤더(인덱스 10) "전화번호" -> "주문자번호"
        finalHeaders = finalHeaders.map((header: string, index: number) => {
          if (header === "주문하신분" || header.includes("주문하신분")) {
            return "주문자명";
          }
          // K헤더(인덱스 10, 0-based)인 경우에만 "전화번호" -> "주문자번호"
          if (
            index === 10 &&
            (header === "전화번호" || header.includes("전화번호"))
          ) {
            return "주문자번호";
          }
          return header;
        });

        // 헤더 추가
        const headerRow = sheet.addRow(finalHeaders);
        headerRow.height = 30.75;

        // 헤더 스타일
        headerRow.eachCell((cell, colNum) => {
          let bgColor = "ffffffff";
          if (
            [
              1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 15, 16, 17, 18, 19, 20, 21, 22, 23,
              24, 25, 26,
            ].includes(colNum)
          ) {
            bgColor = "ffdaeef3"; // #daeef3
          } else if (colNum === 10 || colNum === 11) {
            bgColor = "ffffff00"; // #ffff00 (노란색)
          }

          let fontColor = "ff000000";

          if ([9, 11].includes(colNum)) {
            fontColor = "ffff0000"; // 빨간색
          } else if (colNum === 10) {
            fontColor = "ff0070c0"; // 파란색
          }

          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: {argb: bgColor},
          };

          cell.border = {
            top: {style: "thin", color: {argb: "ff000000"}},
            left: {style: "thin", color: {argb: "ff000000"}},
            bottom: {style: "thin", color: {argb: "ff000000"}},
            right: {style: "thin", color: {argb: "ff000000"}},
          };

          cell.font = {
            name: "Arial",
            size: 12,
            bold: true,
            color: {argb: fontColor},
          };

          cell.alignment = {
            vertical: "middle",
            horizontal: "center",
            wrapText: true,
          };
        });

        // 열 너비 설정
        finalHeaders.forEach((headerName: string, index: number) => {
          const colNum = index + 1;
          const width =
            typeof columnWidths === "object" && columnWidths[headerName]
              ? columnWidths[headerName]
              : 15;
          sheet.getColumn(colNum).width = width;
        });

        // 데이터를 2차원 배열로 변환
        let excelData: any[][];

        if (purchaseTemplateHeaders) {
          // purchase 템플릿 사용
          excelData = vendorRows.map((row: any) => {
            // purchase 템플릿으로 매핑 (헤더 Alias 사용)
            const mappedRow = mapRowToTemplateFormat(
              row,
              purchaseTemplateHeaders,
              headerAliases
            );

            // 추가 처리 (전화번호, 수취인명 등)
            return mappedRow.map((value: any, idx: number) => {
              const header = purchaseTemplateHeaders[idx];
              let stringValue = value != null ? String(value) : "";

              // 수취인명인 경우 앞에 ★ 붙이기
              if (
                header.column_key === "receiverName" ||
                header.display_name.includes("수취인") ||
                header.display_name.includes("받는사람")
              ) {
                stringValue = "★" + stringValue;
              }

              // 주문번호인 경우 내부코드 사용 또는 sabang_code 사용
              if (
                header.column_key === "orderNumber" ||
                header.display_name.includes("주문번호") ||
                header.display_name.includes("주문 번호")
              ) {
                // grade가 "온라인"인 경우 sabang_code만 사용 (내부코드 사용 안 함)
                if (isOnlineUser) {
                  stringValue =
                    row["sabang_code"] || row["주문번호"] || stringValue || "";
                } else if (useInternalCode) {
                  stringValue =
                    row["내부코드"] || row["주문번호"] || stringValue || "";
                } else {
                  stringValue =
                    row["sabang_code"] || row["주문번호"] || stringValue || "";
                }
              }

              // 주문자명 헤더 처리
              if (
                header.column_key === "ordererName" ||
                header.display_name === "주문자명" ||
                header.display_name.includes("주문자명")
              ) {
                stringValue =
                  row["주문자명"] || row["주문하신분"] || stringValue;
              }

              // 주문자번호 헤더 처리 (K헤더)
              if (
                header.display_name === "주문자번호" ||
                (idx === 10 && header.display_name.includes("전화번호"))
              ) {
                stringValue =
                  row["주문자 전화번호"] ||
                  row["주문자전화번호"] ||
                  row["전화번호"] ||
                  stringValue;
              }

              // 전화번호 처리
              if (
                header.column_key === "receiverPhone" ||
                header.display_name.includes("전화") ||
                header.display_name.includes("연락")
              ) {
                const numOnly = stringValue.replace(/\D/g, "");
                if (
                  (numOnly.length === 10 || numOnly.length === 11) &&
                  !numOnly.startsWith("0")
                ) {
                  stringValue = "0" + numOnly;
                } else if (numOnly.length > 0) {
                  stringValue = numOnly;
                }
                stringValue = formatPhoneNumber(stringValue);

                // 전화번호1이고 grade가 "온라인"인 경우 공백 추가
                if (
                  (header.display_name === "전화번호1" ||
                    header.display_name.includes("전화번호1")) &&
                  isOnlineUser
                ) {
                  stringValue = formatPhoneNumber1ForOnline(stringValue);
                }
              }

              // 우편번호 처리
              if (header.display_name.includes("우편")) {
                const numOnly = stringValue.replace(/\D/g, "");
                if (numOnly.length >= 4 && numOnly.length <= 5) {
                  stringValue = numOnly.padStart(5, "0");
                }
              }

              // 배송메시지 처리: grade가 "온라인"인 경우 맨 앞에 #수취인명 추가
              if (
                isOnlineUser &&
                (header.column_key === "deliveryMessage" ||
                  header.display_name.includes("배송") ||
                  header.display_name.includes("메시지") ||
                  header.display_name.includes("배메"))
              ) {
                const receiverName =
                  row["수취인명"] || row["받는사람"] || row["수령인명"] || "";
                if (receiverName) {
                  const prefix = `#${receiverName}`;
                  // 기존 배송메시지가 있으면 앞에 추가, 없으면 prefix만 사용
                  stringValue = stringValue
                    ? `${prefix} ${stringValue}`
                    : prefix;
                }
              }

              return stringValue;
            });
          });
        } else {
          // 기존 방식 사용
          excelData = vendorRows.map((row: any) => {
            // 전화번호1 값을 미리 계산
            let phone1Value = "";
            headers.forEach((header: any) => {
              const headerStr =
                typeof header === "string" ? header : String(header || "");
              if (
                headerStr.includes("전화번호1") ||
                headerStr === "전화번호1"
              ) {
                let value = mapDataToTemplate(row, headerStr, {
                  templateName: templateData.name,
                  formatPhone: true, // 외주 발주서에서는 전화번호에 하이픈 추가
                });
                phone1Value = value != null ? String(value) : "";
                // formatPhoneNumber 적용
                if (phone1Value) {
                  phone1Value = formatPhoneNumber(phone1Value);
                  // grade가 "온라인"인 경우 공백 추가
                  if (isOnlineUser) {
                    phone1Value = formatPhoneNumber1ForOnline(phone1Value);
                  }
                }
              }
            });

            return headers.map((header: any, headerIdx: number) => {
              // header를 문자열로 변환
              const headerStr =
                typeof header === "string" ? header : String(header || "");

              // I헤더(인덱스 8, 0-based)인 경우 주문 수량 반환
              if (headerIdx === 8) {
                const quantity =
                  row["수량"] || row["주문수량"] || row["quantity"] || 1;
                return String(quantity);
              }

              // 빈 헤더인 경우 주문 수량 반환
              if (!headerStr || headerStr.trim() === "") {
                const quantity =
                  row["수량"] || row["주문수량"] || row["quantity"] || 1;
                return String(quantity);
              }

              let value = mapDataToTemplate(row, headerStr, {
                templateName: templateData.name,
                formatPhone: true, // 외주 발주서에서는 전화번호에 하이픈 추가
              });

              let stringValue = value != null ? String(value) : "";

              // 수취인명인 경우 앞에 ★ 붙이기
              if (
                headerStr === "수취인명" ||
                headerStr === "수취인" ||
                headerStr === "받는사람"
              ) {
                stringValue = "★" + stringValue;
              }

              // 주문번호인 경우 내부코드 사용 또는 sabang_code 사용
              if (headerStr === "주문번호" || headerStr.includes("주문번호")) {
                // grade가 "온라인"인 경우 sabang_code만 사용 (내부코드 사용 안 함)
                if (isOnlineUser) {
                  stringValue =
                    row["sabang_code"] || row["주문번호"] || stringValue;
                } else if (useInternalCode) {
                  stringValue = row["내부코드"] || stringValue;
                } else {
                  stringValue = row["sabang_code"] || stringValue;
                }
              }

              // 주문자명 헤더 처리 (주문하신분 -> 주문자명으로 변경됨)
              if (headerStr === "주문자명" || headerStr.includes("주문자명")) {
                stringValue =
                  row["주문자명"] || row["주문하신분"] || stringValue;
              }

              // 주문자번호 헤더 처리 (K헤더 전화번호 -> 주문자번호로 변경됨)
              if (
                headerStr === "주문자번호" ||
                (headerIdx === 10 && headerStr.includes("전화번호"))
              ) {
                stringValue =
                  row["주문자 전화번호"] ||
                  row["주문자전화번호"] ||
                  row["전화번호"] ||
                  stringValue;
              }

              if (headerStr.includes("전화") || headerStr.includes("연락")) {
                const numOnly = stringValue.replace(/\D/g, "");
                if (
                  (numOnly.length === 10 || numOnly.length === 11) &&
                  !numOnly.startsWith("0")
                ) {
                  stringValue = "0" + numOnly;
                } else if (numOnly.length > 0) {
                  stringValue = numOnly;
                }

                // 전화번호2가 비어있으면 전화번호1 값 사용
                if (
                  (headerStr.includes("전화번호2") ||
                    headerStr === "전화번호2") &&
                  !stringValue
                ) {
                  stringValue = phone1Value;
                }

                // 하이픈 추가하여 전화번호 형식 맞춤
                stringValue = formatPhoneNumber(stringValue);

                // 전화번호1이고 grade가 "온라인"인 경우 공백 추가
                if (
                  (headerStr === "전화번호1" ||
                    headerStr.includes("전화번호1")) &&
                  isOnlineUser
                ) {
                  stringValue = formatPhoneNumber1ForOnline(stringValue);
                }
              }

              if (headerStr.includes("우편")) {
                const numOnly = stringValue.replace(/\D/g, "");
                if (numOnly.length >= 4 && numOnly.length <= 5) {
                  stringValue = numOnly.padStart(5, "0");
                }
              }

              // 배송메시지 처리: grade가 "온라인"인 경우 맨 앞에 #수취인명 추가
              if (
                isOnlineUser &&
                (headerStr.includes("배송") ||
                  headerStr.includes("메시지") ||
                  headerStr.includes("배메") ||
                  headerStr === "배송메시지" ||
                  headerStr === "배송 메시지")
              ) {
                const receiverName =
                  row["수취인명"] || row["받는사람"] || row["수령인명"] || "";
                if (receiverName) {
                  const prefix = `#${receiverName}`;
                  // 기존 배송메시지가 있으면 앞에 추가, 없으면 prefix만 사용
                  stringValue = stringValue
                    ? `${prefix} ${stringValue}`
                    : prefix;
                }
              }

              return stringValue;
            });
          });
        }

        // 정렬: 상품명 또는 사방넷명 오름차순 후 수취인명 오름차순
        const sortColumnOrder = purchaseTemplateHeaders
          ? finalHeaders
          : columnOrder;
        excelData = sortExcelData(excelData, sortColumnOrder, {
          preferSabangName:
            preferSabangName !== undefined ? preferSabangName : true,
          originalData: vendorRows,
        });

        // 받는사람, 전화번호1, 주소 필드 인덱스 찾기
        const receiverNameIndex = finalHeaders.findIndex(
          (h: string) =>
            h.includes("수취인명") ||
            h === "수취인명" ||
            h === "수취인" ||
            h === "받는사람" ||
            h.includes("받는사람")
        );
        const phone1Index = finalHeaders.findIndex(
          (h: string) =>
            h === "전화번호1" ||
            h.includes("전화번호1") ||
            (h.includes("전화") && h.includes("1"))
        );
        const addressIndex = finalHeaders.findIndex(
          (h: string) =>
            h.includes("주소") ||
            h === "주소" ||
            h.includes("수취인주소") ||
            h.includes("받는사람주소")
        );

        // 중복값 찾기: 각 필드별로 값과 행 인덱스 매핑
        const receiverNameMap = new Map<string, number[]>();
        const phone1Map = new Map<string, number[]>();
        const addressMap = new Map<string, number[]>();

        excelData.forEach((rowData: any[], rowIndex: number) => {
          // 받는사람 중복 체크
          if (receiverNameIndex >= 0 && rowData[receiverNameIndex]) {
            const value = String(rowData[receiverNameIndex])
              .replace(/^★/, "")
              .trim();
            if (value) {
              if (!receiverNameMap.has(value)) {
                receiverNameMap.set(value, []);
              }
              receiverNameMap.get(value)!.push(rowIndex);
            }
          }

          // 전화번호1 중복 체크
          if (phone1Index >= 0 && rowData[phone1Index]) {
            const value = String(rowData[phone1Index]).trim();
            if (value) {
              if (!phone1Map.has(value)) {
                phone1Map.set(value, []);
              }
              phone1Map.get(value)!.push(rowIndex);
            }
          }

          // 주소 중복 체크
          if (addressIndex >= 0 && rowData[addressIndex]) {
            const value = String(rowData[addressIndex]).trim();
            if (value) {
              if (!addressMap.has(value)) {
                addressMap.set(value, []);
              }
              addressMap.get(value)!.push(rowIndex);
            }
          }
        });

        // 중복된 셀 인덱스 집합 생성 (필드별로)
        const duplicateReceiverNameCells = new Set<number>();
        const duplicatePhone1Cells = new Set<number>();
        const duplicateAddressCells = new Set<number>();

        receiverNameMap.forEach((indices) => {
          if (indices.length > 1) {
            indices.forEach((idx) => duplicateReceiverNameCells.add(idx));
          }
        });
        phone1Map.forEach((indices) => {
          if (indices.length > 1) {
            indices.forEach((idx) => duplicatePhone1Cells.add(idx));
          }
        });
        addressMap.forEach((indices) => {
          if (indices.length > 1) {
            indices.forEach((idx) => duplicateAddressCells.add(idx));
          }
        });

        // 데이터 추가
        excelData.forEach((rowDatas, rowIndex) => {
          const appendRow = sheet.addRow(rowDatas);

          appendRow.eachCell((cell: any, colNum: any) => {
            const headerName = finalHeaders[colNum - 1];
            // headerName을 문자열로 변환
            const headerStr =
              typeof headerName === "string"
                ? headerName
                : String(headerName || "");
            const normalizedHeader = headerStr
              .replace(/\s+/g, "")
              .toLowerCase();

            const isTextColumn =
              normalizedHeader.includes("전화") ||
              normalizedHeader.includes("연락") ||
              normalizedHeader.includes("우편") ||
              normalizedHeader.includes("코드");

            if (isTextColumn) {
              cell.numFmt = "@";
            }

            // 중복값 배경색 처리 (연한 빨강: FFE6E6)
            const isReceiverNameCol =
              colNum - 1 === receiverNameIndex && receiverNameIndex >= 0;
            const isPhone1Col = colNum - 1 === phone1Index && phone1Index >= 0;
            const isAddressCol =
              colNum - 1 === addressIndex && addressIndex >= 0;

            if (
              (isReceiverNameCol && duplicateReceiverNameCells.has(rowIndex)) ||
              (isPhone1Col && duplicatePhone1Cells.has(rowIndex)) ||
              (isAddressCol && duplicateAddressCells.has(rowIndex))
            ) {
              cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: {argb: "FFE6E6"}, // 연한 빨강
              };
            }
          });
        });

        // I1 셀에 총 row 수 작성 (I열은 9번째 열)
        const totalRowCount = excelData.length;
        const i1Cell = sheet.getCell("I1");
        i1Cell.value = totalRowCount;

        // I열의 데이터 행들(2행부터)을 공란 처리
        for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
          const iCell = sheet.getCell(`I${rowNum}`);
          iCell.value = "";
        }

        // 엑셀 버퍼 생성
        const buffer = await wb.xlsx.writeBuffer();
        const fileName = `${dateStr}_외주발주_${vendor}.xlsx`;
        zip.file(fileName, buffer);
      }

      // ZIP 파일 생성
      const zipBuffer = await zip.generateAsync({type: "nodebuffer"});
      const zipFileName = `${dateStr}_외주발주.zip`;
      const encodedZipFileName = encodeURIComponent(zipFileName);
      const contentDisposition = `attachment; filename="outsource.zip"; filename*=UTF-8''${encodedZipFileName}`;

      // 외주 발주서 다운로드가 성공하면 주문상태 업데이트
      // 외주 발주서인 경우 필터링된 데이터의 실제 다운로드된 행들만 업데이트
      const idsToUpdate = downloadedRowIds;
      if (idsToUpdate && idsToUpdate.length > 0) {
        try {
          // 효율적인 단일 쿼리로 모든 row의 주문상태를 "발주서 다운"으로 업데이트
          // 현재 상태가 "공급중"인 경우에만 업데이트 (뒷단계로 돌아가지 않도록)
          // "사방넷 다운", "배송중" 상태는 유지됨 (조건에 포함되지 않으므로 업데이트되지 않음)
          await sql`
            UPDATE upload_rows
            SET row_data = jsonb_set(row_data, '{주문상태}', '"발주서 다운"', true)
            WHERE id = ANY(${idsToUpdate})
              AND (row_data->>'주문상태' IS NULL OR row_data->>'주문상태' = '공급중')
          `;
        } catch (updateError) {
          console.error("주문상태 업데이트 실패:", updateError);
          // 주문상태 업데이트 실패해도 다운로드는 성공으로 처리
        }
      }

      const responseHeaders = new Headers();
      responseHeaders.set("Content-Type", "application/zip");
      responseHeaders.set("Content-Disposition", contentDisposition);

      return new Response(Buffer.from(zipBuffer), {
        headers: responseHeaders,
      });
    }

    // 일반 발주서: productId가 있으면 ID로, 없으면 매핑코드로 가격, 사방넷명 정보 조회
    const productIds = [
      ...new Set(dataRows.map((row: any) => row.productId).filter(Boolean)),
    ];
    const productCodes = [
      ...new Set(
        dataRows
          .filter((row: any) => !row.productId && row.매핑코드)
          .map((row: any) => row.매핑코드)
      ),
    ];
    const productSalePriceMap: {[code: string]: number | null} = {};
    const productSabangNameMap: {[code: string]: string | null} = {};
    const productVendorNameMap: {[code: string]: string | null} = {};
    const productSalePriceMapById: {[id: string | number]: number | null} = {};
    const productSabangNameMapById: {[id: string | number]: string | null} = {};
    const productVendorNameMapById: {[id: string | number]: string | null} = {};

    // productId로 조회
    if (productIds.length > 0) {
      const productsById = await sql`
        SELECT id, code, sale_price, sabang_name as "sabangName", purchase as "vendorName"
        FROM products
        WHERE id = ANY(${productIds})
      `;

      productsById.forEach((p: any) => {
        if (p.id) {
          if (p.sale_price !== null && p.sale_price !== undefined) {
            productSalePriceMapById[p.id] = p.sale_price;
          }
          if (p.sabangName !== undefined) {
            productSabangNameMapById[p.id] = p.sabangName;
          }
          if (p.vendorName !== undefined) {
            productVendorNameMapById[p.id] = p.vendorName;
          }
        }
      });
    }

    // 매핑코드로 조회 (productId가 없는 경우)
    if (productCodes.length > 0) {
      const products = await sql`
        SELECT code, sale_price, sabang_name as "sabangName", purchase as "vendorName"
        FROM products
        WHERE code = ANY(${productCodes})
      `;

      products.forEach((p: any) => {
        if (p.code) {
          if (p.sale_price !== null && p.sale_price !== undefined) {
            productSalePriceMap[p.code] = p.sale_price;
          }
          if (p.sabangName !== undefined) {
            productSabangNameMap[p.code] = p.sabangName;
          }
          if (p.vendorName !== undefined) {
            productVendorNameMap[p.code] = p.vendorName;
          }
        }
      });
    }

    // 데이터에 공급가와 사방넷명 주입: productId가 있으면 ID로, 없으면 매핑코드로 찾기
    dataRows.forEach((row: any) => {
      if (row.productId) {
        // productId로 조회한 정보 사용
        if (productSalePriceMapById[row.productId] !== undefined) {
          const salePrice = productSalePriceMapById[row.productId];
          if (salePrice !== null) {
            row["공급가"] = salePrice;
          }
        }
        if (productSabangNameMapById[row.productId] !== undefined) {
          const sabangName = productSabangNameMapById[row.productId];
          if (
            sabangName !== null &&
            sabangName !== undefined &&
            String(sabangName).trim() !== ""
          ) {
            row["사방넷명"] = sabangName;
            row["sabangName"] = sabangName;
            row["sabang_name"] = sabangName;
          } else {
            delete row["사방넷명"];
            delete row["sabangName"];
            delete row["sabang_name"];
          }
        } else {
          delete row["사방넷명"];
          delete row["sabangName"];
          delete row["sabang_name"];
        }
        if (productVendorNameMapById[row.productId] !== undefined) {
          row.업체명 =
            productVendorNameMapById[row.productId] || "매입처미지정";
        }
      } else if (row.매핑코드) {
        // 매핑코드로 조회한 정보 사용
        if (productSalePriceMap[row.매핑코드] !== undefined) {
          const salePrice = productSalePriceMap[row.매핑코드];
          if (salePrice !== null) {
            row["공급가"] = salePrice;
          }
        }
        if (productSabangNameMap[row.매핑코드] !== undefined) {
          const sabangName = productSabangNameMap[row.매핑코드];
          if (
            sabangName !== null &&
            sabangName !== undefined &&
            String(sabangName).trim() !== ""
          ) {
            row["사방넷명"] = sabangName;
            row["sabangName"] = sabangName;
            row["sabang_name"] = sabangName;
          } else {
            delete row["사방넷명"];
            delete row["sabangName"];
            delete row["sabang_name"];
          }
        } else {
          delete row["사방넷명"];
          delete row["sabangName"];
          delete row["sabang_name"];
        }
        if (productVendorNameMap[row.매핑코드] !== undefined) {
          row.업체명 = productVendorNameMap[row.매핑코드] || "매입처미지정";
        }
      }
    });

    // 전화번호 필드들에 하이픈 추가 가공
    dataRows = dataRows.map((row: any) => {
      const processedRow = {...row};

      // 수취인 전화번호 가공
      if (processedRow["수취인 전화번호"]) {
        processedRow["수취인 전화번호"] = formatPhoneNumber(
          processedRow["수취인 전화번호"]
        );
      }

      // 주문자 전화번호 가공
      if (processedRow["주문자 전화번호"]) {
        processedRow["주문자 전화번호"] = formatPhoneNumber(
          processedRow["주문자 전화번호"]
        );
      }

      // 전화번호1 가공
      if (processedRow["전화번호1"]) {
        let phone1 = formatPhoneNumber(processedRow["전화번호1"]);
        // grade가 "온라인"인 경우 공백 추가
        if (isOnlineUser) {
          phone1 = formatPhoneNumber1ForOnline(phone1);
        }
        processedRow["전화번호1"] = phone1;
      }

      // 전화번호2 가공
      if (processedRow["전화번호2"]) {
        processedRow["전화번호2"] = formatPhoneNumber(
          processedRow["전화번호2"]
        );
      }

      // 전화번호 가공
      if (processedRow["전화번호"]) {
        processedRow["전화번호"] = formatPhoneNumber(processedRow["전화번호"]);
      }

      return processedRow;
    });

    // 데이터를 2차원 배열로 변환 (mapDataToTemplate 함수 사용)
    let excelData = dataRows.map((row: any) => {
      // 각 헤더에 대해 mapDataToTemplate을 사용하여 데이터 매핑
      return headers.map((header: any) => {
        // header를 문자열로 변환
        const headerStr =
          typeof header === "string" ? header : String(header || "");

        // 빈 헤더인 경우 빈 값 반환
        if (!headerStr || headerStr.trim() === "") {
          return "";
        }

        let value = mapDataToTemplate(row, headerStr, {
          templateName: templateData.name,
          formatPhone: true, // 외주 발주서에서는 전화번호에 하이픈 추가
          preferSabangName:
            preferSabangName !== undefined ? preferSabangName : true,
        });

        // 모든 값을 문자열로 변환 (0 유지)
        let stringValue = value != null ? String(value) : "";

        // 전화번호가 10-11자리 숫자이고 0으로 시작하지 않으면 앞에 0 추가 및 하이픈 추가
        if (headerStr.includes("전화") || headerStr.includes("연락")) {
          // 이미 하이픈이 있는 경우는 건너뜀 (mapDataToTemplate에서 이미 처리됨)
          if (!stringValue.includes("-")) {
            const numOnly = stringValue.replace(/\D/g, ""); // 숫자만 추출
            if (
              (numOnly.length === 10 || numOnly.length === 11) &&
              !numOnly.startsWith("0")
            ) {
              stringValue = "0" + numOnly; // 숫자만 사용하고 0 추가
            } else if (numOnly.length > 0) {
              stringValue = numOnly; // 하이픈 등 제거하고 숫자만
            }

            // 하이픈 추가하여 전화번호 형식 맞춤
            stringValue = formatPhoneNumber(stringValue);
          }
        }

        // 우편번호가 4-5자리 숫자면 5자리로 맞춤 (앞에 0 추가)
        if (headerStr.includes("우편")) {
          const numOnly = stringValue.replace(/\D/g, "");
          if (numOnly.length >= 4 && numOnly.length <= 5) {
            stringValue = numOnly.padStart(5, "0");
          }
        }

        return stringValue;
      });
    });

    // 정렬: 상품명 또는 사방넷명 오름차순 후 수취인명 오름차순
    excelData = sortExcelData(excelData, columnOrder, {
      preferSabangName:
        preferSabangName !== undefined ? preferSabangName : true,
      originalData: dataRows,
    });

    // 정렬된 데이터를 엑셀에 추가
    excelData.forEach((rowDatas) => {
      const appendRow = sheet.addRow(rowDatas);

      // 전화번호, 우편번호, 코드 관련 필드는 텍스트 형식으로 설정 (앞자리 0 유지)
      appendRow.eachCell((cell: any, colNum: any) => {
        const headerName = headers[colNum - 1];
        // headerName을 문자열로 변환
        const headerStr =
          typeof headerName === "string"
            ? headerName
            : String(headerName || "");
        const normalizedHeader = headerStr.replace(/\s+/g, "").toLowerCase();

        const isTextColumn =
          normalizedHeader.includes("전화") ||
          normalizedHeader.includes("연락") ||
          normalizedHeader.includes("우편") ||
          normalizedHeader.includes("코드");

        if (isTextColumn) {
          cell.numFmt = "@"; // 텍스트 형식
        }
      });
    });

    // I1 셀에 총 row 수 작성 (I열은 9번째 열)
    const totalRowCount = excelData.length;
    const i1Cell = sheet.getCell("I1");
    i1Cell.value = totalRowCount;

    // I열의 데이터 행들(2행부터)을 공란 처리
    for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
      const iCell = sheet.getCell(`I${rowNum}`);
      iCell.value = "";
    }

    // 엑셀 파일 생성
    const buffer = await wb.xlsx.writeBuffer();

    // 파일명 생성
    const fileName = generateExcelFileName(templateData.name || "download");

    // Windows에서 한글 파일명 깨짐 방지를 위한 RFC 5987 형식 인코딩
    // HTTP 헤더는 ASCII만 허용하므로 filename에는 ASCII fallback 추가
    const asciiFallbackBase =
      fileName
        .replace(/\.xlsx$/, "")
        .replace(/[^\x00-\x7F]/g, "")
        .replace(/\s+/g, "_") || "download";
    const safeFileName = `${asciiFallbackBase}.xlsx`; // ASCII fallback
    const encodedFileName = encodeURIComponent(fileName); // UTF-8 인코딩
    // filename* 우선, filename ASCII fallback 병행
    const contentDisposition = `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`;

    // 발주서 다운로드가 성공하면 주문상태 업데이트
    if (rowIds && rowIds.length > 0) {
      // 주문상태 업데이트를 비동기로 처리하여 다운로드 속도 향상
      setImmediate(async () => {
        try {
          // 효율적인 단일 쿼리로 모든 row의 주문상태를 "발주서 다운"으로 업데이트
          // 현재 상태가 "공급중"인 경우에만 업데이트 (뒷단계로 돌아가지 않도록)
          await sql`
            UPDATE upload_rows
            SET row_data = jsonb_set(row_data, '{주문상태}', '"발주서 다운"', true)
            WHERE id = ANY(${rowIds})
              AND (row_data->>'주문상태' IS NULL OR row_data->>'주문상태' = '공급중')
          `;
        } catch (updateError) {
          console.error("주문상태 업데이트 실패:", updateError);
        }
      });
    }

    const responseHeaders = new Headers();
    responseHeaders.set(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    responseHeaders.set("Content-Disposition", contentDisposition);

    return new Response(buffer, {
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({message: "Error", error: error}, {status: 500});
  }
}
