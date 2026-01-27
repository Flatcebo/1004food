import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import {getCompanyIdFromRequest} from "@/lib/company";

export async function PUT(request: NextRequest) {
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
    const {rowId, codeData} = body;

    if (!rowId || !codeData) {
      return NextResponse.json(
        {success: false, error: "rowId와 codeData가 필요합니다."},
        {status: 400}
      );
    }

    // 기존 row_data 조회 (company_id 필터링)
    const existingRow = await sql`
      SELECT ur.row_data
      FROM upload_rows ur
      INNER JOIN uploads u ON ur.upload_id = u.id
      WHERE ur.id = ${rowId} AND u.company_id = ${companyId}
    `;

    if (existingRow.length === 0) {
      return NextResponse.json(
        {success: false, error: "해당 행을 찾을 수 없습니다."},
        {status: 404}
      );
    }

    const currentRowData = existingRow[0].row_data;
    const currentProductName = currentRowData?.상품명 || "";

    // 기존 row_data를 복사하고 선택한 매핑코드의 모든 필드를 업데이트
    // 단, 상품명은 기존 것을 유지
    const updatedRowData: any = {
      ...currentRowData,
      매핑코드: codeData.code, // 절대적으로 선택한 매핑코드 사용
      내외주: codeData.type,
      택배사: codeData.postType,
      합포수량: codeData.pkg,
      가격: codeData.price,
      택배비: codeData.postFee,
      기타: codeData.etc || "",
      상품명: currentProductName, // 기존 상품명 유지
    };

    // 선택한 상품 ID로 업데이트 (다운로드 및 정산 시 정확한 상품을 찾기 위함)
    // 중요: 이전 productId가 남아있으면 정산 갱신 시 잘못된 상품이 매칭될 수 있음
    if (codeData.productId) {
      updatedRowData.productId = codeData.productId;
    } else {
      // productId가 없으면 이전 값을 삭제하여 매핑코드로만 매칭되도록 함
      delete updatedRowData.productId;
    }

    // 디버깅: 업데이트 전 로그
    console.log(`📝 [update-code] rowId=${rowId}, 새 매핑코드=${codeData.code}, 새 productId=${codeData.productId || 'N/A'}`);
    console.log(`📝 [update-code] 업데이트할 row_data:`, {
      매핑코드: updatedRowData.매핑코드,
      productId: updatedRowData.productId,
    });

    // 상품의 매입처(purchase) 정보로 purchase_id 업데이트
    let purchaseId: number | null = null;
    if (codeData.productId) {
      try {
        // 상품에서 purchase 값 조회
        const productResult = await sql`
          SELECT pr.purchase FROM products pr
          WHERE pr.id = ${codeData.productId} AND pr.company_id = ${companyId}
        `;
        
        if (productResult.length > 0 && productResult[0].purchase) {
          // purchase 이름으로 purchase 테이블에서 id 조회
          const purchaseResult = await sql`
            SELECT id FROM purchase
            WHERE name = ${productResult[0].purchase} AND company_id = ${companyId}
          `;
          
          if (purchaseResult.length > 0) {
            purchaseId = purchaseResult[0].id;
            console.log(`📝 [update-code] 매입처 연결: productId=${codeData.productId}, purchase=${productResult[0].purchase}, purchaseId=${purchaseId}`);
          }
        }
      } catch (error) {
        console.error("매입처 조회 실패:", error);
      }
    }

    // row_data 및 purchase_id 업데이트
    const result = await sql`
      UPDATE upload_rows
      SET row_data = ${JSON.stringify(updatedRowData)}::jsonb,
          purchase_id = ${purchaseId}
      WHERE id = ${rowId}
      RETURNING id, row_data, purchase_id
    `;

    // 디버깅: 업데이트 후 확인
    if (result.length > 0) {
      const savedRowData = result[0].row_data;
      console.log(`✅ [update-code] 저장 완료:`, {
        rowId: result[0].id,
        매핑코드: savedRowData?.매핑코드,
        productId: savedRowData?.productId,
      });
    }

    if (result.length === 0) {
      return NextResponse.json(
        {success: false, error: "업데이트 실패"},
        {status: 500}
      );
    }

    return NextResponse.json({
      success: true,
      data: result[0],
    });
  } catch (error: any) {
    console.error("매핑코드 업데이트 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
