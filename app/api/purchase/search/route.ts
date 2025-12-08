import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {query} = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        {success: false, error: "검색어가 필요합니다."},
        {status: 400}
      );
    }

    // purchase 테이블에서 name에 검색어가 포함된 항목 조회 (대소문자 구분 없음)
    const searchPattern = `%${query}%`;
    const results = await sql`
      SELECT id, name
      FROM purchase
      WHERE name ILIKE ${searchPattern}
      ORDER BY name
      LIMIT 20
    `;

    return NextResponse.json({
      success: true,
      data: results,
    });
  } catch (error: any) {
    console.error("구매처 검색 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

