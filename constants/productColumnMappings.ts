// products 테이블의 칼럼명과 엑셀 헤더를 매칭하기 위한 맵핑
export const PRODUCT_COLUMN_MAPPINGS: {
  [dbColumn: string]: string[];
} = {
  type: ["내외주", "타입", "type"],
  postType: ["택배사", "배송사", "post_type", "postType"],
  name: ["상품명", "상품명(확정)", "이름", "제품명", "name"],
  code: ["매핑코드", "상품코드(사방넷)", "상품코드", "code"],
  pkg: ["포장", "패키지", "pkg", "package"],
  price: ["가격", "단가", "원가(상품)", "price"],
  salePrice: ["판매가", "판매가격", "공급단가", "sale_price", "salePrice"],
  postFee: ["택배비", "배송비", "post_fee", "postFee"],
  purchase: ["구매처", "매입처", "매입처명", "업체", "거래처", "purchase"],
  billType: ["계산서", "세금구분", "세금계산서", "bill_type", "billType"],
  category: ["카테고리", "분류", "category"],
  productType: [
    "상품타입",
    "제품타입",
    "상품구분",
    "product_type",
    "productType",
  ],
  sabangName: [
    "사방넷명",
    "사방넷",
    "상품명(확정)",
    "sabang_name",
    "sabangName",
  ],
  etc: ["비고", "기타", "메모", "etc", "note"],
  // 순이익액
  // 순이익율
  // 주문번호(사방넷)
  // 주문번호(쇼핑몰)
  // 주문일시(YYYY-MM-DD HH:MM)
  // 쇼핑몰명(1)?
};

// 엑셀 헤더를 DB 칼럼명으로 변환
export function mapExcelHeaderToDbColumn(excelHeader: string): string | null {
  const normalized = excelHeader.replace(/\s+/g, "").toLowerCase();

  for (const [dbColumn, aliases] of Object.entries(PRODUCT_COLUMN_MAPPINGS)) {
    for (const alias of aliases) {
      if (normalized === alias.replace(/\s+/g, "").toLowerCase()) {
        return dbColumn;
      }
    }
  }

  return null;
}

// DB 칼럼명에 해당하는 기본 헤더명 반환
export function getDefaultHeaderName(dbColumn: string): string {
  const aliases = PRODUCT_COLUMN_MAPPINGS[dbColumn];
  return aliases && aliases.length > 0 ? aliases[0] : dbColumn;
}
