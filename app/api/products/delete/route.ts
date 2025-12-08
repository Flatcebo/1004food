import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const {ids} = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        {success: false, error: "삭제할 상품 ID가 필요합니다."},
        {status: 400}
      );
    }

    // 여러 ID를 한 번에 삭제
    const result = await sql`
      DELETE FROM products
      WHERE id = ANY(${ids}::int[])
      RETURNING id
    `;

    if (result.length === 0) {
      return NextResponse.json(
        {success: false, error: "삭제할 상품을 찾을 수 없습니다."},
        {status: 404}
      );
    }

    return NextResponse.json({
      success: true,
      message: `${result.length}개의 상품이 성공적으로 삭제되었습니다.`,
      deletedCount: result.length,
    });
  } catch (error: any) {
    console.error("상품 삭제 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

