import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import stringSimilarity from "string-similarity";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {productName} = body;

    if (!productName || typeof productName !== "string") {
      return NextResponse.json(
        {success: false, error: "상품명이 필요합니다."},
        {status: 400}
      );
    }

    // 모든 상품 조회
    const allProducts = await sql`
      SELECT 
        id,
        type,
        post_type as "postType",
        name,
        code,
        pkg,
        price,
        sale_price as "salePrice",
        post_fee as "postFee",
        purchase,
        bill_type as "billType",
        category,
        product_type as "productType",
        sabang_name as "sabangName",
        etc
      FROM products
    `;

    if (allProducts.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    // 문자열 유사도 기반 매칭
    const productNames = allProducts.map((p: any) => p.name);
    const results = stringSimilarity.findBestMatch(productName, productNames);

    // 유사도 0.3 이상인 항목만 필터링하고 상위 5개 선택
    const suggestions = results.ratings
      .sort((a: any, b: any) => b.rating - a.rating)
      .filter((r: any) => r.rating > 0.3)
      .slice(0, 5)
      .map((r: any) => {
        const product = allProducts.find((p: any) => p.name === r.target);
        return product;
      })
      .filter((item: any) => !!item);

    // 매핑코드가 같은 항목들 중복 제거 (첫 번째 항목만 유지)
    const seenCodes = new Set<string>();
    const uniqueSuggestions = suggestions.filter((item: any) => {
      const code = item.code || "";
      if (seenCodes.has(code)) {
        return false;
      }
      seenCodes.add(code);
      return true;
    });

    return NextResponse.json({
      success: true,
      data: uniqueSuggestions,
    });
  } catch (error: any) {
    console.error("상품 검색 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

