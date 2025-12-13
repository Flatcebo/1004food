import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

// 12자리 영문+숫자 혼합 난수 생성
function generateInternalCode(): string {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < 12; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
}

// DB에서 내부 코드 중복 확인 (여러 코드를 한 번에 확인)
async function areCodesUnique(codes: string[]): Promise<boolean> {
  try {
    if (codes.length === 0) return true;

    const result = await sql`
      SELECT COUNT(*) as count FROM upload_rows 
      WHERE row_data->>'내부코드' = ANY(${codes})
    `;
    return result[0].count === 0;
  } catch (error) {
    console.error("내부 코드 중복 확인 실패:", error);
    throw error;
  }
}

// 중복되지 않는 내부 코드 배치 생성
async function generateUniqueCodes(
  count: number,
  maxRetries: number = 100
): Promise<string[]> {
  const codes = new Set<string>();
  let retries = 0;

  while (codes.size < count && retries < maxRetries) {
    // 필요한 개수만큼 추가로 생성 (여유있게 20% 더 생성)
    const needed = count - codes.size;
    const toGenerate = Math.ceil(needed * 1.2);

    const newCodes: string[] = [];
    for (let i = 0; i < toGenerate; i++) {
      newCodes.push(generateInternalCode());
    }

    // Set에 추가하여 요청 내 중복 제거
    newCodes.forEach((code) => codes.add(code));

    // 필요한 개수만큼만 가져오기
    const codesToCheck = Array.from(codes).slice(0, count);

    // DB에서 중복 확인
    const isUnique = await areCodesUnique(codesToCheck);

    if (isUnique && codesToCheck.length === count) {
      return codesToCheck;
    }

    // 중복이 있으면 DB에 있는 코드 확인하고 제거
    if (!isUnique) {
      const existingCodes = await sql`
        SELECT DISTINCT row_data->>'내부코드' as code 
        FROM upload_rows 
        WHERE row_data->>'내부코드' = ANY(${codesToCheck})
      `;

      const existingSet = new Set(
        existingCodes.map((row: any) => row.code).filter(Boolean)
      );

      // 중복된 코드 제거
      existingSet.forEach((code) => codes.delete(code));
    }

    retries++;
  }

  if (codes.size < count) {
    throw new Error(
      `${maxRetries}번의 시도 후에도 ${count}개의 고유한 내부 코드를 생성할 수 없습니다. (생성된 개수: ${codes.size})`
    );
  }

  return Array.from(codes).slice(0, count);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {count = 1} = body;

    if (count <= 0 || count > 10000) {
      return NextResponse.json(
        {
          success: false,
          error: "생성 개수는 1~10000 사이여야 합니다.",
        },
        {status: 400}
      );
    }

    // 요청된 개수만큼 고유한 내부 코드 생성
    const codes = await generateUniqueCodes(count);

    return NextResponse.json({
      success: true,
      codes,
    });
  } catch (error: any) {
    console.error("내부 코드 생성 실패:", error);
    return NextResponse.json(
      {success: false, error: error.message},
      {status: 500}
    );
  }
}
