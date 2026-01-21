/**
 * 업체명 변경시 배송메시지 실시간 업데이트를 위한 함수
 *
 * 이 함수는 현재 사용되지 않지만, 향후 필요시 사용할 수 있도록 보관합니다.
 *
 * @param tableData - 테이블 데이터 (헤더 포함)
 * @param newVendorName - 새로 입력된 업체명
 * @param originalMessagesRef - 원본 배송메시지 저장 ref (rowIdx -> 원본 메시지)
 * @param pureOriginalMessagesRef - 순수 원본 배송메시지 저장 ref (rowIdx -> 순수 원본 메시지, 업체명 제거된 메시지)
 * @returns 업데이트된 테이블 데이터
 */
export function updateVendorAndMessage(
  tableData: any[][],
  newVendorName: string,
  originalMessagesRef: {[rowIdx: number]: string},
  pureOriginalMessagesRef: {[rowIdx: number]: string}
): any[][] {
  const headerRow = tableData[0];
  const vendorIdx = headerRow.findIndex(
    (h: any) => h && typeof h === "string" && h === "업체명"
  );
  const messageIdx = headerRow.findIndex(
    (h: any) =>
      h &&
      typeof h === "string" &&
      (h === "배송메시지" ||
        h === "배송메세지" ||
        h === "배송요청" ||
        h === "요청사항" ||
        h === "배송요청사항")
  );

  if (vendorIdx === -1) return tableData;

  const vendorStr = newVendorName.trim();
  // 5글자 이상이면 2글자, 4글자 이하면 전체 글자수
  const vendorPrefix =
    vendorStr.length >= 5 ? vendorStr.substring(0, 2) : vendorStr;

  const updatedTable = tableData.map((row, idx) => {
    if (idx === 0) return row;
    const newRow = [...row];
    newRow[vendorIdx] = vendorStr;

    // 배송메시지 업데이트
    if (messageIdx !== -1) {
      // 순수 원본 메시지 가져오기 (한 번만 추출하고 절대 변경하지 않음)
      let pureOriginalMessage = pureOriginalMessagesRef[idx];

      if (pureOriginalMessage === undefined) {
        // 순수 원본이 저장되지 않았으면 원본 메시지를 그대로 저장
        const originalMessage = originalMessagesRef[idx];

        if (originalMessage === undefined) {
          // 원본도 없으면 현재 메시지를 그대로 저장
          const currentMessage = row[messageIdx];
          const currentMessageStr =
            currentMessage !== null && currentMessage !== undefined
              ? String(currentMessage).trim()
              : "";

          // 기존 메시지를 그대로 순수 원본으로 저장 (첫 단어 제거하지 않음)
          pureOriginalMessage = currentMessageStr;

          // 원본 메시지도 저장
          originalMessagesRef[idx] = currentMessageStr;
        } else {
          // 원본 메시지를 그대로 순수 원본으로 저장 (첫 단어 제거하지 않음)
          pureOriginalMessage = originalMessage;
        }

        // 순수 원본 메시지 저장 (한 번만 저장하고 절대 변경하지 않음)
        pureOriginalMessagesRef[idx] = pureOriginalMessage;
      }
      // 순수 원본이 이미 저장되어 있으면 절대 변경하지 않고 그대로 사용

      // 업체명이 있으면 앞에 업체명 추가, 없으면 순수 원본 메시지만 표시
      if (vendorStr) {
        if (pureOriginalMessage) {
          newRow[messageIdx] = `${vendorPrefix} ${pureOriginalMessage}`.trim();
        } else {
          newRow[messageIdx] = vendorPrefix;
        }
      } else {
        // 업체명이 비어있으면 순수 원본 메시지만 표시
        newRow[messageIdx] = pureOriginalMessage || "";
      }
    }

    return newRow;
  });

  return updatedTable;
}

/**
 * 배송메시지를 자동으로 처리하는 함수
 * - 온라인 유저 (userGrade === "온라인"): 배송메시지에 ★주문번호 추가
 * - 그 외 유저: 배송메시지 그대로 유지 (내부코드는 DB 저장 시 추가됨)
 * 
 * @param tableData - 테이블 데이터 (헤더 포함)
 * @param originalMessagesRef - 원본 배송메시지 저장 ref (rowIdx -> 원본 메시지)
 * @param userGrade - 사용자 등급 (optional, "온라인"일 때만 주문번호 추가)
 * @returns 업데이트된 테이블 데이터
 */
export function generateAutoDeliveryMessage(
  tableData: any[][],
  originalMessagesRef: {[rowIdx: number]: string},
  userGrade?: string | null
): any[][] {
  const headerRow = tableData[0];
  
  // 필요한 컬럼 인덱스 찾기
  const messageIdx = headerRow.findIndex(
    (h: any) =>
      h &&
      typeof h === "string" &&
      (h === "배송메시지" ||
        h === "배송메세지" ||
        h === "배송요청" ||
        h === "요청사항" ||
        h === "배송요청사항")
  );

  // 필수 컬럼이 없으면 원본 테이블 반환
  if (messageIdx === -1) return tableData;

  // 온라인 유저일 때만 주문번호 컬럼 인덱스 찾기
  let orderCodeIdx = -1;
  if (userGrade === "온라인") {
    orderCodeIdx = headerRow.findIndex(
      (h: any) =>
        h &&
        typeof h === "string" &&
        (h === "주문번호" ||
          h === "주문번호(사방넷)" ||
          h === "주문번호(쇼핑몰)" ||
          h === "주문 번호" ||
          h === "order_code" ||
          h === "orderCode")
    );
  }

  const updatedTable = tableData.map((row, idx) => {
    if (idx === 0) return row; // 헤더 행은 그대로 반환
    
    const newRow = [...row];
    
    // 현재 메시지 확인
    const currentMessage = row[messageIdx];
    const currentMessageStr = currentMessage !== null && currentMessage !== undefined
      ? String(currentMessage).trim()
      : "";
    
    // 원본 배송메시지 저장 (나중에 참조용)
    if (originalMessagesRef[idx] === undefined) {
      originalMessagesRef[idx] = currentMessageStr;
    }
    
    // 온라인 유저일 때만 ★주문번호 추가
    if (userGrade === "온라인" && orderCodeIdx !== -1) {
      // 이미 ★가 포함되어 있으면 스킵
      if (currentMessageStr.includes("★")) {
        return newRow;
      }
      
      // 주문번호 가져오기
      const orderValue = row[orderCodeIdx];
      const orderCode = orderValue !== null && orderValue !== undefined
        ? String(orderValue).trim()
        : "";
      
      // 주문번호가 있으면 배송메시지에 추가
      if (orderCode) {
        const newMessage = currentMessageStr
          ? `${currentMessageStr}★${orderCode}`
          : `★${orderCode}`;
        newRow[messageIdx] = newMessage;
      }
    }
    // 그 외 유저는 배송메시지 그대로 유지 (내부코드는 DB 저장 시 추가됨)
    
    return newRow;
  });

  return updatedTable;
}
