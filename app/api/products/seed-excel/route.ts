import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import * as XLSX from "xlsx";
import {mapExcelHeaderToDbColumn} from "@/constants/productColumnMappings";

// 한국 시간(KST, UTC+9)을 반환하는 함수
function getKoreaTime(): Date {
  const now = new Date();
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
  const koreaTime = new Date(utcTime + 9 * 3600000);
  return koreaTime;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        {success: false, error: "파일이 제공되지 않았습니다."},
        {status: 400}
      );
    }

    // 엑셀 파일 읽기
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, {type: "array"});

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return NextResponse.json(
        {success: false, error: "워크시트가 없습니다."},
        {status: 400}
      );
    }

    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // 헤더와 데이터 추출
    const raw = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      raw: false,
    }) as any[][];

    if (!raw.length || raw[0].length === 0) {
      return NextResponse.json(
        {success: false, error: "파일이 비어있거나 헤더가 없습니다."},
        {status: 400}
      );
    }

    // 헤더 매칭
    const headers = raw[0] as string[];
    const columnMapping: {[dbColumn: string]: number} = {};

    headers.forEach((header, index) => {
      const headerStr = String(header).trim();
      const normalized = headerStr.replace(/\s+/g, "").toLowerCase();
      
      // "상품명(확정)" 같은 헤더는 name과 sabangName 둘 다에 매칭
      if (normalized === "상품명(확정)" || normalized === "상품명(수집)") {
        columnMapping["name"] = index;
        columnMapping["sabangName"] = index;
      } else {
        const dbColumn = mapExcelHeaderToDbColumn(headerStr);
        if (dbColumn) {
          columnMapping[dbColumn] = index;
        }
      }
    });

    // 필수 칼럼 확인 (name과 code는 필수)
    if (
      columnMapping["name"] === undefined ||
      columnMapping["code"] === undefined
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "필수 칼럼이 없습니다. '상품명'과 '매핑코드' 칼럼은 필수입니다.",
          foundColumns: Object.keys(columnMapping),
        },
        {status: 400}
      );
    }

    // 데이터 행 파싱
    const products = [];
    for (let i = 1; i < raw.length; i++) {
      const row = raw[i];
      if (!row || row.length === 0) continue;

      const name = row[columnMapping["name"]];
      const code = row[columnMapping["code"]];

      // name과 code가 비어있는 행은 스킵
      if (!name || !code) continue;

      // 매핑코드에서 하이픈(-) 이후의 문자 제거 (예: "PROD-0001" → "PROD")
      const cleanedCode = String(code).trim().split("-")[0].trim();

      const product: any = {
        name: String(name).trim(),
        code: cleanedCode,
      };

      // 나머지 칼럼들 매핑
      Object.keys(columnMapping).forEach((dbColumn) => {
        if (dbColumn !== "name" && dbColumn !== "code") {
          const value = row[columnMapping[dbColumn]];
          if (value !== undefined && value !== null && value !== "") {
            // 숫자 타입 칼럼 처리
            if (["price", "salePrice", "postFee"].includes(dbColumn)) {
              const numValue = Number(value);
              if (!isNaN(numValue)) {
                product[dbColumn] = numValue;
              }
            } else {
              product[dbColumn] = String(value).trim();
            }
          }
        }
      });

      // 매입처명에 따라 내외주 자동 설정
      if (product.purchase) {
        const purchaseValue = String(product.purchase).trim();
        if (purchaseValue === "천사-제조" || purchaseValue === "천사-사입") {
          product.type = "내주";
        } else {
          product.type = "외주";
        }
      }

      products.push(product);
    }

    if (products.length === 0) {
      return NextResponse.json(
        {success: false, error: "저장할 유효한 데이터가 없습니다."},
        {status: 400}
      );
    }

    // 한국 시간 생성
    const koreaTime = getKoreaTime();

    // DB에 저장
    const insertPromises = products.map((product) => {
      return sql`
        INSERT INTO products (
          type, post_type, name, code, pkg, price, sale_price, post_fee,
          purchase, bill_type, category, product_type, sabang_name, etc
        ) VALUES (
          ${product.type || null},
          ${product.postType || null},
          ${product.name},
          ${product.code},
          ${product.pkg || null},
          ${product.price !== undefined ? product.price : null},
          ${product.salePrice !== undefined ? product.salePrice : null},
          ${product.postFee !== undefined ? product.postFee : null},
          ${product.purchase || null},
          ${product.billType || null},
          ${product.category || null},
          ${product.productType || null},
          ${product.sabangName || null},
          ${product.etc || null}
        )
        ON CONFLICT (name, code) DO UPDATE SET
          type = EXCLUDED.type,
          post_type = EXCLUDED.post_type,
          pkg = EXCLUDED.pkg,
          price = EXCLUDED.price,
          sale_price = EXCLUDED.sale_price,
          post_fee = EXCLUDED.post_fee,
          purchase = EXCLUDED.purchase,
          bill_type = EXCLUDED.bill_type,
          category = EXCLUDED.category,
          product_type = EXCLUDED.product_type,
          sabang_name = EXCLUDED.sabang_name,
          etc = EXCLUDED.etc,
          updated_at = ${koreaTime.toISOString()}::timestamp
      `;
    });

    await Promise.all(insertPromises);

    return NextResponse.json({
      success: true,
      message: `${products.length}개의 상품이 성공적으로 저장되었습니다.`,
      count: products.length,
      foundColumns: Object.keys(columnMapping),
    });
  } catch (error: any) {
    console.error("엑셀 파일 처리 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

