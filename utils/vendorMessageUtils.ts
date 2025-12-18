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
 * 배송메시지를 자동으로 생성하는 함수
 * 형식: #{주문자명}{기존 배송메시지}★{주문번호}
 * 
 * @param tableData - 테이블 데이터 (헤더 포함)
 * @param originalMessagesRef - 원본 배송메시지 저장 ref (rowIdx -> 원본 메시지)
 * @returns 업데이트된 테이블 데이터
 */
export function generateAutoDeliveryMessage(
  tableData: any[][],
  originalMessagesRef: {[rowIdx: number]: string}
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
  
  const ordererNameIdx = headerRow.findIndex(
    (h: any) =>
      h &&
      typeof h === "string" &&
      (h === "주문자명" || h === "주문자" || h === "주문자 이름")
  );
  
  const orderCodeIdx = headerRow.findIndex(
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

  // 필수 컬럼이 없으면 원본 테이블 반환
  if (messageIdx === -1) return tableData;

  const updatedTable = tableData.map((row, idx) => {
    if (idx === 0) return row; // 헤더 행은 그대로 반환
    
    const newRow = [...row];
    
    // 현재 메시지 확인 - 이미 자동 생성된 형식인지 체크
    const currentMessage = row[messageIdx];
    const currentMessageStr = currentMessage !== null && currentMessage !== undefined
      ? String(currentMessage).trim()
      : "";
    
    // 이미 자동 생성된 메시지 형식인지 확인 (#로 시작하면 스킵 - 주문번호 유무와 관계없이)
    if (currentMessageStr.startsWith('#')) {
      return newRow; // 이미 처리된 메시지는 그대로 유지
    }
    
    // 원본 배송메시지 가져오기
    let originalMessage = originalMessagesRef[idx];
    if (originalMessage === undefined) {
      originalMessage = currentMessageStr;
      originalMessagesRef[idx] = originalMessage;
    }
    
    // 주문자명 가져오기
    let ordererName = "";
    if (ordererNameIdx !== -1) {
      const ordererValue = row[ordererNameIdx];
      ordererName = ordererValue !== null && ordererValue !== undefined
        ? String(ordererValue).trim()
        : "";
    }
    
    // 주문번호 가져오기
    let orderCode = "";
    if (orderCodeIdx !== -1) {
      const orderValue = row[orderCodeIdx];
      orderCode = orderValue !== null && orderValue !== undefined
        ? String(orderValue).trim()
        : "";
    }
    
    // 배송메시지 자동 생성: #{주문자명}{기존 배송메시지}★{주문번호}
    let autoMessage = "";
    
    // 주문자명 추가 (있는 경우에만)
    if (ordererName) {
      autoMessage += `#${ordererName}`;
    }
    
    // 기존 배송메시지 추가 (있는 경우에만)
    if (originalMessage) {
      autoMessage += originalMessage;
    }
    
    // 주문번호 추가 (있는 경우에만)
    if (orderCode) {
      autoMessage += `★${orderCode}`;
    }
    
    // 생성된 메시지가 있으면 적용, 없으면 원본 메시지 유지
    if (autoMessage) {
      newRow[messageIdx] = autoMessage;
    }
    
    return newRow;
  });

  return updatedTable;
}
