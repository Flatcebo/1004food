/**
 * 헤더 alias 관리 유틸리티
 */

export interface HeaderAlias {
  id: number;
  column_key: string;
  column_label: string;
  aliases: string[];
  created_at: string;
  updated_at: string;
}

export interface ColumnAlias {
  key: string;
  label: string;
  aliases: string[];
}

/**
 * DB에서 헤더 alias들을 가져와서 INTERNAL_COLUMNS 형식으로 변환
 */
export async function fetchHeaderAliases(): Promise<ColumnAlias[]> {
  try {
    const response = await fetch("/api/header-aliases");
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || "헤더 alias 조회 실패");
    }

    return result.data.map((item: HeaderAlias) => ({
      key: item.column_key,
      label: item.column_label,
      aliases: item.aliases,
    }));
  } catch (error) {
    console.error("헤더 alias 조회 실패:", error);
    // 폴백: 기본 alias들 반환
    return getDefaultHeaderAliases();
  }
}

/**
 * 기본 헤더 alias들 (DB 연결 실패 시 사용)
 */
function getDefaultHeaderAliases(): ColumnAlias[] {
  return [
    {
      key: "vendor",
      label: "업체명",
      aliases: ["업체명", "업체", "거래처명", "고객주문처명", "매입처명"],
    },
    {
      key: "shopName",
      label: "쇼핑몰명",
      aliases: ["쇼핑몰명(1)", "쇼핑몰명", "쇼핑몰", "몰명"],
    },
    {key: "inout", label: "내외주", aliases: ["내외주"]},
    {
      key: "carrier",
      label: "택배사",
      aliases: ["택배사", "택배사명", "택배", "배송사"],
    },
    {
      key: "receiverName",
      label: "수령인명",
      aliases: ["수령인명", "수령인", "받는사람", "받는분", "이름", "성명"],
    },
    {
      key: "receiverPhone",
      label: "수령인연락처",
      aliases: [
        "수령인연락처",
        "수령인전화",
        "받는사람전화",
        "연락처",
        "전화번호",
        "휴대폰",
      ],
    },
    {
      key: "receiverAddr",
      label: "수령인주소",
      aliases: ["수령인주소", "수령인주소", "받는사람주소", "주소", "배송주소"],
    },
    {
      key: "productName",
      label: "상품명",
      aliases: ["상품명", "제품명", "상품", "품명", "상품이름"],
    },
    {
      key: "productOption",
      label: "옵션",
      aliases: ["옵션", "옵션명", "상품옵션", "선택사항"],
    },
    {
      key: "quantity",
      label: "수량",
      aliases: ["수량", "개수", "갯수", "주문수량"],
    },
    {
      key: "orderNumber",
      label: "주문번호",
      aliases: ["주문번호", "주문번호", "주문번호", "오더넘버"],
    },
    {
      key: "box",
      label: "박스",
      aliases: ["박스", "박스수량", "박스개수"],
    },
    {
      key: "volume",
      label: "부피",
      aliases: ["부피", "부피중량", "무게", "중량"],
    },
    {
      key: "supplyPrice",
      label: "공급단가",
      aliases: ["공급단가", "공급가", "공급가격", "상품공급가", "supply_price", "supplyPrice"],
    },
    {
      key: "deliveryDate",
      label: "배송희망일",
      aliases: ["배송희망일", "배송희망날짜", "희망배송일", "희망배송날짜", "배송예정일", "배송예정날짜"],
    },
  ];
}

/**
 * 헤더 alias 업데이트
 */
export async function updateHeaderAlias(
  id: number,
  data: Partial<HeaderAlias>
): Promise<HeaderAlias> {
  try {
    const response = await fetch("/api/header-aliases", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({id, ...data}),
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || "헤더 alias 업데이트 실패");
    }

    return result.data;
  } catch (error) {
    console.error("헤더 alias 업데이트 실패:", error);
    throw error;
  }
}

/**
 * 새로운 헤더 alias 생성
 */
export async function createHeaderAlias(
  data: Omit<HeaderAlias, "id" | "created_at" | "updated_at">
): Promise<HeaderAlias> {
  try {
    const response = await fetch("/api/header-aliases", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || "헤더 alias 생성 실패");
    }

    return result.data;
  } catch (error) {
    console.error("헤더 alias 생성 실패:", error);
    throw error;
  }
}

/**
 * 헤더 alias 삭제
 */
export async function deleteHeaderAlias(id: number): Promise<HeaderAlias> {
  try {
    const response = await fetch(`/api/header-aliases?id=${id}`, {
      method: "DELETE",
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || "헤더 alias 삭제 실패");
    }

    return result.data;
  } catch (error) {
    console.error("헤더 alias 삭제 실패:", error);
    throw error;
  }
}
