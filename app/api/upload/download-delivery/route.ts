import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest, getUserIdFromRequest} from "@/lib/company";
import ExcelJS from "exceljs";
import {generateExcelFileName, generateDatePrefix} from "@/utils/filename";
import {createInhouseTemplate} from "@/libs/inhouse-template";
import {mapDataToTemplate} from "@/utils/excelDataMapping";

/**
 * POST /api/upload/download-delivery
 * 특정 업체의 운송장 다운로드 (엑셀 파일)
 * A열=택배사, B열=운송장번호는 유지하고, 나머지는 내주 발주서 양식에 적용
 */
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

    const body = await request.json();
    const {vendorName, uploadId} = body;

    if (!vendorName || !uploadId) {
      return NextResponse.json(
        {success: false, error: "업체명과 파일 ID가 필요합니다."},
        {status: 400}
      );
    }

    // 내주 발주서 템플릿 조회
    // 먼저 모든 템플릿을 가져와서 이름으로 필터링
    const allTemplatesResult = await sql`
      SELECT id, template_data, name
      FROM upload_templates
      WHERE company_id = ${companyId}
      ORDER BY created_at DESC
    `;

    // 템플릿 이름에 "내주"가 포함된 템플릿 찾기
    // name 컬럼 또는 template_data.name 필드 확인
    let inhouseTemplate: any = null;
    for (const template of allTemplatesResult) {
      // name 컬럼 확인
      const nameColumn = (template.name || "").normalize("NFC").trim();
      // template_data.name 확인
      const templateDataName = (template.template_data?.name || "")
        .normalize("NFC")
        .trim();
      
      if (nameColumn.includes("내주") || templateDataName.includes("내주")) {
        inhouseTemplate = template;
        break;
      }
    }

    if (!inhouseTemplate) {
      return NextResponse.json(
        {
          success: false,
          error: "내주 발주서 템플릿을 찾을 수 없습니다. 템플릿 이름에 '내주'가 포함되어 있어야 합니다.",
        },
        {status: 404}
      );
    }

    const inhouseTemplateData = inhouseTemplate.template_data || {};
    const inhouseHeaders = Array.isArray(inhouseTemplateData.headers)
      ? inhouseTemplateData.headers
      : [];
    const inhouseColumnOrder = Array.isArray(inhouseTemplateData.columnOrder)
      ? inhouseTemplateData.columnOrder
      : inhouseHeaders;
    const inhouseColumnWidths =
      inhouseTemplateData.columnWidths && typeof inhouseTemplateData.columnWidths === "object"
        ? inhouseTemplateData.columnWidths
        : {};

    // user_id 추출 및 권한 확인
    const userId = await getUserIdFromRequest(request);
    let isAdmin = false;
    let assignedVendorIds: number[] = [];

    if (userId) {
      try {
        const userResult = await sql`
          SELECT grade, assigned_vendor_ids
          FROM users
          WHERE id = ${userId} AND company_id = ${companyId}
        `;

        if (userResult.length > 0) {
          isAdmin = userResult[0].grade === "관리자";

          if (userResult[0].assigned_vendor_ids) {
            try {
              assignedVendorIds = Array.isArray(userResult[0].assigned_vendor_ids)
                ? userResult[0].assigned_vendor_ids
                : JSON.parse(userResult[0].assigned_vendor_ids || "[]");
            } catch (e) {
              assignedVendorIds = [];
            }
          }
        }
      } catch (error) {
        console.error("사용자 정보 조회 실패:", error);
      }
    }

    // 일반 유저인 경우 권한 확인
    if (!isAdmin && assignedVendorIds.length > 0) {
      const vendorResult = await sql`
        SELECT name
        FROM mall
        WHERE id = ANY(${assignedVendorIds})
      `;

      const allowedVendorNames = vendorResult.map((v: any) => v.name);

      if (!allowedVendorNames.includes(vendorName)) {
        return NextResponse.json(
          {success: false, error: "해당 업체에 대한 권한이 없습니다."},
          {status: 403}
        );
      }
    }

    // 금일 날짜 계산 (한국 시간 기준)
    const today = new Date();
    const koreaTime = new Date(today.getTime() + 9 * 60 * 60 * 1000);
    const todayStart = new Date(koreaTime);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(koreaTime);
    todayEnd.setHours(23, 59, 59, 999);

    const todayStartUTC = new Date(todayStart.getTime() - 9 * 60 * 60 * 1000);
    const todayEndUTC = new Date(todayEnd.getTime() - 9 * 60 * 60 * 1000);

    // 해당 파일(upload_id)의 배송중인 주문 데이터 조회
    const deliveryOrdersResult = await sql`
      SELECT ur.row_order, ur.row_data
      FROM upload_rows ur
      INNER JOIN uploads u ON ur.upload_id = u.id
      WHERE u.id = ${uploadId}
        AND u.company_id = ${companyId}
        AND ur.row_data->>'업체명' = ${vendorName}
        AND ur.row_data->>'주문상태' = '배송중'
        AND ur.row_data->>'운송장번호' IS NOT NULL
        AND ur.row_data->>'운송장번호' != ''
      ORDER BY ur.row_order
    `;

    // 해당 upload_id의 모든 주문 데이터를 row_order 순서대로 가져오기
    const allRowsResult = await sql`
      SELECT ur.row_order, ur.row_data
      FROM upload_rows ur
      INNER JOIN uploads u ON ur.upload_id = u.id
      WHERE u.id = ${uploadId} AND u.company_id = ${companyId}
      ORDER BY ur.row_order
    `;

    if (allRowsResult.length === 0) {
      return NextResponse.json(
        {success: false, error: "해당 파일의 데이터를 찾을 수 없습니다."},
        {status: 404}
      );
    }

    // 배송중인 주문의 row_order Set
    const deliveryRowOrders = new Set<number>();
    deliveryOrdersResult.forEach((order: any) => {
      deliveryRowOrders.add(order.row_order);
    });

    // 헤더 구성: A열=택배사, B열=운송장번호, 나머지는 내주 발주서 헤더
    const headers = ["택배사", "운송장번호", ...inhouseColumnOrder];

    // 주문 데이터를 2차원 배열로 변환
    const excelData = allRowsResult.map((row: any) => {
      const rowData = row.row_data || {};
      const rowOrder = row.row_order;
      const isDeliveryOrder = deliveryRowOrders.has(rowOrder);

      // A열: 택배사 (운송장 있는 경우만, 없으면 공란)
      const carrier = isDeliveryOrder ? (rowData["택배사"] || "") : "";
      
      // B열: 운송장번호 (운송장 있는 경우만, 없으면 공란)
      const trackingNumber = isDeliveryOrder ? (rowData["운송장번호"] || "") : "";

      // C열부터: 내주 발주서 양식에 맞게 데이터 매핑
      const inhouseData = inhouseColumnOrder.map((header: string) => {
        let value = mapDataToTemplate(rowData, header, {
          templateName: inhouseTemplateData.name,
          isInhouse: true,
          preferSabangName: true,
        });

        // 모든 값을 문자열로 변환
        let stringValue = value != null ? String(value) : "";

        // 주문번호인 경우 내부코드 사용
        if (header === "주문번호" || header.includes("주문번호")) {
          stringValue = rowData["내부코드"] || stringValue;
        }

        // 전화번호가 10-11자리 숫자이고 0으로 시작하지 않으면 앞에 0 추가
        if (header.includes("전화") || header.includes("연락")) {
          const numOnly = stringValue.replace(/\D/g, ""); // 숫자만 추출
          if (
            (numOnly.length === 10 || numOnly.length === 11) &&
            !numOnly.startsWith("0")
          ) {
            stringValue = "0" + numOnly; // 숫자만 사용하고 0 추가
          } else if (numOnly.length > 0) {
            stringValue = numOnly; // 하이픈 등 제거하고 숫자만
          }
        }

        // 우편번호가 4-5자리 숫자면 5자리로 맞춤 (앞에 0 추가)
        if (header.includes("우편")) {
          const numOnly = stringValue.replace(/\D/g, "");
          if (numOnly.length >= 4 && numOnly.length <= 5) {
            stringValue = numOnly.padStart(5, "0");
          }
        }

        return stringValue;
      });

      return [carrier, trackingNumber, ...inhouseData];
    });

    // 열 너비 설정 (A, B열 + 내주 발주서 열 너비)
    const columnWidths: {[key: string]: number} = {
      "택배사": 15,
      "운송장번호": 20,
      ...inhouseColumnWidths,
    };

    // 내주 발주서 양식으로 워크북 생성 (A, B열 추가로 인한 오프셋 2 적용)
    const workbook = createInhouseTemplate(
      headers,
      headers, // columnOrder는 headers와 동일하게
      columnWidths,
      excelData,
      "운송장",
      2 // A, B열 추가로 인한 오프셋
    );

    // A, B열 스타일 조정 (운송장 관련 열은 기본 스타일 유지)
    const worksheet = workbook.worksheets[0];
    const headerRow = worksheet.getRow(1);
    
    // A, B열 헤더 스타일 조정 (기본 스타일 유지)
    headerRow.getCell(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {argb: "fffffd01"}, // 노란색
    };
    headerRow.getCell(2).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {argb: "fffffd01"}, // 노란색
    };

    // 데이터 행의 A, B열 스타일 조정
    excelData.forEach((_, rowIndex) => {
      const dataRow = worksheet.getRow(rowIndex + 2);
      dataRow.getCell(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: {argb: "fffffd01"}, // 노란색
      };
      dataRow.getCell(2).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: {argb: "fffffd01"}, // 노란색
      };
    });

    // 엑셀 파일 생성
    const buffer = await workbook.xlsx.writeBuffer();

    // 파일명 생성
    const fileName = generateExcelFileName(`${vendorName}_운송장`);
    const dateStr = generateDatePrefix();

    // Windows에서 한글 파일명 깨짐 방지를 위한 RFC 5987 형식 인코딩
    const asciiFallbackBase = `${dateStr}_${vendorName}_delivery`
      .replace(/[^\x00-\x7F]/g, "")
      .replace(/\s+/g, "_");
    const safeFileName = `${asciiFallbackBase}.xlsx`;
    const encodedFileName = encodeURIComponent(fileName);
    const contentDisposition = `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`;

    // 히스토리 저장 (비동기로 처리하여 다운로드 응답을 지연시키지 않음)
    if (userId) {
      sql`
        INSERT INTO download_history (
          user_id,
          company_id,
          vendor_name,
          file_name,
          form_type,
          upload_id
        ) VALUES (
          ${userId},
          ${companyId},
          ${vendorName},
          ${fileName},
          '운송장',
          ${uploadId}
        )
      `.catch((error) => {
        console.error("히스토리 저장 실패:", error);
        // 히스토리 저장 실패해도 다운로드는 계속 진행
      });
    }

    // 응답 헤더 설정
    const responseHeaders = new Headers();
    responseHeaders.set(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    responseHeaders.set("Content-Disposition", contentDisposition);

    return new Response(buffer, {
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("운송장 다운로드 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
