import {NextRequest, NextResponse} from "next/server";
import sql from "@/lib/db";

// 업체명 앞 2글자 추출 (한글, 영문, 숫자)
function getVendorPrefix(vendorName: string): string {
  if (!vendorName) return "미지정";
  const trimmed = vendorName.trim();
  if (trimmed.length === 0) return "미지정";

  // 앞 2글자 추출 (1글자인 경우 그대로 사용)
  return trimmed.length >= 2 ? trimmed.substring(0, 2) : trimmed;
}

// 날짜 문자열 생성 (YYYYMMDD)
function getDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

// 내부코드 생성: 날짜(8자리) + 업체명앞2글자 + 일련번호(4자리)
function generateInternalCode(vendorName: string, increment: number): string {
  const dateStr = getDateString();
  const vendorPrefix = getVendorPrefix(vendorName);
  const incrementStr = String(increment).padStart(4, "0");
  return `${dateStr}${vendorPrefix}${incrementStr}`;
}

// DB에서 특정 업체명과 날짜에 대한 최대 일련번호 조회
async function getMaxIncrement(
  vendorName: string,
  dateStr: string
): Promise<number> {
  try {
    const vendorPrefix = getVendorPrefix(vendorName);
    const codePrefix = `${dateStr}${vendorPrefix}`;
    const expectedLength = codePrefix.length + 4; // 날짜(8) + 업체명(2) + increment(4) = 14자리

    // 해당 날짜와 업체명으로 시작하고 정확히 14자리인 내부코드만 조회
    const result = await sql`
      SELECT row_data->>'내부코드' as code 
      FROM upload_rows 
      WHERE row_data->>'내부코드' LIKE ${codePrefix + "%"}
        AND LENGTH(row_data->>'내부코드') = ${expectedLength}
      ORDER BY row_data->>'내부코드' DESC
      LIMIT 1
    `;

    if (result.length === 0) {
      return 0;
    }

    // 코드에서 일련번호 부분 추출 (마지막 4자리)
    const code = result[0].code;
    const incrementPart = code.slice(-4);
    const increment = parseInt(incrementPart) || 0;

    // console.log(
    //   `[getMaxIncrement] 업체명: ${vendorName}, 날짜: ${dateStr}, 최대 increment: ${increment}`
    // );
    return increment;
  } catch (error) {
    console.error("최대 일련번호 조회 실패:", error);
    return 0;
  }
}

// DB에서 내부 코드 중복 확인 (여러 코드를 한 번에 확인)
async function areCodesUnique(codes: string[]): Promise<boolean> {
  try {
    if (codes.length === 0) return true;

    const result = await sql`
      SELECT COUNT(*) as count FROM upload_rows 
      WHERE row_data->>'내부코드' = ANY(${codes})
    `;

    const count = parseInt(String(result[0].count)) || 0;
    // console.log(
    //   `[areCodesUnique] 확인할 코드 수: ${codes.length}, DB 중복 개수: ${count}`
    // );

    return count === 0;
  } catch (error) {
    console.error("내부 코드 중복 확인 실패:", error);
    throw error;
  }
}

// 업체명별로 내부 코드 생성
async function generateUniqueCodesForVendors(
  vendorNames: string[]
): Promise<string[]> {
  const dateStr = getDateString();
  const codes: string[] = [];

  // console.log(
  //   `[generateUniqueCodesForVendors] 총 ${vendorNames.length}개 코드 생성 시작`
  // );
  // console.log(
  //   `[generateUniqueCodesForVendors] 업체명 목록:`,
  //   vendorNames.slice(0, 5),
  //   vendorNames.length > 5 ? "..." : ""
  // );

  // 업체명별 현재 increment 추적
  const vendorIncrements = new Map<string, number>();

  // 각 업체명별로 최대 increment 초기화
  const uniqueVendors = Array.from(new Set(vendorNames));
  // console.log(
  //   `[generateUniqueCodesForVendors] 고유 업체명 ${uniqueVendors.length}개`
  // );

  for (const vendorName of uniqueVendors) {
    const maxIncrement = await getMaxIncrement(vendorName, dateStr);
    vendorIncrements.set(vendorName, maxIncrement);
  }

  // vendorNames 배열 순서대로 코드 생성
  for (const vendorName of vendorNames) {
    const currentIncrement = vendorIncrements.get(vendorName) || 0;
    const nextIncrement = currentIncrement + 1;
    vendorIncrements.set(vendorName, nextIncrement);

    const code = generateInternalCode(vendorName, nextIncrement);
    codes.push(code);
  }

  // console.log(
  //   `[generateUniqueCodesForVendors] 생성된 코드 샘플:`,
  //   codes.slice(0, 5)
  // );

  // 생성된 코드 내에서 중복 확인
  const codeSet = new Set(codes);
  if (codeSet.size !== codes.length) {
    // console.error(
    //   `[generateUniqueCodesForVendors] 배치 내 중복 발견! 생성: ${codes.length}개, 고유: ${codeSet.size}개`
    // );
    throw new Error("생성된 코드 배치 내에 중복이 있습니다.");
  }

  // DB에서 중복 확인
  const isUnique = await areCodesUnique(codes);
  if (!isUnique) {
    // 어떤 코드가 중복인지 확인
    const existingCodes = await sql`
      SELECT DISTINCT row_data->>'내부코드' as code 
      FROM upload_rows 
      WHERE row_data->>'내부코드' = ANY(${codes})
    `;
    // console.error(
    //   `[generateUniqueCodesForVendors] DB에 이미 존재하는 코드:`,
    //   existingCodes.map((r: any) => r.code)
    // );
    throw new Error(
      "생성된 내부 코드가 DB에 이미 존재합니다. 다시 시도해주세요."
    );
  }

  // console.log(
  //   `[generateUniqueCodesForVendors] 모든 코드 생성 완료 (${codes.length}개)`
  // );
  return codes;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {vendorNames = []} = body;

    if (!Array.isArray(vendorNames) || vendorNames.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "업체명 배열이 필요합니다.",
        },
        {status: 400}
      );
    }

    if (vendorNames.length > 10000) {
      return NextResponse.json(
        {
          success: false,
          error: "생성 개수는 10000개 이하여야 합니다.",
        },
        {status: 400}
      );
    }

    // 업체명별로 고유한 내부 코드 생성
    const codes = await generateUniqueCodesForVendors(vendorNames);

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
