import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest, getUserIdFromRequest} from "@/lib/company";
import ExcelJS from "exceljs";
import {mapDataToTemplate, sortExcelData} from "@/utils/excelDataMapping";
import {copyCellStyle, applyHeaderStyle} from "@/utils/excelStyles";
import {prepareExcelCellValue} from "@/utils/excelTypeConversion";
import {
  prepareWorkbookForExcel,
  initializeWorkbookProperties,
} from "@/utils/excelCompatibility";
import {generateExcelFileName} from "@/utils/filename";
import {createCJOutsourceTemplate} from "@/libs/cj-outsource-template";

// 템플릿 양식으로 엑셀 다운로드
export async function POST(request: NextRequest) {
  try {
    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400},
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

    const body = await request.json();
    const {templateId, rowIds, filters, isInhouse, preferSabangName} = body;

    // 템플릿명 확인 (CJ외주 발주서인지 체크)
    const templateResultForCheck = await sql`
      SELECT template_data
      FROM upload_templates
      WHERE id = ${templateId} AND company_id = ${companyId}
    `;
    const templateNameForCheck =
      templateResultForCheck.length > 0
        ? (templateResultForCheck[0].template_data?.name || "")
            .normalize("NFC")
            .trim()
        : "";
    const isCJOutsource =
      templateNameForCheck.includes("CJ") &&
      templateNameForCheck.includes("외주");

    if (!templateId) {
      return NextResponse.json(
        {success: false, error: "템플릿 ID가 필요합니다."},
        {status: 400},
      );
    }

    // 템플릿 정보 조회 (company_id 필터링)
    const templateResult = await sql`
      SELECT template_data
      FROM upload_templates
      WHERE id = ${templateId} AND company_id = ${companyId}
    `;

    if (!templateResult.length) {
      return NextResponse.json(
        {success: false, error: "템플릿을 찾을 수 없습니다."},
        {status: 404},
      );
    }

    const templateData = templateResult[0].template_data;
    const headers = Array.isArray(templateData.headers)
      ? templateData.headers
      : [];
    let columnOrder = Array.isArray(templateData.columnOrder)
      ? templateData.columnOrder
      : headers;

    // CJ외주 발주서인 경우 헤더 순서 수정
    if (isCJOutsource) {
      // 1. 두 번째 주소 헤더 바로 우측에 빈 열 추가
      const addressIndices: number[] = [];
      columnOrder.forEach((h: any, idx: number) => {
        const headerStr = typeof h === "string" ? h : String(h || "");
        if (headerStr.includes("주소") && !headerStr.includes("우편")) {
          addressIndices.push(idx);
        }
      });

      // 두 번째 주소 헤더 찾기
      const secondAddressIndex =
        addressIndices.length >= 2 ? addressIndices[1] : -1;

      if (secondAddressIndex !== -1) {
        // 두 번째 주소 다음에 이미 빈 열이 있는지 확인
        const nextAfterAddress = columnOrder[secondAddressIndex + 1];
        const isNextEmpty =
          !nextAfterAddress ||
          (typeof nextAfterAddress === "string" &&
            nextAfterAddress.trim() === "");

        // 빈 열이 없을 때만 추가
        if (!isNextEmpty) {
          columnOrder = [
            ...columnOrder.slice(0, secondAddressIndex + 1),
            "", // 두 번째 주소 바로 다음에 빈 열 추가
            ...columnOrder.slice(secondAddressIndex + 1),
          ];
        }
      }

      // 2. 박스 뒤에 업체명 열 추가
      const boxIndex = columnOrder.findIndex((h: any) => {
        const headerStr = typeof h === "string" ? h : String(h || "");
        return (
          headerStr.includes("박스") ||
          headerStr === "박스" ||
          headerStr === "박스단위" ||
          headerStr === "박스정보" ||
          headerStr === "박스크기"
        );
      });

      if (boxIndex !== -1) {
        // 박스가 마지막 열이거나, 박스 다음에 업체명이 없는 경우에만 추가
        const hasVendorName = columnOrder.some((h: any, idx: number) => {
          if (idx <= boxIndex) return false;
          const headerStr = typeof h === "string" ? h : String(h || "");
          return (
            headerStr === "업체명" ||
            headerStr === "vendor_name" ||
            headerStr.includes("업체명")
          );
        });

        if (!hasVendorName) {
          columnOrder = [
            ...columnOrder.slice(0, boxIndex + 1),
            "업체명", // 업체명 열 추가
            ...columnOrder.slice(boxIndex + 1),
          ];
        }
      }
    }

    // columnOrder가 비어있거나 유효하지 않은 경우 에러 처리
    if (!columnOrder || columnOrder.length === 0) {
      return NextResponse.json(
        {success: false, error: "템플릿의 컬럼 순서가 설정되지 않았습니다."},
        {status: 400},
      );
    }

    // 선택된 행 데이터 조회
    let rows: any[] = [];
    let rowIdsWithData: Array<{id: number; row_data: any}> = [];

    if (rowIds && rowIds.length > 0) {
      // 선택된 행이 있으면 해당 ID들만 조회 (company_id 필터링 포함)
      // grade별 필터링 조건 구성
      let gradeFilterCondition = sql``;
      if (userGrade === "납품업체" || userGrade === "온라인") {
        gradeFilterCondition = sql`
          AND EXISTS (
            SELECT 1 FROM users usr
            WHERE usr.id::text = u.user_id::text
            AND usr.company_id = ${companyId}
            AND usr.grade = ${userGrade}
          )
        `;
      }

      const rowData = await sql`
        SELECT ur.id, ur.row_data
        FROM upload_rows ur
        INNER JOIN uploads u ON ur.upload_id = u.id
        WHERE ur.id = ANY(${rowIds}) AND u.company_id = ${companyId}
        ${gradeFilterCondition}
      `;
      rowIdsWithData = rowData.map((r: any) => ({
        id: r.id,
        row_data: r.row_data || {},
      }));

      // CJ외주 발주서인 경우 필터링 적용
      if (isCJOutsource) {
        const allowedCodes = ["106464", "108640", "108788", "108879", "108221"];
        rowIdsWithData = rowIdsWithData.filter((item: any) => {
          const mappingCode = String(item.row_data?.매핑코드 || "").trim();
          const isInhouse = item.row_data?.내외주 === "내주";
          return isInhouse && allowedCodes.includes(mappingCode);
        });
        console.log(
          `CJ외주 발주서 선택 다운로드: ${rowData.length}건 중 ${rowIdsWithData.length}건 필터링됨`,
        );
      }

      rows = rowIdsWithData.map((r: any) => {
        const rowData = r.row_data || {};
        // 우편번호를 우편으로 통일
        if (
          rowData["우편번호"] !== undefined &&
          rowData["우편"] === undefined
        ) {
          rowData["우편"] = rowData["우편번호"];
        }
        return rowData;
      });
    } else {
      // 필터가 있으면 필터링된 데이터 조회, 없으면 모든 데이터 조회
      if (filters && Object.keys(filters).length > 0) {
        const {
          type,
          postType,
          vendor,
          company,
          orderStatus,
          searchField,
          searchValue,
          uploadTimeFrom,
          uploadTimeTo,
        } = filters;

        // 검색 필드 매핑
        const fieldMap: {[key: string]: string} = {
          수취인명: "수취인명",
          주문자명: "주문자명",
          상품명: "상품명",
          매핑코드: "매핑코드",
        };
        const dbField = searchField ? fieldMap[searchField] : null;
        const searchPattern = searchValue ? `%${searchValue}%` : null;

        // WHERE 조건 구성 (company_id 필수)
        const conditions: any[] = [sql`u.company_id = ${companyId}`];

        // grade별 필터링 조건 추가
        if (userGrade === "납품업체" || userGrade === "온라인") {
          conditions.push(sql`
            EXISTS (
              SELECT 1 FROM users usr
              WHERE usr.id::text = u.user_id::text
              AND usr.company_id = ${companyId}
              AND usr.grade = ${userGrade}
            )
          `);
        }
        // 관리자, 직원은 grade 필터링 없이 모든 데이터 조회

        if (type) {
          conditions.push(sql`ur.row_data->>'내외주' = ${type}`);
        }
        if (postType) {
          conditions.push(sql`ur.row_data->>'택배사' = ${postType}`);
        }
        // vendor가 배열인 경우 처리
        // 매입처명은 매핑코드를 통해 products 테이블의 purchase 컬럼에서 가져옴
        if (vendor) {
          if (Array.isArray(vendor) && vendor.length > 0) {
            conditions.push(sql`
              EXISTS (
                SELECT 1 FROM products p
                WHERE p.code = ur.row_data->>'매핑코드'
                AND p.company_id = ${companyId}
                AND p.purchase = ANY(${vendor})
              )
              OR ur.row_data->>'업체명' = ANY(${vendor})
            `);
          } else if (typeof vendor === "string") {
            conditions.push(sql`
              EXISTS (
                SELECT 1 FROM products p
                WHERE p.code = ur.row_data->>'매핑코드'
                AND p.company_id = ${companyId}
                AND p.purchase = ${vendor}
              )
              OR ur.row_data->>'업체명' = ${vendor}
            `);
          }
        }
        // company가 배열인 경우 처리
        if (company) {
          if (Array.isArray(company) && company.length > 0) {
            conditions.push(sql`ur.row_data->>'업체명' = ANY(${company})`);
          } else if (typeof company === "string") {
            conditions.push(sql`ur.row_data->>'업체명' = ${company}`);
          }
        }
        if (orderStatus) {
          conditions.push(sql`ur.row_data->>'주문상태' = ${orderStatus}`);
        }
        // CJ외주 발주서인 경우: 매핑코드 필터를 무시하고 CJ외주 조건을 적용
        if (isCJOutsource && dbField === "매핑코드") {
          // 매핑코드 필터 대신 CJ외주 조건을 추가
          const allowedCodes = [
            "106464",
            "108640",
            "108788",
            "108879",
            "108221",
          ];
          conditions.push(sql`ur.row_data->>'내외주' = '내주'`);
          conditions.push(sql`(
            ur.row_data->>'매핑코드' = '106464'
            OR ur.row_data->>'매핑코드' = '108640'
            OR ur.row_data->>'매핑코드' = '108788'
            OR ur.row_data->>'매핑코드' = '108879'
            OR ur.row_data->>'매핑코드' = '108221'
          )`);
        } else if (dbField && searchPattern) {
          conditions.push(sql`ur.row_data->>${dbField} ILIKE ${searchPattern}`);
        }
        if (uploadTimeFrom) {
          conditions.push(sql`u.created_at >= ${uploadTimeFrom}::date`);
        }
        if (uploadTimeTo) {
          conditions.push(
            sql`u.created_at < (${uploadTimeTo}::date + INTERVAL '1 day')`,
          );
        }

        // CJ외주 발주서인 경우: 매핑코드 필터가 아닌 경우에도 항상 CJ외주 조건 적용
        if (isCJOutsource && dbField !== "매핑코드") {
          // CJ외주 조건 추가 (매핑코드 필터가 아닌 경우)
          const allowedCodes = [
            "106464",
            "108640",
            "108788",
            "108879",
            "108221",
          ];
          conditions.push(sql`ur.row_data->>'내외주' = '내주'`);
          conditions.push(sql`(
            ur.row_data->>'매핑코드' = '106464'
            OR ur.row_data->>'매핑코드' = '108640'
            OR ur.row_data->>'매핑코드' = '108788'
            OR ur.row_data->>'매핑코드' = '108879'
            OR ur.row_data->>'매핑코드' = '108221'
          )`);
        }

        // 조건부 쿼리 구성
        const buildQuery = (includeId: boolean = true) => {
          // 첫 번째 조건으로 WHERE 시작
          let query = sql`
            SELECT ${includeId ? sql`ur.id,` : sql``} ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE ${conditions[0]}
          `;

          // 나머지 조건들을 AND로 연결
          for (let i = 1; i < conditions.length; i++) {
            query = sql`${query} AND ${conditions[i]}`;
          }

          query = sql`${query} ORDER BY u.created_at DESC, ur.id DESC`;

          return query;
        };

        const filteredData = await buildQuery(true);
        // ID와 row_data를 함께 저장하여 주문상태 업데이트 시 사용
        rowIdsWithData = filteredData.map((r: any) => ({
          id: r.id,
          row_data: r.row_data || {},
        }));
        rows = filteredData.map((r: any) => {
          const rowData = r.row_data || {};
          // 우편번호를 우편으로 통일
          if (
            rowData["우편번호"] !== undefined &&
            rowData["우편"] === undefined
          ) {
            rowData["우편"] = rowData["우편번호"];
          }
          return rowData;
        });

        // 발주서 다운로드이고 필터링된 데이터 다운로드 시 주문상태 업데이트
        const templateName = (templateData.name || "").normalize("NFC").trim();
        const isPurchaseOrder = templateName.includes("발주");
        if (
          isPurchaseOrder &&
          (!rowIds || rowIds.length === 0) &&
          rowIdsWithData.length > 0
        ) {
          try {
            // 필터링된 데이터의 ID를 사용하여 주문상태 업데이트
            const idsToUpdate = rowIdsWithData.map((r: any) => r.id);

            if (idsToUpdate.length > 0) {
              // 효율적인 단일 쿼리로 모든 row의 주문상태를 "발주서 다운"으로 업데이트
              // 현재 상태가 "공급중"인 경우에만 업데이트 (뒷단계로 돌아가지 않도록)
              // "사방넷 다운", "배송중" 상태는 유지됨 (조건에 포함되지 않으므로 업데이트되지 않음)
              await sql`
                UPDATE upload_rows
                SET row_data = jsonb_set(row_data, '{주문상태}', '"발주서 다운"', true)
                WHERE id = ANY(${idsToUpdate})
                  AND (row_data->>'주문상태' IS NULL OR row_data->>'주문상태' = '공급중')
              `;
            }
          } catch (updateError) {
            console.error("주문상태 업데이트 실패:", updateError);
            // 주문상태 업데이트 실패해도 다운로드는 성공으로 처리
          }
        }
      } else {
        // 필터가 없으면 company_id로 필터링된 모든 데이터 조회
        let allData: any[];

        // CJ외주 발주서인 경우: 내주이고 지정된 매핑코드만 조회
        if (isCJOutsource) {
          const allowedCodes = [
            "106464",
            "108640",
            "108788",
            "108879",
            "108221",
          ];
          // grade별 필터링 조건 구성
          let gradeFilterCondition = sql``;
          if (userGrade === "납품업체" || userGrade === "온라인") {
            gradeFilterCondition = sql`
              AND EXISTS (
                SELECT 1 FROM users usr
                WHERE usr.id = u.user_id
                AND usr.company_id = ${companyId}
                AND usr.grade = ${userGrade}
              )
            `;
          }

          allData = await sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE u.company_id = ${companyId}
              AND ur.row_data->>'내외주' = '내주'
              AND (
                ur.row_data->>'매핑코드' = '106464'
                OR ur.row_data->>'매핑코드' = '108640'
                OR ur.row_data->>'매핑코드' = '108788'
                OR ur.row_data->>'매핑코드' = '108879'
                OR ur.row_data->>'매핑코드' = '108221'
              )
            ${gradeFilterCondition}
            ORDER BY u.created_at DESC, ur.id DESC
          `;
          console.log(
            `CJ외주 발주서 전체 다운로드: ${allData.length}건 조회됨`,
          );
        } else {
          // grade별 필터링 조건 구성
          let gradeFilterCondition = sql``;
          if (userGrade === "납품업체" || userGrade === "온라인") {
            gradeFilterCondition = sql`
              AND EXISTS (
                SELECT 1 FROM users usr
                WHERE usr.id = u.user_id
                AND usr.company_id = ${companyId}
                AND usr.grade = ${userGrade}
              )
            `;
          }

          allData = await sql`
            SELECT ur.id, ur.row_data
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE u.company_id = ${companyId}
            ${gradeFilterCondition}
            ORDER BY u.created_at DESC, ur.id DESC
          `;
        }

        rowIdsWithData = allData.map((r: any) => ({
          id: r.id,
          row_data: r.row_data || {},
        }));

        rows = rowIdsWithData.map((r: any) => {
          const rowData = r.row_data || {};
          // 우편번호를 우편으로 통일
          if (
            rowData["우편번호"] !== undefined &&
            rowData["우편"] === undefined
          ) {
            rowData["우편"] = rowData["우편번호"];
          }
          return rowData;
        });

        // 발주서 다운로드이고 전체 다운로드 시 주문상태 업데이트
        const templateName = (templateData.name || "").normalize("NFC").trim();
        const isPurchaseOrder = templateName.includes("발주");
        if (isPurchaseOrder && (!rowIds || rowIds.length === 0)) {
          try {
            const idsToUpdate = rowIdsWithData.map((r: any) => r.id);

            if (idsToUpdate.length > 0) {
              // 효율적인 단일 쿼리로 모든 row의 주문상태를 "발주서 다운"으로 업데이트
              // 현재 상태가 "공급중"인 경우에만 업데이트 (뒷단계로 돌아가지 않도록)
              // "사방넷 다운", "배송중" 상태는 유지됨 (조건에 포함되지 않으므로 업데이트되지 않음)
              await sql`
                UPDATE upload_rows
                SET row_data = jsonb_set(row_data, '{주문상태}', '"발주서 다운"', true)
                WHERE id = ANY(${idsToUpdate})
                  AND (row_data->>'주문상태' IS NULL OR row_data->>'주문상태' = '공급중')
              `;
            }
          } catch (updateError) {
            console.error("주문상태 업데이트 실패:", updateError);
            // 주문상태 업데이트 실패해도 다운로드는 성공으로 처리
          }
        }
      }
    }

    // 내주 발주서인 경우: 내외주가 "내주"인 것들만 필터링 + CJ외주 매핑코드 제외
    if (isInhouse) {
      // CJ외주 발주서에서 사용하는 매핑코드들 (106464, 108640, 108788, 108879, 108221) 제외
      const cjOutsourceCodes = [
        "106464",
        "108640",
        "108788",
        "108879",
        "108221",
      ];
      rows = rows.filter(
        (row: any) =>
          row.내외주?.trim() === "내주" &&
          !cjOutsourceCodes.includes(String(row.매핑코드 || "").trim()),
      );

      if (rows.length === 0) {
        return NextResponse.json(
          {success: false, error: "내주 데이터가 없습니다."},
          {status: 404},
        );
      }
    }

    // CJ외주 발주서인 경우: 빈 데이터 체크
    if (isCJOutsource && rows.length === 0) {
      return NextResponse.json(
        {success: false, error: "CJ외주 데이터가 없습니다."},
        {status: 404},
      );
    }

    // 상품 정보 조회: productId가 있으면 ID로, 없으면 매핑코드로 조회
    const productIds = [
      ...new Set(rows.map((row: any) => row.productId).filter(Boolean)),
    ];
    const productCodes = [
      ...new Set(
        rows
          .filter((row: any) => !row.productId && row.매핑코드)
          .map((row: any) => row.매핑코드),
      ),
    ];
    const productPriceMap: {[code: string]: number | null} = {};
    const productSalePriceMap: {[code: string]: number | null} = {};
    const productSabangNameMap: {[code: string]: string | null} = {};
    const productPriceMapById: {[id: string | number]: number | null} = {};
    const productSalePriceMapById: {[id: string | number]: number | null} = {};
    const productSabangNameMapById: {[id: string | number]: string | null} = {};

    // productId로 조회
    if (productIds.length > 0) {
      try {
        const productsById = await sql`
          SELECT id, code, price, sale_price, sabang_name as "sabangName"
          FROM products
          WHERE id = ANY(${productIds})
        `;

        productsById.forEach((p: any) => {
          if (p.id) {
            if (p.price !== null && p.price !== undefined) {
              productPriceMapById[p.id] = p.price;
            }
            if (p.sale_price !== null && p.sale_price !== undefined) {
              productSalePriceMapById[p.id] = p.sale_price;
            }
            if (p.sabangName !== undefined) {
              productSabangNameMapById[p.id] = p.sabangName;
            }
          }
        });
      } catch (error) {
        console.error("상품 ID로 조회 실패:", error);
      }
    }

    // 매핑코드로 조회 (productId가 없는 경우)
    if (productCodes.length > 0) {
      try {
        const products = await sql`
          SELECT code, price, sale_price, sabang_name as "sabangName"
          FROM products
          WHERE code = ANY(${productCodes})
        `;

        products.forEach((p: any) => {
          if (p.code) {
            if (p.price !== null && p.price !== undefined) {
              productPriceMap[p.code] = p.price;
            }
            if (p.sale_price !== null && p.sale_price !== undefined) {
              productSalePriceMap[p.code] = p.sale_price;
            }
            if (p.sabangName !== undefined) {
              productSabangNameMap[p.code] = p.sabangName;
            }
          }
        });
      } catch (error) {
        console.error("상품 가격 조회 실패:", error);
      }
    }

    // 템플릿 헤더 순서에 맞게 데이터 재구성
    let excelData = rows.map((row, idx) => {
      // productId가 있으면 ID로, 없으면 매핑코드로 가격 및 사방넷명 정보 가져오기
      if (row.productId) {
        // productId로 조회한 정보 사용
        if (productSalePriceMapById[row.productId] !== undefined) {
          const salePrice = productSalePriceMapById[row.productId];
          if (salePrice !== null) {
            row["공급가"] = salePrice;
            row["salePrice"] = salePrice;
            row["sale_price"] = salePrice;
            if (!row.가격 || row.가격 === "") {
              row.가격 = salePrice;
            }
          }
        } else if (productPriceMapById[row.productId] !== undefined) {
          const productPrice = productPriceMapById[row.productId];
          if (productPrice !== null) {
            row["공급가"] = productPrice;
            if (!row.가격 || row.가격 === "") {
              row.가격 = productPrice;
            }
          }
        }

        // 사방넷명 매핑
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
      } else if (row.매핑코드) {
        // 매핑코드로 조회한 정보 사용
        if (productSalePriceMap[row.매핑코드] !== undefined) {
          const salePrice = productSalePriceMap[row.매핑코드];
          if (salePrice !== null) {
            row["공급가"] = salePrice;
            row["salePrice"] = salePrice;
            row["sale_price"] = salePrice;
            if (!row.가격 || row.가격 === "") {
              row.가격 = salePrice;
            }
          }
        } else if (productPriceMap[row.매핑코드] !== undefined) {
          const productPrice = productPriceMap[row.매핑코드];
          if (productPrice !== null) {
            row["공급가"] = productPrice;
            if (!row.가격 || row.가격 === "") {
              row.가격 = productPrice;
            }
          }
        }

        // 사방넷명 매핑
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
      }

      return columnOrder.map((header: any) => {
        // header가 문자열이 아닌 경우 문자열로 변환
        const headerStr =
          typeof header === "string" ? header : String(header || "");

        // CJ외주 발주서인 경우 특별 처리
        if (isCJOutsource) {
          // 빈 헤더인 경우 빈 값 반환
          if (!headerStr || headerStr.trim() === "") {
            return "";
          }

          // 업체명 헤더인 경우 납품업체명(업체명) 값 반환
          if (
            headerStr === "업체명" ||
            headerStr === "vendor_name" ||
            headerStr.includes("업체명")
          ) {
            return row["업체명"] || row["납품업체명"] || "";
          }
        }

        // preferSabangName 옵션에 따라 사방넷명 또는 상품명 사용
        let value = mapDataToTemplate(row, headerStr, {
          templateName: templateData.name,
          preferSabangName:
            preferSabangName !== undefined ? preferSabangName : true,
        });

        // 수취인명인 경우 앞에 ★ 붙이기
        if (
          headerStr === "수취인명" ||
          headerStr === "수취인" ||
          headerStr === "받는사람" ||
          headerStr.includes("수취인명") ||
          headerStr.includes("받는사람")
        ) {
          const stringValue = value != null ? String(value) : "";
          if (stringValue && !stringValue.startsWith("★")) {
            value = "★" + stringValue;
          }
        }

        return value;
      });
    });

    // 정렬: 상품명 오름차순 후 수취인명 오름차순
    excelData = sortExcelData(excelData, columnOrder);

    // ExcelJS 워크북 생성
    let workbook = new ExcelJS.Workbook();
    let worksheet: ExcelJS.Worksheet;

    // CJ외주 발주서인 경우 로컬 템플릿 사용
    if (isCJOutsource) {
      workbook = createCJOutsourceTemplate(columnOrder, excelData);
      worksheet = workbook.worksheets[0];

      // 워크북 속성 초기화 (Excel 호환성)
      initializeWorkbookProperties(workbook);

      // 워크북을 Excel 호환 모드로 완전히 정리
      prepareWorkbookForExcel(workbook, {
        removeFormulas: false,
        removeDataValidations: false,
      });
    } else if (templateData.originalFile) {
      // 원본 파일 읽기
      let originalBuffer: Buffer;
      try {
        const buffer = Buffer.from(templateData.originalFile, "base64");
        if (!buffer || buffer.length === 0) {
          throw new Error("원본 파일 데이터가 비어있습니다.");
        }
        originalBuffer = buffer as Buffer;
      } catch (bufferError: any) {
        console.error("Base64 디코딩 실패:", bufferError);
        throw new Error(
          `원본 파일을 디코딩할 수 없습니다: ${bufferError.message}`,
        );
      }

      try {
        await workbook.xlsx.load(originalBuffer as any);
      } catch (loadError: any) {
        console.error("원본 파일 로드 실패:", loadError);
        console.error("버퍼 크기:", originalBuffer.length);
        throw new Error(`원본 파일을 로드할 수 없습니다: ${loadError.message}`);
      }

      // 워크북이 제대로 로드되었는지 확인
      if (!workbook) {
        throw new Error("워크북 객체가 생성되지 않았습니다.");
      }

      // 워크북 속성 초기화 (Excel 호환성)
      initializeWorkbookProperties(workbook);

      // 워크시트 가져오기
      let originalSheetName = templateData.worksheetName;
      let hasOriginalWorksheet = false;
      let tempWorksheet: ExcelJS.Worksheet | undefined = undefined;

      // 워크시트가 있는 경우
      if (workbook.worksheets.length > 0) {
        // 워크시트 이름이 지정되어 있으면 해당 워크시트 사용
        if (originalSheetName) {
          const foundWorksheet = workbook.getWorksheet(originalSheetName);
          if (foundWorksheet) {
            tempWorksheet = foundWorksheet;
          }
        }

        // 워크시트를 찾지 못했으면 첫 번째 워크시트 사용
        if (!tempWorksheet && workbook.worksheets.length > 0) {
          tempWorksheet = workbook.worksheets[0];
          originalSheetName = tempWorksheet.name;
        }

        hasOriginalWorksheet = true;
      } else {
        // 워크시트가 없으면 새로 생성 (원본 파일이 손상되었을 수 있음)
        console.warn(
          "원본 파일에 워크시트가 없습니다. 새 워크시트를 생성합니다.",
        );
        tempWorksheet = workbook.addWorksheet(originalSheetName || "Sheet1");
        hasOriginalWorksheet = false;
      }

      // 워크시트가 여전히 undefined인 경우 에러
      if (!tempWorksheet) {
        throw new Error("워크시트를 생성할 수 없습니다.");
      }

      worksheet = tempWorksheet;

      // 원본 워크시트가 있는 경우 - 원본 파일을 그대로 사용하고 값만 업데이트
      if (hasOriginalWorksheet) {
        // 헤더 행이 없으면 생성
        if (worksheet.rowCount === 0) {
          worksheet.addRow(columnOrder);
        }

        // 헤더 행의 원본 셀 객체를 직접 저장 (데이터 삭제 전에 미리 저장)
        const headerRow = worksheet.getRow(1);
        const headerRowHeight = headerRow?.height;
        const headerCells: {[colNumber: number]: ExcelJS.Cell} = {};

        if (headerRow) {
          headerRow.eachCell({includeEmpty: true}, (cell, colNumber) => {
            // 원본 셀 객체를 직접 저장
            headerCells[colNumber] = cell;
          });
        }

        // 원본 데이터 행의 셀 객체 저장 (2행이 있으면 사용)
        // 데이터 행 삭제 전에 미리 저장해야 참조가 유효함
        const dataRowHeight =
          worksheet.rowCount > 1 ? worksheet.getRow(2).height : undefined;
        const dataCells: {[colNumber: number]: ExcelJS.Cell} = {};

        if (worksheet.rowCount > 1) {
          const originalDataRow = worksheet.getRow(2);
          if (originalDataRow) {
            originalDataRow.eachCell(
              {includeEmpty: true},
              (cell, colNumber) => {
                // 원본 셀 객체를 저장 (데이터 삭제 전이므로 참조가 유효함)
                dataCells[colNumber] = cell;
              },
            );
          }
        }

        // 원본 열 너비 저장
        const columnWidths: {[key: number]: number} = {};
        worksheet.columns.forEach((column, index) => {
          if (column.width) {
            columnWidths[index + 1] = column.width;
          }
        });

        // 기존 데이터 행 삭제 (헤더 행 제외)
        const lastRow = worksheet.rowCount;
        if (lastRow > 1) {
          for (let rowNum = lastRow; rowNum > 1; rowNum--) {
            try {
              worksheet.spliceRows(rowNum, 1);
            } catch (e) {
              const row = worksheet.getRow(rowNum);
              if (row) {
                row.eachCell({includeEmpty: true}, (cell) => {
                  cell.value = null;
                });
              }
            }
          }
        }

        // 헤더 행 높이 복사
        if (headerRowHeight) {
          worksheet.getRow(1).height = headerRowHeight;
        }

        // 헤더 행 업데이트 - 원본 셀을 직접 사용하고 값만 업데이트
        columnOrder.forEach((header: string, colIdx: number) => {
          const colNumber = colIdx + 1;

          // 원본 셀이 있으면 그대로 사용하고 값만 업데이트
          if (headerCells[colNumber]) {
            const originalCell = headerCells[colNumber];
            // 원본 셀의 값만 업데이트하면 스타일은 그대로 유지됨
            originalCell.value = prepareExcelCellValue(header, false);
          } else {
            // 원본 셀이 없으면 새로 생성
            const cell = worksheet.getCell(1, colNumber);
            cell.value = prepareExcelCellValue(header, false);
          }
        });

        // 열 너비 복사
        Object.keys(columnWidths).forEach((colNumStr) => {
          const colNum = parseInt(colNumStr);
          if (colNum <= columnOrder.length) {
            worksheet.getColumn(colNum).width = columnWidths[colNum];
          }
        });

        // 새 데이터 추가 - 원본 셀 스타일 복사
        excelData.forEach((rowData, rowIdx) => {
          const rowNumber = rowIdx + 2; // 헤더 다음 행부터
          const row = worksheet.getRow(rowNumber);

          // 행 높이 복사
          if (dataRowHeight) {
            row.height = dataRowHeight;
          }

          rowData.forEach((cellValue: any, colIdx: number) => {
            const colNumber = colIdx + 1;
            const cell = row.getCell(colNumber);

            // 원본 데이터 행 셀의 스타일 복사 (없으면 헤더 셀 스타일 사용)
            const sourceCell = dataCells[colNumber] || headerCells[colNumber];
            if (sourceCell) {
              copyCellStyle(sourceCell, cell);
            }

            // 값 설정 - cellValue는 이미 mapDataToTemplate에서 정규화되었지만
            // 혹시 모를 경우를 대비해 최종 검증
            const normalizedValue = prepareExcelCellValue(cellValue, false);
            cell.value = normalizedValue;

            // 전화번호 컬럼은 텍스트 포맷으로 설정 (앞자리 0 유지)
            const headerName = columnOrder[colIdx] || "";
            const isPhoneColumn =
              headerName.includes("전화") ||
              headerName.includes("전번") ||
              headerName.includes("핸드폰") ||
              headerName.includes("휴대폰") ||
              headerName.includes("연락처");

            if (isPhoneColumn) {
              cell.numFmt = "@"; // 텍스트 포맷
            } else if (typeof normalizedValue === "number") {
              // 숫자 포맷 명시적 설정 (Excel에서 텍스트로 인식되는 문제 방지)
              cell.numFmt = "0"; // 정수 형식
            }
          });
        });
      } else {
        // 원본 워크시트가 없으면 헤더 행만 업데이트
        if (worksheet.rowCount === 0) {
          const normalizedHeaders = columnOrder.map((h: any) =>
            prepareExcelCellValue(h, false),
          );
          worksheet.addRow(normalizedHeaders);
        } else {
          columnOrder.forEach((header: string, colIdx: number) => {
            const colNumber = colIdx + 1;
            const cell = worksheet.getCell(1, colNumber);
            cell.value = prepareExcelCellValue(header, false);
          });
        }

        // 헤더 행 스타일 적용
        const headerRow = worksheet.getRow(1);
        applyHeaderStyle(headerRow, columnOrder, templateData.columnWidths);

        // 데이터 행 추가 (값 정규화)
        excelData.forEach((rowData) => {
          const normalizedRowData = rowData.map((cellValue: any) => {
            const normalized = prepareExcelCellValue(cellValue, false);
            return normalized;
          });
          const addedRow = worksheet.addRow(normalizedRowData);

          // 숫자 셀 및 전화번호 셀에 대한 포맷 설정
          addedRow.eachCell({includeEmpty: true}, (cell, colNumber) => {
            const headerName = columnOrder[colNumber - 1] || "";
            const isPhoneColumn =
              headerName.includes("전화") ||
              headerName.includes("전번") ||
              headerName.includes("핸드폰") ||
              headerName.includes("휴대폰") ||
              headerName.includes("연락처");

            if (isPhoneColumn) {
              cell.numFmt = "@"; // 텍스트 포맷
            } else if (typeof cell.value === "number") {
              cell.numFmt = "0";
            }
          });
        });
      }
    } else {
      // 원본 파일이 없으면 새로 생성
      worksheet = workbook.addWorksheet("Sheet1");

      // 헤더 행 추가 (값 정규화)
      const normalizedHeaders = columnOrder.map((h: any) =>
        prepareExcelCellValue(h, false),
      );
      worksheet.addRow(normalizedHeaders);

      // 헤더 행 스타일 적용
      const headerRow = worksheet.getRow(1);
      applyHeaderStyle(headerRow, columnOrder, templateData.columnWidths);

      // 데이터 행 추가 (값 정규화)
      excelData.forEach((rowData) => {
        const normalizedRowData = rowData.map((cellValue: any) =>
          prepareExcelCellValue(cellValue, false),
        );
        const addedRow = worksheet.addRow(normalizedRowData);

        // 숫자 셀 및 전화번호 셀에 대한 포맷 설정
        addedRow.eachCell({includeEmpty: true}, (cell, colNumber) => {
          const headerName = columnOrder[colNumber - 1] || "";
          const isPhoneColumn =
            headerName.includes("전화") ||
            headerName.includes("전번") ||
            headerName.includes("핸드폰") ||
            headerName.includes("휴대폰") ||
            headerName.includes("연락처");

          if (isPhoneColumn) {
            cell.numFmt = "@"; // 텍스트 포맷
          } else if (typeof cell.value === "number") {
            cell.numFmt = "0";
          }
        });
      });

      // 새 워크북의 속성 초기화 (Excel 호환성)
      initializeWorkbookProperties(workbook);
    }

    // 워크북이 제대로 초기화되었는지 확인
    if (!workbook) {
      throw new Error("워크북이 초기화되지 않았습니다.");
    }

    if (!workbook.xlsx) {
      throw new Error("워크북의 xlsx 모듈이 없습니다.");
    }

    // 워크시트가 있는지 확인
    if (!worksheet) {
      throw new Error("워크시트가 없습니다.");
    }

    // 워크북을 Excel 호환 모드로 완전히 정리 (CJ외주 발주서는 이미 처리됨)
    if (!isCJOutsource) {
      prepareWorkbookForExcel(workbook, {
        removeFormulas: false, // 수식은 유지 (필요시 true로 변경)
        removeDataValidations: false, // 데이터 검증은 유지
      });
    }

    // 엑셀 파일 생성
    let buffer: ArrayBuffer;
    try {
      const writeBuffer = await workbook.xlsx.writeBuffer();
      buffer = writeBuffer as ArrayBuffer;
    } catch (writeError: any) {
      console.error("엑셀 파일 생성 실패:", writeError);
      console.error("워크북 상태:", {
        hasProperties: !!workbook.properties,
        hasCalcProperties: !!(workbook as any).calcProperties,
        worksheetCount: workbook.worksheets.length,
      });
      throw new Error(`엑셀 파일을 생성할 수 없습니다: ${writeError.message}`);
    }

    // 파일명 생성
    const baseName = (templateData.name || "download").toString().trim();
    const fileName = generateExcelFileName(baseName);

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

    // 발주서 다운로드인 경우 주문상태 업데이트 (템플릿 이름에 "발주"가 포함된 경우)
    const templateName = (templateData.name || "").normalize("NFC").trim();
    const isPurchaseOrder = templateName.includes("발주");

    if (isPurchaseOrder) {
      try {
        // CJ외주 발주서인 경우: 필터링된 ID만 업데이트
        // 일반 발주서인 경우: rowIds가 있으면 선택된 행, 없으면 필터링된 데이터의 실제 다운로드된 행들 업데이트
        let idsToUpdate: number[] = [];

        if (isCJOutsource) {
          // CJ외주 발주서인 경우: 필터링된 ID만 업데이트
          if (rowIds && rowIds.length > 0 && rowIdsWithData.length > 0) {
            // 선택된 행이 있는 경우
            idsToUpdate = rowIdsWithData.map((r: any) => r.id);
          } else if (rowIdsWithData.length > 0) {
            // 필터링된 데이터만 있는 경우
            idsToUpdate = rowIdsWithData.map((r: any) => r.id);
          }
        } else {
          // 일반 발주서인 경우
          if (rowIds && rowIds.length > 0) {
            idsToUpdate = rowIds;
          } else if (rowIdsWithData.length > 0) {
            idsToUpdate = rowIdsWithData.map((r: any) => r.id);
          }
        }

        if (idsToUpdate.length > 0) {
          // 효율적인 단일 쿼리로 모든 row의 주문상태를 "발주서 다운"으로 업데이트
          // 현재 상태가 "공급중"인 경우에만 업데이트 (뒷단계로 돌아가지 않도록)
          // "사방넷 다운", "배송중" 상태는 유지됨 (조건에 포함되지 않으므로 업데이트되지 않음)
          await sql`
            UPDATE upload_rows
            SET row_data = jsonb_set(row_data, '{주문상태}', '"발주서 다운"', true)
            WHERE id = ANY(${idsToUpdate})
              AND (row_data->>'주문상태' IS NULL OR row_data->>'주문상태' = '공급중')
          `;
        }
      } catch (updateError) {
        console.error("주문상태 업데이트 실패:", updateError);
        // 주문상태 업데이트 실패해도 다운로드는 성공으로 처리
      }
    }

    // 헤더를 Headers 객체로 직접 설정하여 파싱 문제 방지
    const responseHeaders = new Headers();
    responseHeaders.set(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    // ASCII만 포함된 헤더 값 사용
    responseHeaders.set("Content-Disposition", contentDisposition);

    // Response 객체를 직접 사용하여 헤더 설정
    return new Response(buffer, {
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("엑셀 다운로드 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500},
    );
  }
}
