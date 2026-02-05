/**
 * 한국 시간(KST, UTC+9) 관련 유틸리티 함수
 */

/**
 * 현재 한국 날짜를 YYYY-MM-DD 형식으로 반환
 */
export function getKoreaDateString(): string {
  const now = new Date();
  const koreaTimeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = koreaTimeFormatter.formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

/**
 * 현재 한국 시간을 Date 객체로 반환
 */
export function getKoreaDate(): Date {
  const now = new Date();
  const koreaTimeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = koreaTimeFormatter.formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  const hour = parts.find((p) => p.type === "hour")?.value;
  const minute = parts.find((p) => p.type === "minute")?.value;
  const second = parts.find((p) => p.type === "second")?.value;

  // 한국 시간으로 Date 객체 생성
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+09:00`);
}

/**
 * 날짜 문자열을 한국 시간 기준으로 비교
 * @param dateStr YYYY-MM-DD 형식의 날짜 문자열
 * @returns 한국 시간 기준 Date 객체
 */
export function parseKoreaDate(dateStr: string): Date {
  // YYYY-MM-DD 형식을 한국 시간대로 파싱
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+09:00`,
  );
}

/**
 * 행사 기간이 유효한지 확인
 * @param startDate 시작일 (YYYY-MM-DD)
 * @param endDate 종료일 (YYYY-MM-DD)
 * @returns 유효한 행사 기간인지 여부
 */
export function isValidPromotionPeriod(
  startDate: string,
  endDate: string,
): boolean {
  const currentDate = getKoreaDateString();

  // 날짜 문자열을 직접 비교 (YYYY-MM-DD 형식이므로 문자열 비교로 충분)
  // 시작일보다 현재가 과거면 적용하지 않음
  if (currentDate < startDate) {
    return false;
  }

  // 종료일이 지났으면 적용하지 않음
  if (currentDate > endDate) {
    return false;
  }

  // 행사 기간 내에 있으면 적용 (시작일과 종료일 포함)
  return true;
}
