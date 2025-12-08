import { NextResponse } from "next/server";
import sql from "@/lib/db";

// 한국 시간(KST, UTC+9)을 반환하는 함수
function getKoreaTime(): Date {
  const now = new Date();
  // UTC 시간에 9시간을 더해서 한국 시간으로 변환
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const koreaTime = new Date(utcTime + (9 * 3600000));
  return koreaTime;
}

// 업체명 리스트
const purchaseNames = [
  "유한회사 믿음식품",
  "미가푸드",
  "주식회사 미풍",
  "프룻포즈(그랑)",
  "금바우식품",
  "꿀단지",
  "남부팜영농조합법인",
  "다함유통",
  "사오수산(미래산업)",
  "뽕의도리",
  "상주다미농장",
  "쎈트마원",
  "씨씨더블유",
  "알찬(메이커)",
  "윤수산",
  "정성씨푸드(정대게)",
  "정아식품",
  "제이(J)식품",
  "제이제이아이",
  "제트언스",
  "주완농수산물",
  "주식회사마스터",
  "청정화푸드",
  "청진수산",
  "해도지",
  "횡성식품",
  "정성수산",
  "이스트블루",
  "진상농원/서미리",
  "1번수산",
  "호호농수산",
  "남도청년",
  "생동농산",
  "현진식품",
  "서현축산푸드",
  "굿팜e",
  "천사-섬마을",
  "네츄럴픽",
  "맛다함",
  "법계수산",
  "인팜(현로지스)",
  "주식회사 줌",
  "총각네(자연의모든것)",
  "흙향",
  "섬사랑유통",
  "천사물산",
  "에이치디푸드몰",
  "황금약단밤",
  "젓가락스테이크",
  "도담",
  "주식회사 새벽",
  "왓구나",
  "나리배",
  "아그로테크",
  "청정수산",
  "보성/눈바우농장",
  "감동",
  "야채도사",
  "더테이블",
  "다올",
  "푸드메이드",
  "지크",
  "자연나라영농조합법인",
  "주식회사 진솔한우",
  "영암사랑",
  "보성키위영농조합법인",
  "청암영어조합법인",
  "농업회사법인 온담",
  "이지팜",
  "에프엠푸드",
  "목포반찬게미지다",
  "할미푸드",
  "하람떡방",
  "주식회사 이씨네식품",
  "헬스랩",
  "주식회사 케이디그룹",
  "코리아푸드",
  "보명수산",
  "바다드림 영어조합법인",
  "바르미김치",
  "강성수산",
  "유한회사 경일",
  "하늘김치",
  "하늘꽃영농조합법인",
  "은혜소금",
  "전남생산자협동조합",
  "정성플랫폼",
  "장흥RPC",
  "자연담음 영농조합법인",
  "자연진리",
  "천사-제조",
  "천사-사입",
  "바다를담다2",
  "천사-프리랜서 3.3%",
];

export async function POST() {
  try {
    // purchase 테이블이 없으면 생성
    await sql`
      CREATE TABLE IF NOT EXISTS purchase (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 인덱스 생성 (검색 성능 향상)
    await sql`
      CREATE INDEX IF NOT EXISTS idx_purchase_name ON purchase(name)
    `;

    // 한국 시간 생성
    const koreaTime = getKoreaTime();

    // 각 업체명을 DB에 삽입 (중복 시 업데이트)
    const insertPromises = purchaseNames.map((name) => {
      return sql`
        INSERT INTO purchase (name, created_at, updated_at)
        VALUES (${name}, ${koreaTime.toISOString()}::timestamp, ${koreaTime.toISOString()}::timestamp)
        ON CONFLICT (name) DO UPDATE SET
          updated_at = ${koreaTime.toISOString()}::timestamp
      `;
    });

    await Promise.all(insertPromises);

    return NextResponse.json({
      success: true,
      message: `${purchaseNames.length}개의 구매처 데이터가 성공적으로 시딩되었습니다.`,
    });
  } catch (error: any) {
    console.error("구매처 데이터 시딩 실패:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || "알 수 없는 오류가 발생했습니다.",
        details: error.stack 
      },
      { status: 500 }
    );
  }
}

