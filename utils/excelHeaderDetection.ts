/**
 * 엑셀 파일 헤더 행 자동 감지 유틸리티
 */

// 헤더를 정규화하는 함수
export function normalizeHeader(header: string): string {
  return header.replace(/\s+/g, "").toLowerCase();
}

/**
 * 특정 필수 헤더 목록을 기반으로 헤더 행 감지
 * @param rows 엑셀 행 배열
 * @param requiredHeaders 필수 헤더 목록 (각 헤더는 여러 별칭을 가질 수 있음)
 * @param maxRowsToCheck 검사할 최대 행 수 (기본값: 6)
 * @returns 헤더 행 인덱스
 */
export function detectHeaderRowByRequiredHeaders(
  rows: any[][],
  requiredHeaders: Array<{
    name: string; // 헤더 이름 (로깅용)
    aliases: string[]; // 헤더 별칭 목록
  }>,
  maxRowsToCheck: number = 6
): number {
  const checkRows = Math.min(maxRowsToCheck, rows.length);
  let bestHeaderRow = 0;
  let bestMatchCount = 0;

  for (let rowIdx = 0; rowIdx < checkRows; rowIdx++) {
    const row = rows[rowIdx];
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    // 각 필수 헤더가 있는지 확인
    const foundHeaders = requiredHeaders.map((header) => {
      return row.some((cell) => {
        if (!cell || typeof cell !== "string") return false;
        const cellStr = String(cell).trim();
        const normalized = normalizeHeader(cellStr);

        return header.aliases.some((alias) => {
          const normalizedAlias = normalizeHeader(alias);
          return (
            normalized === normalizedAlias ||
            normalized.includes(normalizedAlias)
          );
        });
      });
    });

    // 매칭된 헤더 개수 계산
    const matchCount = foundHeaders.filter(Boolean).length;

    // 모든 필수 헤더가 매칭되면 즉시 반환
    if (matchCount === requiredHeaders.length) {
      return rowIdx;
    }

    // 더 많은 매칭을 찾으면 업데이트
    if (matchCount > bestMatchCount) {
      bestMatchCount = matchCount;
      bestHeaderRow = rowIdx;
    }
  }

  // 모든 필수 헤더가 매칭되어야 헤더로 인정
  if (bestMatchCount < requiredHeaders.length) {
    return 0; // 기본값으로 첫 번째 행 사용
  }

  return bestHeaderRow;
}

/**
 * 컬럼 별칭 목록을 기반으로 헤더 행 감지 (발주서 업로드용)
 * @param rows 엑셀 행 배열
 * @param columnAliases 컬럼 별칭 목록 (각 컬럼은 여러 별칭을 가질 수 있음)
 * @param minMatchCount 최소 매칭 개수 (기본값: 3)
 * @param maxRowsToCheck 검사할 최대 행 수 (기본값: 10)
 * @returns 헤더 행 인덱스
 */
export function detectHeaderRowByColumnAliases(
  rows: any[][],
  columnAliases: Array<{
    key: string; // 컬럼 키
    aliases: string[]; // 컬럼 별칭 목록
  }>,
  minMatchCount: number = 3,
  maxRowsToCheck: number = 10
): number {
  const checkRows = Math.min(maxRowsToCheck, rows.length);
  let bestHeaderRow = 0;
  let bestMatchCount = 0;

  for (let rowIdx = 0; rowIdx < checkRows; rowIdx++) {
    const row = rows[rowIdx];
    if (!row || !Array.isArray(row)) continue;

    // 이 행에서 매칭되는 컬럼 개수 계산
    let matchCount = 0;
    columnAliases.forEach((col) => {
      const found = row.some((cell) => {
        if (!cell || typeof cell !== "string") return false;
        const normalizedCell = normalizeHeader(String(cell));
        return col.aliases.some((alias) => {
          const normalizedAlias = normalizeHeader(alias);
          return normalizedCell === normalizedAlias;
        });
      });
      if (found) matchCount++;
    });

    // 더 많은 매칭을 찾으면 업데이트
    if (matchCount > bestMatchCount) {
      bestMatchCount = matchCount;
      bestHeaderRow = rowIdx;
    }
  }

  // 최소 매칭 개수 이상이어야 헤더로 인정
  if (bestMatchCount < minMatchCount) {
    return 0; // 기본값으로 첫 번째 행 사용
  }

  return bestHeaderRow;
}
