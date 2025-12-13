/**
 * LoadingOverlay 사용 예제
 *
 * 이 파일은 LoadingOverlay와 useLoadingStore를
 * 다른 페이지나 컴포넌트에서 사용하는 방법을 보여줍니다.
 */

// === 예제 1: 기본 사용 ===
import {useLoadingStore} from "@/stores/loadingStore";
import LoadingOverlay from "@/components/LoadingOverlay";

function ExampleComponent1() {
  const {isLoading, title, message, subMessage, startLoading, stopLoading} =
    useLoadingStore();

  const handleProcess = async () => {
    // 로딩 시작
    startLoading("처리 중...", "데이터를 처리하고 있습니다.");

    try {
      // 실제 작업 수행
      await someAsyncOperation();

      // 성공
      alert("완료되었습니다!");
    } catch (error) {
      alert("오류가 발생했습니다.");
    } finally {
      // 로딩 종료
      stopLoading();
    }
  };

  return (
    <div>
      <LoadingOverlay
        isOpen={isLoading}
        title={title}
        message={message}
        subMessage={subMessage}
      />

      <button onClick={handleProcess}>작업 시작</button>
    </div>
  );
}

// === 예제 2: 진행 상황 업데이트 ===
import {useLoadingStore} from "@/stores/loadingStore";

function ExampleComponent2() {
  const {startLoading, updateLoadingMessage, stopLoading} = useLoadingStore();

  const handleMultiStepProcess = async () => {
    startLoading("데이터 처리 중...", "1단계: 데이터 검증 중...");

    try {
      // 1단계
      await step1();
      updateLoadingMessage("2단계: 데이터 변환 중...");

      // 2단계
      await step2();
      updateLoadingMessage("3단계: 데이터 저장 중...");

      // 3단계
      await step3();
      updateLoadingMessage("완료!");

      alert("모든 작업이 완료되었습니다!");
    } catch (error) {
      alert("오류가 발생했습니다.");
    } finally {
      stopLoading();
    }
  };

  return <button onClick={handleMultiStepProcess}>다단계 작업 시작</button>;
}

// === 예제 3: 커스텀 메시지 ===
import {useLoadingStore} from "@/stores/loadingStore";

function ExampleComponent3() {
  const {setLoading} = useLoadingStore();

  const handleCustomLoading = async () => {
    // 커스텀 메시지로 로딩 시작
    setLoading(true, {
      title: "파일 업로드 중...",
      message: "큰 파일을 업로드하고 있습니다.",
      subMessage: "네트워크 상태에 따라 시간이 걸릴 수 있습니다.",
    });

    try {
      await uploadLargeFile();
    } finally {
      setLoading(false);
    }
  };

  return <button onClick={handleCustomLoading}>파일 업로드</button>;
}

// === 예제 4: 다른 페이지에서 사용 ===
// app/some-page/page.tsx
("use client");

import {useLoadingStore} from "@/stores/loadingStore";
import LoadingOverlay from "@/components/LoadingOverlay";

export default function SomePage() {
  const {
    isLoading,
    title,
    message,
    subMessage,
    startLoading,
    updateLoadingMessage,
    stopLoading,
  } = useLoadingStore();

  const handleDownload = async () => {
    startLoading("다운로드 중...", "엑셀 파일 생성 중...");

    try {
      updateLoadingMessage("데이터 조회 중...");
      const data = await fetchData();

      updateLoadingMessage("엑셀 파일 생성 중...");
      const excel = await createExcel(data);

      updateLoadingMessage("다운로드 준비 중...");
      await downloadFile(excel);

      alert("다운로드가 완료되었습니다!");
    } catch (error) {
      alert("다운로드 중 오류가 발생했습니다.");
    } finally {
      stopLoading();
    }
  };

  return (
    <div>
      {/* 로딩 오버레이 - 페이지 어디든 한 번만 추가 */}
      <LoadingOverlay
        isOpen={isLoading}
        title={title}
        message={message}
        subMessage={subMessage}
      />

      <button onClick={handleDownload}>엑셀 다운로드</button>
    </div>
  );
}

// === 예제 5: Hook에서 사용 ===
// hooks/useDataExport.ts
import {useCallback} from "react";
import {useLoadingStore} from "@/stores/loadingStore";

export function useDataExport() {
  const {startLoading, updateLoadingMessage, stopLoading} = useLoadingStore();

  const exportData = useCallback(
    async (data: any[]) => {
      startLoading("데이터 내보내기", "데이터 처리 중...");

      try {
        updateLoadingMessage(`${data.length}개 항목 처리 중...`);
        const processed = await processData(data);

        updateLoadingMessage("파일 생성 중...");
        const file = await createFile(processed);

        updateLoadingMessage("다운로드 준비 중...");
        await download(file);

        return true;
      } catch (error) {
        console.error("Export error:", error);
        return false;
      } finally {
        stopLoading();
      }
    },
    [startLoading, updateLoadingMessage, stopLoading]
  );

  return {exportData};
}
