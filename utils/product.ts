/**
 * 상품 관련 유틸리티 함수
 */
import {PRODUCT_FIELD_ORDER} from "@/constants/productFields";

/**
 * 빈 문자열을 null로 변환
 */
export function toNullIfEmpty(
  value: string | undefined | null
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * 숫자로 변환하거나 null로 변환
 */
export function toNumberOrNull(
  value: string | undefined | null
): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  if (trimmed === "") {
    return null;
  }
  const num = parseInt(trimmed, 10);
  return isNaN(num) ? null : num;
}

/**
 * 상품 데이터를 API 요청 형식으로 변환
 */
import type {ProductCreateRequest} from "@/types/api";

export function transformProductData(values: {
  [key: string]: string;
}): ProductCreateRequest {
  return {
    type: toNullIfEmpty(values.type),
    postType: toNullIfEmpty(values.postType),
    name: String(values.name).trim(),
    code: String(values.code).trim(),
    pkg: toNullIfEmpty(values.pkg),
    price: toNumberOrNull(values.price),
    salePrice: toNumberOrNull(values.salePrice),
    postFee: toNumberOrNull(values.postFee),
    purchase: toNullIfEmpty(values.purchase),
    billType: toNullIfEmpty(values.billType),
    category: toNullIfEmpty(values.category),
    productType: toNullIfEmpty(values.productType),
    sabangName: toNullIfEmpty(values.sabangName),
    etc: toNullIfEmpty(values.etc),
  };
}

/**
 * Product 객체를 DirectInputModal 형식으로 변환
 */
import type {Product} from "@/types/api";

export function productToFormValues(product: Product): {[key: string]: string} {
  const values: {[key: string]: string} = {};
  PRODUCT_FIELD_ORDER.forEach((field) => {
    const value = product[field];
    if (value !== null && value !== undefined) {
      values[field] = String(value);
    } else {
      values[field] = "";
    }
  });
  return values;
}

