import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";
import stringSimilarity from "string-similarity";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {productName} = body;

    if (!productName || typeof productName !== "string") {
      return NextResponse.json(
        {success: false, error: "상품명 또는 매핑코드가 필요합니다."},
        {status: 400}
      );
    }

    const searchTerm = productName.trim();

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

    // 매핑코드로 검색 (정확한 매칭 우선)
    const codeMatches = allProducts.filter(
      (p: any) =>
        p.code &&
        String(p.code).trim().toLowerCase() === searchTerm.toLowerCase()
    );

    if (codeMatches.length > 0) {
      // 매핑코드로 찾은 경우, 택배사가 있는 상품 우선 정렬
      const sortedMatches = codeMatches.sort((a: any, b: any) => {
        const aHasPostType = a.postType && String(a.postType).trim() !== "";
        const bHasPostType = b.postType && String(b.postType).trim() !== "";
        if (aHasPostType && !bHasPostType) return -1;
        if (!aHasPostType && bHasPostType) return 1;
        return 0;
      });

      // 상품명, 사방넷명, 매핑코드가 모두 같은 항목들 중복 제거
      // 같은 조합을 가진 항목이 여러 개 있을 때, 택배사가 있는 것을 우선 선택
      const groupedByKey = new Map<string, any[]>();

      // 먼저 같은 키를 가진 항목들을 그룹화
      sortedMatches.forEach((item: any) => {
        const name = String(item.name || "").trim();
        const code = String(item.code || "").trim();
        const sabangName = String(item.sabangName || "").trim();
        // 상품명, 사방넷명, 매핑코드를 모두 포함한 키 생성
        const key = `${name}|${sabangName}|${code}`;

        if (!groupedByKey.has(key)) {
          groupedByKey.set(key, []);
        }
        groupedByKey.get(key)!.push(item);
      });

      // 각 그룹에서 택배사가 있는 항목을 우선 선택
      const uniqueSuggestions: any[] = [];
      groupedByKey.forEach((items) => {
        // 택배사가 있는 항목 찾기
        const itemWithPostType = items.find((item: any) => {
          const postType = item?.postType;
          return postType && String(postType).trim() !== "";
        });

        // 택배사가 있는 항목이 있으면 그것을, 없으면 첫 번째 항목을 선택
        uniqueSuggestions.push(itemWithPostType || items[0]);
      });

      // 최종 결과도 택배사가 있는 것을 우선 정렬
      uniqueSuggestions.sort((a: any, b: any) => {
        const aHasPostType = a.postType && String(a.postType).trim() !== "";
        const bHasPostType = b.postType && String(b.postType).trim() !== "";
        if (aHasPostType && !bHasPostType) return -1;
        if (!aHasPostType && bHasPostType) return 1;
        return 0;
      });

      return NextResponse.json({
        success: true,
        data: uniqueSuggestions.slice(0, 10), // 매핑코드 검색은 더 많은 결과 반환
      });
    }

    // 상품명으로 검색 (문자열 유사도 기반)
    const productNames = allProducts.map((p: any) => p.name);
    const results = stringSimilarity.findBestMatch(searchTerm, productNames);

    // 유사도 0.2 이상인 항목만 필터링 (더 많은 결과를 위해 기준 완화)
    // 같은 상품명을 가진 모든 상품을 찾아서 택배사가 있는 것을 우선 선택
    const ratedProducts = results.ratings
      .filter((r: any) => r.rating > 0.2)
      .flatMap((r: any) => {
        // 같은 이름을 가진 모든 상품 찾기
        const productsWithSameName = allProducts.filter(
          (p: any) => p.name === r.target
        );

        // 택배사가 있는 상품 우선 선택
        const productsWithPostType = productsWithSameName.filter(
          (p: any) => p.postType && String(p.postType).trim() !== ""
        );
        const productsWithoutPostType = productsWithSameName.filter(
          (p: any) => !p.postType || String(p.postType).trim() === ""
        );

        // 택배사가 있는 상품이 있으면 그것들을, 없으면 모든 상품을 반환
        const productsToUse =
          productsWithPostType.length > 0
            ? productsWithPostType
            : productsWithoutPostType;

        return productsToUse.map((product: any) => ({
          product,
          rating: r.rating,
        }));
      })
      .filter((item: any) => !!item.product);

    // 정렬: 1순위 택배사 유무(있는 것 우선), 2순위 유사도(내림차순)
    // 택배사가 있는 상품을 최우선으로 하되, 같은 택배사 유무 그룹 내에서는 유사도가 높은 것을 우선
    const sortedProducts = ratedProducts.sort((a: any, b: any) => {
      const aHasPostType =
        a.product.postType && String(a.product.postType).trim() !== "";
      const bHasPostType =
        b.product.postType && String(b.product.postType).trim() !== "";

      // 1순위: 택배사가 있는 것을 우선
      if (aHasPostType && !bHasPostType) return -1;
      if (!aHasPostType && bHasPostType) return 1;

      // 2순위: 택배사 유무가 같은 경우, 유사도가 높은 것을 우선 (내림차순)
      return b.rating - a.rating;
    });

    // 상위 20개 선택 (더 많은 추천 결과 제공)
    const suggestions = sortedProducts
      .slice(0, 20)
      .map((item: any) => item.product);

    // 상품명, 사방넷명, 매핑코드가 모두 같은 항목들 중복 제거
    // 같은 조합을 가진 항목이 여러 개 있을 때, 택배사가 있는 것을 우선 선택
    const groupedByKey = new Map<string, any[]>();

    // 먼저 같은 키를 가진 항목들을 그룹화
    suggestions.forEach((item: any) => {
      const name = String(item.name || "").trim();
      const code = String(item.code || "").trim();
      const sabangName = String(item.sabangName || "").trim();
      // 상품명, 사방넷명, 매핑코드를 모두 포함한 키 생성
      const key = `${name}|${sabangName}|${code}`;

      if (!groupedByKey.has(key)) {
        groupedByKey.set(key, []);
      }
      groupedByKey.get(key)!.push(item);
    });

    // 각 그룹에서 택배사가 있는 항목을 우선 선택
    const uniqueSuggestions: any[] = [];
    groupedByKey.forEach((items) => {
      // 택배사가 있는 항목 찾기
      const itemWithPostType = items.find((item: any) => {
        const postType = item?.postType;
        return postType && String(postType).trim() !== "";
      });

      // 택배사가 있는 항목이 있으면 그것을, 없으면 첫 번째 항목을 선택
      uniqueSuggestions.push(itemWithPostType || items[0]);
    });

    // 최종 결과도 택배사가 있는 것을 우선 정렬
    uniqueSuggestions.sort((a: any, b: any) => {
      const aHasPostType = a.postType && String(a.postType).trim() !== "";
      const bHasPostType = b.postType && String(b.postType).trim() !== "";
      if (aHasPostType && !bHasPostType) return -1;
      if (!aHasPostType && bHasPostType) return 1;
      return 0;
    });

    // 디버깅: 반환되는 데이터 확인
    console.log(
      "상품명 검색 결과:",
      uniqueSuggestions.slice(0, 5).map((item: any) => ({
        name: item.name,
        code: item.code,
        sabangName: item.sabangName,
        postType: item.postType,
        hasPostType: item.postType && String(item.postType).trim() !== "",
      }))
    );

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
