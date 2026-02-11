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
  default_value?: string;
  original_column_key?: string; // 복사된 헤더의 경우 원본 column_key
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
  headerAliases?: Array<{column_key: string; aliases: string[]}>,
  originalColumnKey?: string, // 복사된 헤더의 경우 원본 column_key
): any {
  // 특수 헤더 처리
  if (columnKey === "__auto_increment__") {
    return ""; // 자동 번호는 빈 값으로 반환 (엑셀 생성 시 번호를 매김)
  }

  if (columnKey === "__delivery_date__") {
    return ""; // 배송희망일은 빈 값으로 반환 (default_value 사용)
  }

  if (columnKey.startsWith("__custom__")) {
    return ""; // 커스텀 헤더는 빈 값으로 반환 (default_value 사용)
  }

  if (columnKey.startsWith("__copy__")) {
    // 복사된 헤더의 경우 originalColumnKey를 사용해서 실제 데이터 찾기
    if (originalColumnKey) {
      const mappedValue = mapDataByColumnKey(
        row,
        originalColumnKey,
        headerAliases,
      );
      // 디버깅: 복사된 헤더의 데이터 매핑 확인
      if (
        mappedValue === "" ||
        mappedValue === null ||
        mappedValue === undefined
      ) {
        console.log(
          `복사된 헤더 매핑 실패: columnKey=${columnKey}, originalColumnKey=${originalColumnKey}, row keys=${Object.keys(row).join(", ")}`,
        );
      }
      return mappedValue;
    }
    console.log(`복사된 헤더에 originalColumnKey 없음: columnKey=${columnKey}`);
    return ""; // originalColumnKey가 없는 경우 빈 값
  }

  // 헤더 Alias가 제공된 경우 사용
  if (headerAliases && headerAliases.length > 0) {
    const aliasData = headerAliases.find(
      (alias) => alias.column_key === columnKey,
    );

    if (aliasData && aliasData.aliases && aliasData.aliases.length > 0) {
      // aliases 배열의 모든 항목을 시도
      for (const alias of aliasData.aliases) {
        // 정확히 일치하는 키 확인
        if (
          row[alias] !== undefined &&
          row[alias] !== null &&
          row[alias] !== ""
        ) {
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
    receiverPhone: [
      "수령인연락처",
      "전화번호1",
      "전화번호",
      "수취인전화번호",
      "receiver_phone",
    ],
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
  headerAliases?: Array<{column_key: string; aliases: string[]}>,
): any[] {
  return templateHeaders.map((header) => {
    // 커스텀 헤더나 특수 헤더의 경우
    if (
      header.column_key.startsWith("__custom__") ||
      header.column_key.startsWith("__copy__") ||
      header.column_key === "__delivery_date__" ||
      header.column_key === "__auto_increment__"
    ) {
      // 실제 데이터에서 값이 있는지 확인
      const value = mapDataByColumnKey(
        row,
        header.column_key,
        headerAliases,
        header.original_column_key,
      );
      const defaultValue = header.default_value || "";

      // 값이 없으면 기본값 사용 (단, 복사된 헤더는 기본값 사용하지 않음)
      if (header.column_key.startsWith("__copy__")) {
        return value; // 복사된 헤더는 원본 데이터 그대로 사용
      }

      return value !== "" ? value : defaultValue;
    }

    // 일반 헤더는 기존 로직대로
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
  templateHeaders: TemplateHeader[],
): string[] {
  return templateHeaders.map(
    (header) =>
      header.display_name ??
      header.column_label ??
      String(header.column_key ?? ""),
  );
}

/** column_key → row_data 기본 키 (업데이트용, mapDataByColumnKey와 호환) */
const COLUMN_KEY_TO_ROW_DATA_KEY: {[key: string]: string} = {
  vendor: "업체명",
  shopName: "쇼핑몰명",
  inout: "내외주",
  carrier: "택배사",
  receiverName: "수취인명",
  receiverPhone: "전화번호1",
  receiverPhone2: "전화번호2",
  receiverAddr: "주소",
  postalCode: "우편번호",
  productName: "상품명",
  productOption: "옵션",
  quantity: "수량",
  orderNumber: "주문번호",
  box: "박스",
  volume: "부피",
  deliveryMessage: "배송메시지",
  senderName: "주문자명",
};

/** 기본 외주 발주서 헤더 → row_data 키 */
const DEFAULT_HEADER_TO_ROW_KEY: {[key: string]: string} = {
  받는사람: "수취인명",
  "보내는 분": "주문자명",
  전화번호: "전화번호",
  전화번호1: "전화번호1",
  전화번호2: "전화번호2",
  주소: "주소",
  우편번호: "우편번호",
  상품명: "상품명",
  배송메시지: "배송메시지",
  박스: "박스",
  업체명: "업체명",
};

/** 기본 외주 발주서 컬럼 인덱스 → row_data 키 (템플릿 없을 때) */
const DEFAULT_HEADER_INDEX_TO_ROW_KEY: string[] = [
  "주문자명", // 0: 보내는 분
  "전화번호", // 1: 전화번호
  "", // 2: 주소 (첫번째-빈값)
  "수취인명", // 3: 받는사람
  "전화번호1", // 4: 전화번호1
  "전화번호2", // 5: 전화번호2
  "우편번호", // 6: 우편번호
  "주소", // 7: 주소
  "", // 8: 빈 열
  "상품명", // 9: 상품명
  "배송메시지", // 10: 배송메시지
  "박스", // 11: 박스
  "업체명", // 12: 업체명
];

/**
 * 양식 보기에서 수정한 컬럼 인덱스를 row_data 저장용 키로 변환합니다.
 * (헤더 표시명이 사용자에 의해 변경되어도 인덱스 기반으로 올바른 키에 저장)
 * @param headerIndex 컬럼 인덱스
 * @param templateHeaders 매입처 템플릿 헤더 (있을 경우)
 * @returns row_data에 저장할 키, null/빈문자면 업데이트 제외
 */
export function headerIndexToRowDataKey(
  headerIndex: number,
  templateHeaders?: TemplateHeader[],
): string | null {
  if (templateHeaders && templateHeaders[headerIndex]) {
    const columnKey = templateHeaders[headerIndex].column_key;
    if (
      columnKey.startsWith("__custom__") ||
      columnKey.startsWith("__copy__") ||
      columnKey === "__auto_increment__" ||
      columnKey === "__delivery_date__"
    ) {
      return null;
    }
    return COLUMN_KEY_TO_ROW_DATA_KEY[columnKey] ?? columnKey;
  }

  const key = DEFAULT_HEADER_INDEX_TO_ROW_KEY[headerIndex];
  return key && key.trim() ? key : null;
}

/**
 * @deprecated headerIndexToRowDataKey 사용 권장 (인덱스 기반이 더 정확함)
 */
export function headerDisplayNameToRowDataKey(
  headerDisplayName: string,
  headerIndex: number,
  templateHeaders?: TemplateHeader[],
): string | null {
  return headerIndexToRowDataKey(headerIndex, templateHeaders);
}
