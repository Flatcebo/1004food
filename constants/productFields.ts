/**
 * 상품 필드 관련 상수
 */

/**
 * 필드 순서 정의 (공통)
 */
export const PRODUCT_FIELD_ORDER = [
  "type",
  "postType",
  "name",
  "sabangName",
  "code",
  "price",
  "salePrice",
  "postFee",
  "category",
  "purchase",
  "productType",
  "billType",
  "pkg",
  "etc",
] as const;

/**
 * 내외주 옵션
 */
export const TYPE_OPTIONS = [
  {value: "", label: "선택하세요"},
  {value: "내주", label: "내주"},
  {value: "외주", label: "외주"},
] as const;

/**
 * 택배사 옵션
 */
export const POST_TYPE_OPTIONS = [
  {value: "", label: "선택하세요"},
  {value: "CJ대한통운", label: "CJ대한통운"},
  {value: "우체국택배", label: "우체국택배"},
  {value: "로젠택배", label: "로젠택배"},
  {value: "롯데택배", label: "롯데택배"},
  {value: "한진택배", label: "한진택배"},
  {value: "천일택배", label: "천일택배"},
] as const;

/**
 * 세금구분 옵션
 */
export const BILL_TYPE_OPTIONS = [
  {value: "", label: "선택하세요"},
  {value: "과세", label: "과세"},
  {value: "면세", label: "면세"},
] as const;

/**
 * 상품구분 옵션
 */
export const PRODUCT_TYPE_OPTIONS = [
  {value: "", label: "선택하세요"},
  {value: "사입", label: "사입"},
  {value: "제조", label: "제조"},
  {value: "위탁", label: "위탁"},
] as const;

/**
 * 카테고리 옵션
 */
export const CATEGORY_OPTIONS = [
  {value: "", label: "선택하세요"},
  {value: "납품업체", label: "납품업체"},
  {value: "온라인", label: "온라인"},
] as const;

