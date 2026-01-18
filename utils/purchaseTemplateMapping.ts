/**
 * Purchase 템플릿 기반 데이터 매핑 유틸리티
 * 
 * 이 파일은 나중에 purchase 템플릿을 사용한 다운로드 기능 구현 시 사용됩니다.
 * 
 * 사용 예시:
 * ```typescript
 * import { mapDataByColumnKey } from '@/utils/purchaseTemplateMapping';
 * 
 * const templateHeaders = purchase.template_headers; // [{column_key: "vendor", display_name: "업체명"}, ...]
 * const row = { 업체명: "ABC업체", 상품명: "상품1", ... };
 * 
 * templateHeaders.forEach(header => {
 *   const value = mapDataByColumnKey(row, header.column_key);
 *   // 엑셀에 header.display_name을 헤더로, value를 데이터로 저장
 * });
 * ```
 */

export interface TemplateHeader {
  column_key: string;
  column_label: string;
  display_name: string;
}

/**
 * column_key를 기반으로 DB 주문 데이터에서 값을 가져옵니다.
 * 헤더 Alias의 aliases 배열을 사용하여 매핑합니다.
 * 
 * @param row DB에서 가져온 주문 데이터 행
 * @param columnKey 템플릿 헤더의 column_key
 * @param headerAliases 헤더 Alias 배열 (column_key와 aliases 포함)
 * @returns 매핑된 데이터 값
 */
export function mapDataByColumnKey(
  row: any,
  columnKey: string,
  headerAliases?: Array<{column_key: string; aliases: string[]}>
): any {
  // 헤더 Alias가 제공된 경우 사용
  if (headerAliases && headerAliases.length > 0) {
    const aliasData = headerAliases.find(
      (alias) => alias.column_key === columnKey
    );
    
    if (aliasData && aliasData.aliases && aliasData.aliases.length > 0) {
      // aliases 배열의 모든 항목을 시도
      for (const alias of aliasData.aliases) {
        // 정확히 일치하는 키 확인
        if (row[alias] !== undefined && row[alias] !== null && row[alias] !== "") {
          return row[alias];
        }
        
        // 대소문자 구분 없이 확인 (공백 제거 후 비교)
        const normalizedAlias = alias.replace(/\s+/g, "").toLowerCase();
        for (const key in row) {
          const normalizedKey = key.replace(/\s+/g, "").toLowerCase();
          if (
            normalizedKey === normalizedAlias &&
            row[key] !== undefined &&
            row[key] !== null &&
            row[key] !== ""
          ) {
            return row[key];
          }
        }
      }
    }
  }

  // 폴백: 기본 매핑 규칙 (하위 호환성 유지)
  const columnKeyMap: {[key: string]: string[]} = {
    // 업체 관련
    vendor: ["업체명", "vendor_name", "고객주문처명", "납품업체명"],
    
    // 쇼핑몰 관련
    shopName: ["쇼핑몰명", "mall_name", "몰명"],
    
    // 내외주
    inout: ["내외주", "inout"],
    
    // 택배사
    carrier: ["택배사", "carrier", "택배사명", "배송사"],
    
    // 수령인 정보
    receiverName: ["수령인명", "받는사람", "수취인명", "receiver_name"],
    receiverPhone: ["수령인연락처", "전화번호1", "전화번호", "수취인전화번호", "receiver_phone"],
    receiverAddr: ["수령인주소", "주소", "수취인주소", "receiver_addr"],
    
    // 상품 정보
    productName: ["상품명", "product_name", "제품명", "품명"],
    productOption: ["옵션", "product_option", "옵션명", "상품옵션"],
    quantity: ["수량", "quantity", "개수", "갯수", "주문수량"],
    
    // 주문 정보
    orderNumber: ["주문번호", "order_number", "오더넘버"],
    
    // 기타
    box: ["박스", "박스수량", "박스개수"],
    volume: ["부피", "부피중량", "무게", "중량"],
  };

  // column_key에 해당하는 필드명 목록 가져오기
  const possibleFields = columnKeyMap[columnKey] || [columnKey];

  // 가능한 필드명들을 순서대로 확인하여 값이 있는 첫 번째 필드 반환
  for (const field of possibleFields) {
    if (row[field] !== undefined && row[field] !== null && row[field] !== "") {
      return row[field];
    }
  }

  // 매핑되는 필드가 없으면 빈 문자열 반환
  return "";
}

/**
 * Purchase 템플릿 헤더를 사용하여 주문 데이터 행을 엑셀 데이터 행으로 변환합니다.
 * 
 * @param row DB에서 가져온 주문 데이터 행
 * @param templateHeaders 템플릿 헤더 배열 (순서대로)
 * @param headerAliases 헤더 Alias 배열 (선택사항)
 * @returns 엑셀 데이터 행 (배열)
 */
export function mapRowToTemplateFormat(
  row: any,
  templateHeaders: TemplateHeader[],
  headerAliases?: Array<{column_key: string; aliases: string[]}>
): any[] {
  return templateHeaders.map((header) => {
    return mapDataByColumnKey(row, header.column_key, headerAliases);
  });
}

/**
 * Purchase 템플릿 헤더의 display_name 배열을 반환합니다.
 * 엑셀 파일의 헤더 행으로 사용됩니다.
 * 
 * @param templateHeaders 템플릿 헤더 배열
 * @returns 헤더명 배열
 */
export function getTemplateHeaderNames(
  templateHeaders: TemplateHeader[]
): string[] {
  return templateHeaders.map((header) => header.display_name);
}
