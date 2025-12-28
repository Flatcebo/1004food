import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

/**
 * 헤더 aliases 기본 데이터
 */
const DEFAULT_HEADER_ALIASES = [
  {
    column_key: "vendor",
    column_label: "업체명",
    aliases: ["업체명", "업체", "거래처명", "고객주문처명", "매입처명"],
  },
  {
    column_key: "shopName",
    column_label: "쇼핑몰명",
    aliases: ["쇼핑몰명(1)", "쇼핑몰명", "쇼핑몰", "몰명"],
  },
  {column_key: "inout", column_label: "내외주", aliases: ["내외주"]},
  {
    column_key: "carrier",
    column_label: "택배사",
    aliases: ["택배사", "택배사명", "택배", "배송사"],
  },
  {
    column_key: "receiverName",
    column_label: "수취인명",
    aliases: [
      "수취인명",
      "수취인",
      "받는분",
      "받는 사람",
      "수령인",
      "받는분",
      "받는분성명",
    ],
  },
  {
    column_key: "receiverPhone",
    column_label: "수취인 전화번호",
    aliases: [
      "수취인 연락처",
      "수취인 전화",
      "수취인 전화번호",
      "수취인전화번호",
      "받는분연락처",
      "받는사람전화",
      "수령인전화번호",
      "수령인 전화번호",
      "수령인 전화번호1",
      "수취인 전화번호1",
      "받는분전화번호",
    ],
  },
  {
    column_key: "zip",
    column_label: "우편",
    aliases: [
      "우편",
      "우편번호",
      "우편번호(수취인)",
      "우편번호(배송지)",
      "수취인우편번호(1)",
    ],
  },
  {
    column_key: "address",
    column_label: "주소",
    aliases: [
      "주소",
      "배송지주소",
      "수취인주소",
      "수령인주소",
      "수령인 주소",
      "받는분주소",
      "받는분 주소",
      "통합배송지",
      "통합 배송지",
      "수취인주소(4)",
    ],
  },
  {
    column_key: "qty",
    column_label: "수량",
    aliases: ["수량", "주문수량", "총수량"],
  },
  {
    column_key: "productName",
    column_label: "상품명",
    aliases: [
      "상품명",
      "아이템명",
      "품목명",
      "상품",
      "품목명",
      "주문상품명",
      "상품명(확정)",
    ],
  },
  {
    column_key: "ordererName",
    column_label: "주문자명",
    aliases: ["주문자명", "주문자", "주문자 이름", "보내는분성명"],
  },
  {
    column_key: "ordererPhone",
    column_label: "주문자 전화번호",
    aliases: [
      "주문자 연락처",
      "주문자 전화번화",
      "주문자전화번호",
      "주문자전화번호1",
      "보내는분전화번호",
    ],
  },
  {
    column_key: "message",
    column_label: "배송메시지",
    aliases: [
      "배송메시지",
      "배송메세지",
      "배송요청",
      "요청사항",
      "배송요청사항",
    ],
  },
  {
    column_key: "orderCode",
    column_label: "주문번호",
    aliases: [
      "주문번호",
      "주문번호(사방넷)",
      "주문번호(쇼핑몰)",
      "주문 번호",
      "order_code",
      "orderCode",
    ],
  },
];

/**
 * POST /api/header-aliases/seed
 * 헤더 aliases 기본 데이터 시딩
 */
export async function POST(request: NextRequest) {
  try {
    // 테이블이 없으면 생성
    await sql`
      CREATE TABLE IF NOT EXISTS header_aliases (
        id SERIAL PRIMARY KEY,
        column_key VARCHAR(100) NOT NULL UNIQUE,
        column_label VARCHAR(100) NOT NULL,
        aliases TEXT[] NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 기존 데이터 확인
    const existing = await sql`SELECT COUNT(*) as count FROM header_aliases`;
    if (existing[0].count > 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "이미 데이터가 존재합니다. 초기화를 원하시면 먼저 데이터를 삭제해주세요.",
        },
        {status: 400}
      );
    }

    // 기본 데이터 삽입
    for (const alias of DEFAULT_HEADER_ALIASES) {
      await sql`
        INSERT INTO header_aliases (column_key, column_label, aliases)
        VALUES (${alias.column_key}, ${alias.column_label}, ${alias.aliases})
      `;
    }

    // 삽입된 데이터 조회
    const result = await sql`SELECT * FROM header_aliases ORDER BY column_key`;

    return NextResponse.json({
      success: true,
      message: `${DEFAULT_HEADER_ALIASES.length}개의 헤더 alias가 성공적으로 시딩되었습니다.`,
      data: result,
    });
  } catch (error: any) {
    console.error("헤더 alias 시딩 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

/**
 * DELETE /api/header-aliases/seed
 * 모든 헤더 aliases 데이터 삭제 (초기화용)
 */
export async function DELETE(request: NextRequest) {
  try {
    const result = await sql`DELETE FROM header_aliases`;

    return NextResponse.json({
      success: true,
      message: "모든 헤더 alias 데이터가 삭제되었습니다.",
      deletedCount: result.length,
    });
  } catch (error: any) {
    console.error("헤더 alias 데이터 삭제 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
