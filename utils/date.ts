/**
 * 날짜 관련 유틸리티 함수
 */

/**
 * 오늘 날짜를 YYYY-MM-DD 형식으로 반환 (한국 시간 기준)
 */
export function getTodayDate(): string {
  // 한국 시간(KST, UTC+9) 기준으로 오늘 날짜 계산
  const now = new Date();
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
  const koreaTime = new Date(utcTime + 9 * 3600000);

  const year = koreaTime.getFullYear();
  const month = String(koreaTime.getMonth() + 1).padStart(2, "0");
  const day = String(koreaTime.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 날짜 포맷팅
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function kstTime(date: Date) {
  return new Date(date.getTime() + 9 * 3600000).toISOString();
}
