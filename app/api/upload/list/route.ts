import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest, getUserIdFromRequest} from "@/lib/company";

export async function GET(request: NextRequest) {
  try {
    // company_id 추출
    const companyId = await getCompanyIdFromRequest(request);
    if (!companyId) {
      return NextResponse.json(
        {success: false, error: "company_id가 필요합니다."},
        {status: 400}
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const statsOnly = searchParams.get("stats") === "true";

    // user_id 추출 및 grade 확인 (먼저 조회)
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

    // grade별 필터링 조건 구성
    let gradeFilterCondition = sql``;
    if (userGrade === "납품업체" || userGrade === "온라인") {
      // 납품업체 또는 온라인 grade인 경우, 같은 grade를 가진 사용자들이 업로드한 데이터만 조회
      gradeFilterCondition = sql`
        AND EXISTS (
          SELECT 1 FROM users usr
          WHERE usr.id::text = u.user_id::text
          AND usr.company_id = ${companyId}
          AND usr.grade = ${userGrade}
        )
      `;
    }
    // 관리자, 직원은 gradeFilterCondition이 비어있어서 모든 데이터 조회

    // 통계만 요청한 경우
    if (statsOnly) {
      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD 형식

      // 총 주문 수 (company_id 및 grade 필터링)
      const totalResult = await sql`
        SELECT COUNT(*) as total FROM upload_rows ur
        INNER JOIN uploads u ON ur.upload_id = u.id
        WHERE u.company_id = ${companyId}
        ${gradeFilterCondition}
      `;

      // 오늘 주문 수 (업로드 날짜 기준, company_id 및 grade 필터링)
      const todayResult = await sql`
        SELECT COUNT(*) as today FROM upload_rows ur
        INNER JOIN uploads u ON ur.upload_id = u.id
        WHERE DATE(u.created_at) = ${today} AND u.company_id = ${companyId}
        ${gradeFilterCondition}
      `;

      // 대기 주문 수 (주문상태가 '대기'인 경우, company_id 및 grade 필터링)
      const pendingResult = await sql`
        SELECT COUNT(*) as pending FROM upload_rows ur
        INNER JOIN uploads u ON ur.upload_id = u.id
        WHERE ur.row_data->>'주문상태' IN ('대기', '접수', '준비중')
        AND u.company_id = ${companyId}
        ${gradeFilterCondition}
      `;

      return NextResponse.json({
        success: true,
        stats: {
          totalOrders: parseInt(totalResult[0].total),
          todayOrders: parseInt(todayResult[0].today),
          pendingOrders: parseInt(pendingResult[0].pending),
        },
      });
    }

    const type = searchParams.get("type");
    const postType = searchParams.get("postType");
    const vendors = searchParams.getAll("vendor"); // 다중 vendors 지원
    const companies = searchParams.getAll("company"); // 다중 companies 지원
    const orderStatus = searchParams.get("orderStatus");
    const searchField = searchParams.get("searchField");
    const searchValue = searchParams.get("searchValue");
    const uploadTimeFrom = searchParams.get("uploadTimeFrom");
    const uploadTimeTo = searchParams.get("uploadTimeTo");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = (page - 1) * limit;

    // 검색 필드 매핑
    const fieldMap: {[key: string]: string} = {
      수취인명: "수취인명",
      주문자명: "주문자명",
      상품명: "상품명",
      매핑코드: "매핑코드",
      내부코드: "내부코드",
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
    
    // 주문상태 조건을 매입처명 조건보다 먼저 추가 (순서 변경)
    if (orderStatus && orderStatus.trim() !== "") {
      console.log("✅ API에서 주문상태 필터링 조건 추가:", orderStatus);
      conditions.push(sql`ur.row_data->>'주문상태' = ${orderStatus}`);
      console.log("✅ 주문상태 조건 추가 완료, 현재 conditions.length:", conditions.length);
    } else {
      console.log("❌ API에서 주문상태 필터링 조건 추가 안됨:", {
        orderStatus,
        isEmpty: orderStatus?.trim() === "",
      });
    }
    
    if (vendors && vendors.length > 0) {
      console.log("🔍 매입처명 필터링 조건 추가:", {
        vendors,
        vendorsLength: vendors.length,
        vendorsType: typeof vendors,
        firstVendor: vendors[0],
      });
      
      // 다중 vendors 필터링 (OR 조건)
      // purchase 테이블의 name 필드와 비교
      // products.purchase가 purchase.name과 일치하는 경우를 찾음
      // 괄호로 묶어서 우선순위 명확히 (다른 조건들과 AND로 연결될 때 문제 방지)
      // 괄호가 포함된 문자열도 정확히 매칭되도록 직접 비교
      conditions.push(sql`(
        EXISTS (
          SELECT 1 FROM products p
          INNER JOIN purchase pur ON p.purchase = pur.name
          WHERE p.code = ur.row_data->>'매핑코드'
          AND p.company_id = ${companyId}
          AND pur.company_id = ${companyId}
          AND pur.name = ANY(${vendors}::text[])
        )
        OR ur.row_data->>'업체명' = ANY(${vendors}::text[])
      )`);
      
      console.log("✅ 매입처명 조건 추가 완료");
    }
    if (companies && companies.length > 0) {
      // 다중 companies 필터링 (OR 조건)
      conditions.push(sql`ur.row_data->>'업체명' = ANY(${companies})`);
    }
    if (dbField && searchPattern) {
      conditions.push(sql`ur.row_data->>${dbField} ILIKE ${searchPattern}`);
    }
    if (uploadTimeFrom) {
      conditions.push(sql`u.created_at >= ${uploadTimeFrom}::date`);
    }
    if (uploadTimeTo) {
      conditions.push(
        sql`u.created_at < (${uploadTimeTo}::date + INTERVAL '1 day')`
      );
    }

    // 주문상태 조건이 실제로 추가되었는지 확인
    const orderStatusCondition = conditions.find((c: any, index: number) => {
      try {
        // sql 템플릿 리터럴의 구조 확인
        const conditionStr = JSON.stringify(c);
        return conditionStr.includes("주문상태");
      } catch (e) {
        return false;
      }
    });
    
    console.log("🔍 조건 배열 확인:", {
      conditionsCount: conditions.length,
      hasOrderStatusCondition: !!orderStatusCondition,
      orderStatusCondition: orderStatusCondition ? "찾음" : "없음",
    });

    // 조건부 쿼리 구성 (항상 company_id 조건 포함)
    const buildQuery = (selectClause: any, includeLimit = false) => {
      // 첫 번째 조건(company_id)으로 WHERE 시작
      let query = sql`${selectClause} WHERE ${conditions[0]}`;

      // 나머지 조건들을 순차적으로 AND로 연결
      // 다른 파일들(download/route.ts)과 동일한 방식 사용
      for (let i = 1; i < conditions.length; i++) {
        const condition = conditions[i];
        const isOrderStatus = JSON.stringify(condition).includes("주문상태");
        
        console.log(`🔍 조건 ${i} 추가:`, {
          index: i,
          conditionType: typeof condition,
          hasOrderStatus: isOrderStatus,
        });
        
        // 주문상태 조건인 경우 특별히 로그 출력
        if (isOrderStatus) {
          console.log("🚨 주문상태 조건 추가 중:", {
            orderStatus,
            conditionIndex: i,
            totalConditions: conditions.length,
          });
        }
        
        // 조건을 AND로 연결 (다른 파일들과 동일한 방식)
        query = sql`${query} AND ${condition}`;
      }

      if (includeLimit) {
        query = sql`${query} ORDER BY u.created_at DESC, ur.id DESC LIMIT ${limit} OFFSET ${offset}`;
      }

      return query;
    };

    // 전체 개수 조회 쿼리
    const countQuery = buildQuery(
      sql`SELECT COUNT(*) as total FROM upload_rows ur INNER JOIN uploads u ON ur.upload_id = u.id`
    );

    // 데이터 조회 쿼리 (페이지네이션 적용, 한국 시간을 문자열로 반환하여 UTC 해석 방지)
    const dataQuery = buildQuery(
      sql`
        SELECT 
          ur.id,
          ur.upload_id,
          ur.row_data,
          ur.shop_name,
          u.file_name,
          TO_CHAR(u.created_at, 'YYYY-MM-DD HH24:MI:SS') as upload_time
        FROM upload_rows ur
        INNER JOIN uploads u ON ur.upload_id = u.id
      `,
      true
    );

    // 두 쿼리를 병렬로 실행
    console.log("🔍 실행 전 최종 확인:", {
      conditionsLength: conditions.length,
      orderStatus: orderStatus,
      orderStatusInConditions: conditions.some((c: any) => {
        try {
          return JSON.stringify(c).includes("주문상태");
        } catch {
          return false;
        }
      }),
    });
    
    // 테스트: 각 조건별로 몇 개의 행이 매칭되는지 확인
    if (orderStatus && orderStatus.trim() !== "") {
      try {
        // 주문상태만 필터링
        const testOrderStatusQuery = sql`
          SELECT COUNT(*) as count
          FROM upload_rows ur
          INNER JOIN uploads u ON ur.upload_id = u.id
          WHERE u.company_id = ${companyId}
            AND ur.row_data->>'주문상태' = ${orderStatus}
        `;
        const testOrderStatusResult = await testOrderStatusQuery;
        
        // 매입처명만 필터링 (purchase 테이블 사용)
        let testVendorResult = null;
        if (vendors && vendors.length > 0) {
          const testVendorQuery = sql`
            SELECT COUNT(*) as count
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE u.company_id = ${companyId}
              AND (
                EXISTS (
                  SELECT 1 FROM products p
                  INNER JOIN purchase pur ON p.purchase = pur.name
                  WHERE p.code = ur.row_data->>'매핑코드'
                  AND p.company_id = ${companyId}
                  AND pur.company_id = ${companyId}
                  AND pur.name = ANY(${vendors}::text[])
                )
                OR ur.row_data->>'업체명' = ANY(${vendors}::text[])
              )
          `;
          testVendorResult = await testVendorQuery;
        }
        
        // 매입처명 + 주문상태 함께 필터링 (purchase 테이블 사용)
        let testBothResult = null;
        if (vendors && vendors.length > 0) {
          const testBothQuery = sql`
            SELECT COUNT(*) as count
            FROM upload_rows ur
            INNER JOIN uploads u ON ur.upload_id = u.id
            WHERE u.company_id = ${companyId}
              AND (
                EXISTS (
                  SELECT 1 FROM products p
                  INNER JOIN purchase pur ON p.purchase = pur.name
                  WHERE p.code = ur.row_data->>'매핑코드'
                  AND p.company_id = ${companyId}
                  AND pur.company_id = ${companyId}
                  AND pur.name = ANY(${vendors}::text[])
                )
                OR ur.row_data->>'업체명' = ANY(${vendors}::text[])
              )
              AND ur.row_data->>'주문상태' = ${orderStatus}
          `;
          testBothResult = await testBothQuery;
        }
        
        console.log("🔍 테스트 쿼리 결과:", {
          orderStatus,
          vendors,
          orderStatusOnly: testOrderStatusResult[0]?.count || 0,
          vendorOnly: testVendorResult?.[0]?.count || 0,
          bothConditions: testBothResult?.[0]?.count || 0,
        });
        
        // 실제 데이터베이스에 저장된 매입처명 값 샘플 확인
        if (vendors && vendors.length > 0) {
          try {
            const samplePurchaseQuery = sql`
              SELECT DISTINCT pur.name as purchase_name
              FROM purchase pur
              WHERE pur.company_id = ${companyId}
                AND pur.name IS NOT NULL
              LIMIT 10
            `;
            const samplePurchases = await samplePurchaseQuery;
            console.log("🔍 purchase 테이블의 name 샘플:", {
              samples: samplePurchases.map((p: any) => p.purchase_name),
              filterVendors: vendors,
            });
            
            const sampleCompanyNameQuery = sql`
              SELECT DISTINCT ur.row_data->>'업체명' as company_name
              FROM upload_rows ur
              INNER JOIN uploads u ON ur.upload_id = u.id
              WHERE u.company_id = ${companyId}
                AND ur.row_data->>'업체명' IS NOT NULL
              LIMIT 10
            `;
            const sampleCompanyNames = await sampleCompanyNameQuery;
            console.log("🔍 upload_rows의 업체명 샘플:", {
              samples: sampleCompanyNames.map((c: any) => c.company_name),
              filterVendors: vendors,
            });
          } catch (sampleError) {
            console.error("샘플 조회 실패:", sampleError);
          }
        }
      } catch (testError) {
        console.error("테스트 쿼리 실패:", testError);
      }
    }
    
    const [countResult, rows] = await Promise.all([countQuery, dataQuery]);
    
    console.log("🔍 쿼리 실행 결과:", {
      totalCount: Array.isArray(countResult) && countResult.length > 0 ? countResult[0].total : 0,
      rowsCount: Array.isArray(rows) ? rows.length : 0,
    });
    
    // 결과에서 실제 주문상태 값들 확인
    if (Array.isArray(rows) && rows.length > 0) {
      const orderStatuses = rows
        .map((r: any) => r.row_data?.주문상태)
        .filter(Boolean)
        .slice(0, 10);
      console.log("🔍 결과의 주문상태 샘플:", {
        sampleCount: orderStatuses.length,
        orderStatuses,
        requestedOrderStatus: orderStatus,
      });
    }

    const totalCount =
      Array.isArray(countResult) && countResult.length > 0
        ? parseInt(countResult[0].total as string, 10)
        : 0;

    // mall 필터링 조건 구성
    let mallFilterCondition = sql``;

    // 필터 목록 조회 (company_id 및 grade 필터링)
    const [typeList, postTypeList, vendorList, companyList] = await Promise.all(
      [
        sql`SELECT DISTINCT ur.row_data->>'내외주' as type FROM upload_rows ur INNER JOIN uploads u ON ur.upload_id = u.id WHERE u.company_id = ${companyId} ${gradeFilterCondition} AND ur.row_data->>'내외주' IS NOT NULL ORDER BY type`,
        sql`SELECT DISTINCT ur.row_data->>'택배사' as post_type FROM upload_rows ur INNER JOIN uploads u ON ur.upload_id = u.id WHERE u.company_id = ${companyId} ${gradeFilterCondition} AND ur.row_data->>'택배사' IS NOT NULL ORDER BY post_type`,
        sql`SELECT DISTINCT name as vendor FROM purchase WHERE company_id = ${companyId} AND name IS NOT NULL ORDER BY name`,
        sql`SELECT DISTINCT name as company FROM mall WHERE name IS NOT NULL ${mallFilterCondition} ORDER BY name`,
      ]
    );

    return NextResponse.json({
      success: true,
      data: Array.isArray(rows) ? rows : [],
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      filters: {
        types: typeList.map((t: any) => t.type).filter(Boolean),
        postTypes: postTypeList.map((pt: any) => pt.post_type).filter(Boolean),
        vendors: vendorList.map((v: any) => v.vendor).filter(Boolean),
        companies: companyList.map((c: any) => c.company).filter(Boolean),
      },
    });
  } catch (error: any) {
    console.error("데이터 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
