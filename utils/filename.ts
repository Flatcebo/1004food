/**
 * 엑셀 다운로드 파일명 생성 유틸리티
 * 형식: MMdd-XXXXXX (월일-6자리난수)
 */
export function generateExcelFileName(baseName: string): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const randomNum = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, "0");
  const dateStr = `${month}${day}-${randomNum}`;
  return `${dateStr}_${baseName}.xlsx`;
}

/**
 * 파일명의 날짜 부분만 생성 (ZIP 파일 내부 파일명용)
 * 형식: MMdd-XXXXXX (월일-6자리난수)
 */
export function generateDatePrefix(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const randomNum = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, "0");
  return `${month}${day}-${randomNum}`;
}
