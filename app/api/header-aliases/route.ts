import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

export interface HeaderAlias {
  id?: number;
  column_key: string;
  column_label: string;
  aliases: string[];
  created_at?: string;
  updated_at?: string;
}

/**
 * GET /api/header-aliases
 * 헤더 alias 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    // 테이블이 없으면 생성 (데이터는 시딩 API로 별도 관리)
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

    const result = await sql`SELECT * FROM header_aliases ORDER BY id`;
    return NextResponse.json({success: true, data: result});
  } catch (error: any) {
    console.error("헤더 alias 조회 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

/**
 * POST /api/header-aliases
 * 새로운 헤더 alias 생성
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {column_key, column_label, aliases} = body;

    if (!column_key || !column_label || !aliases || !Array.isArray(aliases)) {
      return NextResponse.json(
        {success: false, error: "필수 필드가 누락되었습니다."},
        {status: 400}
      );
    }

    const result = await sql`
      INSERT INTO header_aliases (column_key, column_label, aliases)
      VALUES (${column_key}, ${column_label}, ${aliases})
      RETURNING *
    `;

    return NextResponse.json({success: true, data: result[0]});
  } catch (error: any) {
    console.error("헤더 alias 생성 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

/**
 * PUT /api/header-aliases/[id]
 * 헤더 alias 업데이트
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {id, column_key, column_label, aliases} = body;

    if (
      !id ||
      !column_key ||
      !column_label ||
      !aliases ||
      !Array.isArray(aliases)
    ) {
      return NextResponse.json(
        {success: false, error: "필수 필드가 누락되었습니다."},
        {status: 400}
      );
    }

    const result = await sql`
      UPDATE header_aliases
      SET column_key = ${column_key},
          column_label = ${column_label},
          aliases = ${aliases},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      return NextResponse.json(
        {success: false, error: "해당 ID의 헤더 alias를 찾을 수 없습니다."},
        {status: 404}
      );
    }

    return NextResponse.json({success: true, data: result[0]});
  } catch (error: any) {
    console.error("헤더 alias 업데이트 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}

/**
 * DELETE /api/header-aliases/[id]
 * 헤더 alias 삭제
 */
export async function DELETE(request: NextRequest) {
  try {
    const {searchParams} = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        {success: false, error: "ID가 필요합니다."},
        {status: 400}
      );
    }

    const result = await sql`
      DELETE FROM header_aliases
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      return NextResponse.json(
        {success: false, error: "해당 ID의 헤더 alias를 찾을 수 없습니다."},
        {status: 404}
      );
    }

    return NextResponse.json({success: true, data: result[0]});
  } catch (error: any) {
    console.error("헤더 alias 삭제 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
