/**
 * 테이블 관련 유틸리티 함수
 */

/**
 * 컬럼 너비 매핑
 */
export function getColumnWidth(header: string): string {
  const widthMap: Record<string, string> = {
    id: "60px",
    ID: "60px",
    매핑코드: "100px",
    주문상태: "80px",
    우편: "60px",
    우편번호: "60px",
    내외주: "50px",
    주소: "250px",
    상품명: "200px",
    수량: "45px",
    가격: "100px",
    판매가: "100px",
    합포수량: "80px",
    택배비: "80px",
    기타: "100px",
    업체명: "90px",
    수취인명: "70px",
    주문자명: "70px",
    수취인: "70px",
    주문자: "70px",
    전화번호: "120px",
    이름: "80px",
    사방넷명: "150px",
    택배사: "100px",
    매입처: "120px",
    세금구분: "80px",
    카테고리: "100px",
    상품구분: "100px",
  };
  return widthMap[header] || "100px";
}

