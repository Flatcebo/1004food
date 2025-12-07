"use client";

import {useState} from "react";

export default function Home() {
  const [initLoading, setInitLoading] = useState(false);
  const [seedLoading, setSeedLoading] = useState(false);
  const [initMessage, setInitMessage] = useState<string | null>(null);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);

  const handleInitSchema = async () => {
    setInitLoading(true);
    setInitMessage(null);
    try {
      const response = await fetch("/api/upload/init", {
        method: "POST",
      });
      const result = await response.json();
      if (result.success) {
        setInitMessage("스키마가 성공적으로 초기화되었습니다.");
      } else {
        setInitMessage(`초기화 실패: ${result.error}`);
      }
    } catch (error: any) {
      setInitMessage(`초기화 중 오류 발생: ${error.message}`);
    } finally {
      setInitLoading(false);
    }
  };

  const handleSeedProducts = async () => {
    setSeedLoading(true);
    setSeedMessage(null);
    try {
      const response = await fetch("/api/products/seed", {
        method: "POST",
      });
      const result = await response.json();
      if (result.success) {
        setSeedMessage(result.message || "상품 데이터가 성공적으로 시딩되었습니다.");
      } else {
        setSeedMessage(`시딩 실패: ${result.error}`);
      }
    } catch (error: any) {
      setSeedMessage(`시딩 중 오류 발생: ${error.message}`);
    } finally {
      setSeedLoading(false);
    }
  };

  return (
    <div className="w-full h-full flex items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-6">
        <h1 className="text-3xl font-bold text-center mb-8">관리자 도구</h1>
        
        <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
          <h2 className="text-xl font-semibold mb-4">Product 스키마 관리</h2>
          
          <div className="space-y-4">
            <div>
              <button
                onClick={handleInitSchema}
                disabled={initLoading}
                className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {initLoading ? "처리 중..." : "Product 스키마 초기화"}
              </button>
              {initMessage && (
                <p className={`mt-2 text-sm ${initMessage.includes("실패") || initMessage.includes("오류") ? "text-red-600" : "text-green-600"}`}>
                  {initMessage}
                </p>
              )}
            </div>

            <div>
              <button
                onClick={handleSeedProducts}
                disabled={seedLoading}
                className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {seedLoading ? "처리 중..." : "Product 데이터 시딩"}
              </button>
              {seedMessage && (
                <p className={`mt-2 text-sm ${seedMessage.includes("실패") || seedMessage.includes("오류") ? "text-red-600" : "text-green-600"}`}>
                  {seedMessage}
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              <strong>주의사항:</strong>
            </p>
            <ul className="text-sm text-gray-600 mt-2 list-disc list-inside space-y-1">
              <li>스키마 초기화는 기존 테이블을 생성하거나 업데이트합니다.</li>
              <li>데이터 시딩은 codes.json 파일의 데이터를 DB에 삽입합니다.</li>
              <li>기존 데이터가 있으면 업데이트됩니다.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
