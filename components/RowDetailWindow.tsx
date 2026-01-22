"use client";

import {useState, useEffect} from "react";
import {getAuthHeaders} from "@/utils/api";

interface RowDetailWindowProps {
  rowData: any;
  onClose: () => void;
  onDataUpdate?: () => void;
}

// 수정 가능한 필드 목록
const EDITABLE_FIELDS = [
  "수량",
  "우편",
  "주소",
  "수취인명",
  "주문자명",
  "배송메시지",
  "수취인 전화번호",
  "주문자 전화번호",
];

export default function RowDetailWindow({
  rowData,
  onClose,
  onDataUpdate,
}: RowDetailWindowProps) {
  const [formData, setFormData] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (rowData) {
      const initialData: any = {};
      EDITABLE_FIELDS.forEach((field) => {
        initialData[field] = rowData[field] || "";
      });
      setFormData(initialData);
      setHasChanges(false);
    }
  }, [rowData]);

  const handleFieldChange = (field: string, value: string) => {
    setFormData((prev: any) => ({
      ...prev,
      [field]: value,
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!rowData?.id) {
      alert("데이터 ID가 없습니다.");
      return;
    }

    setIsSaving(true);
    try {
      const updateData: any = {};
      EDITABLE_FIELDS.forEach((field) => {
        const value = formData[field] || "";
        // 우편 필드는 "우편"으로 저장
        if (field === "우편") {
          updateData["우편"] = value;
        } else {
          updateData[field] = value;
        }
      });

      const headers = getAuthHeaders();
      const response = await fetch("/api/upload/update-row", {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rowId: rowData.id,
          rowData: updateData,
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert("데이터가 성공적으로 저장되었습니다.");
        setHasChanges(false);
        if (onDataUpdate) {
          onDataUpdate();
        }
      } else {
        alert(`저장 실패: ${result.error || "알 수 없는 오류"}`);
      }
    } catch (error: any) {
      console.error("데이터 저장 실패:", error);
      alert(`저장 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!rowData) return null;

  // 필드 표시명 매핑
  const getFieldLabel = (key: string) => {
    const labelMap: {[key: string]: string} = {
      id: "ID",
      upload_time: "업로드 시간",
      내부코드: "내부코드",
      주문번호: "주문번호",
      매핑코드: "매핑코드",
      상품명: "상품명",
      내외주: "내외주",
      택배사: "택배사",
      운송장번호: "운송장번호",
      합포수량: "합포수량",
      수량: "수량",
      가격: "가격",
      택배비: "택배비",
      기타: "기타",
      우편: "우편번호",
      주소: "주소",
      수취인명: "수취인명",
      주문자명: "주문자명",
      배송메시지: "배송메시지",
      "수취인 전화번호": "수취인 전화번호",
      "주문자 전화번호": "주문자 전화번호",
      업체명: "업체명",
      쇼핑몰명: "쇼핑몰명",
      주문상태: "주문상태",
      등록일: "등록일",
    };
    return labelMap[key] || key;
  };

  // 읽기 전용 필드 목록 (수정 불가)
  const readonlyFields = Object.keys(rowData).filter(
    (key) => key !== "file_name" && !EDITABLE_FIELDS.includes(key)
  );

  return (
    <div className="fixed inset-0 bg-black/30 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[95vw] max-w-6xl h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b bg-gray-50 rounded-t-lg">
          <h2 className="text-2xl font-bold text-gray-800">상세 데이터</h2>
          <div className="flex items-center gap-3">
            {hasChanges && (
              <span className="text-sm text-orange-600 font-medium">
                변경사항이 있습니다
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition-colors"
            >
              {isSaving ? "저장 중..." : "저장"}
            </button>
            <button
              onClick={onClose}
              className="px-5 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 font-medium transition-colors"
            >
              닫기
            </button>
          </div>
        </div>

        {/* 상세 데이터 */}
        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-8">
            {/* 수정 가능한 필드 섹션 */}
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b">
                수정 가능한 정보
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {EDITABLE_FIELDS.map((field) => {
                  return (
                    <div key={field} className="space-y-1">
                      <label className="block text-sm font-medium text-gray-700 ml-1">
                        {getFieldLabel(field)}
                      </label>
                      <input
                        type="text"
                        value={formData[field] || ""}
                        onChange={(e) =>
                          handleFieldChange(field, e.target.value)
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder={`${getFieldLabel(field)}을(를) 입력하세요`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 읽기 전용 필드 섹션 */}
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b">
                기본 정보
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                {readonlyFields.map((key) => {
                  const value = rowData[key];
                  const displayValue =
                    key === "upload_time" && value
                      ? new Date(value).toLocaleString("ko-KR")
                      : value !== undefined && value !== null
                      ? String(value)
                      : "-";

                  return (
                    <div key={key} className="space-y-1">
                      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                        {getFieldLabel(key)}
                      </label>
                      <div className="text-sm text-gray-900 bg-gray-50 px-3 py-2 rounded border border-gray-200 wrap-break-word">
                        {displayValue}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
