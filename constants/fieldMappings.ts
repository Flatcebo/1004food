// 필드명 한글 매핑
export const fieldNameMap: {[key: string]: string} = {
  name: "상품명",
  sabangName: "사방넷명",
  code: "매핑코드",
  type: "내외주",
  postType: "택배사",
  pkg: "합포수량",
  price: "가격",
  salePrice: "판매가",
  postFee: "택배비",
  purchase: "매입처",
  billType: "세금구분",
  category: "카테고리",
  productType: "상품구분",
  etc: "기타",
};

// 추천 모달 테이블 고정 헤더 순서 (신규 입력과 동일한 순서)
export const fixedRecommendTableHeaders = [
  "type",
  "postType",
  "name",
  "sabangName",
  "code",
  "pkg",
  "price",
  "salePrice",
  "postFee",
  "category",
  "purchase",
  "productType",
  "billType",
  "etc",
];
