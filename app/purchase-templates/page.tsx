"use client";

import {useEffect, useState} from "react";
import {getAuthHeaders} from "@/utils/api";
import {HeaderAlias} from "@/utils/headerAliases";

interface Purchase {
  id: number;
  name: string;
  template_headers: TemplateHeader[] | null;
  created_at: string;
  updated_at: string;
}

interface TemplateHeader {
  column_key: string; // 내부 매핑용 고유 키 (변경 불가, DB 데이터 매핑에 사용)
  column_label: string; // 헤더 Alias의 기본 라벨
  display_name: string; // 사용자가 변경한 헤더명 (엑셀 다운로드 시 헤더로 사용)
}

export default function PurchaseTemplatesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(
    null
  );
  const [headerAliases, setHeaderAliases] = useState<HeaderAlias[]>([]);
  const [selectedHeaders, setSelectedHeaders] = useState<TemplateHeader[]>([]);
  const [saving, setSaving] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewPurchase, setViewPurchase] = useState<Purchase | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // purchase 목록 및 헤더 alias 로드
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // 헤더 alias 로드
      const aliasResponse = await fetch("/api/header-aliases");
      const aliasResult = await aliasResponse.json();
      if (aliasResult.success) {
        setHeaderAliases(aliasResult.data);
      }

      // purchase 목록 로드
      const headers = getAuthHeaders();
      const response = await fetch("/api/purchase/templates", {
        headers,
      });
      const result = await response.json();
      if (result.success) {
        setPurchases(result.data);
      } else {
        alert(`업체 목록 조회 실패: ${result.error}`);
      }
    } catch (error: any) {
      console.error("데이터 로드 실패:", error);
      alert(`데이터 로드 중 오류: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 템플릿 생성 모달 열기
  const openCreateModal = (purchase: Purchase) => {
    setSelectedPurchase(purchase);

    // 기본 헤더: 헤더 alias의 column_label을 기본값으로 사용
    const defaultHeaders: TemplateHeader[] = headerAliases.map((alias) => ({
      column_key: alias.column_key,
      column_label: alias.column_label,
      display_name: alias.column_label, // 기본값은 column_label
    }));

    // 기존 템플릿이 있으면 불러오기
    if (purchase.template_headers && Array.isArray(purchase.template_headers)) {
      setSelectedHeaders(purchase.template_headers);
    } else {
      setSelectedHeaders(defaultHeaders);
    }

    setShowModal(true);
  };

  // 헤더 선택/해제
  const toggleHeader = (alias: HeaderAlias) => {
    const isSelected = selectedHeaders.some(
      (h) => h.column_key === alias.column_key
    );

    if (isSelected) {
      // 해제
      setSelectedHeaders(
        selectedHeaders.filter((h) => h.column_key !== alias.column_key)
      );
    } else {
      // 추가
      setSelectedHeaders([
        ...selectedHeaders,
        {
          column_key: alias.column_key,
          column_label: alias.column_label,
          display_name: alias.column_label,
        },
      ]);
    }
  };

  // 드래그 시작
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  // 드래그 오버
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  // 드래그 리브
  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  // 드롭
  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();

    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newHeaders = [...selectedHeaders];
    const draggedItem = newHeaders[draggedIndex];

    // 드래그된 항목 제거
    newHeaders.splice(draggedIndex, 1);

    // 드롭 위치에 삽입
    newHeaders.splice(dropIndex, 0, draggedItem);

    setSelectedHeaders(newHeaders);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // 드래그 종료
  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // 헤더명 변경
  const updateHeaderName = (columnKey: string, newName: string) => {
    setSelectedHeaders(
      selectedHeaders.map((h) =>
        h.column_key === columnKey ? {...h, display_name: newName} : h
      )
    );
  };

  // 템플릿 저장
  const saveTemplate = async () => {
    if (!selectedPurchase || selectedHeaders.length === 0) {
      alert("최소 하나의 헤더를 선택해주세요.");
      return;
    }

    try {
      setSaving(true);
      const headers = getAuthHeaders();
      const response = await fetch("/api/purchase/templates", {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          purchaseId: selectedPurchase.id,
          templateHeaders: selectedHeaders,
        }),
      });

      const result = await response.json();
      if (result.success) {
        alert("템플릿이 성공적으로 저장되었습니다.");
        setShowModal(false);
        await loadData();
      } else {
        alert(`템플릿 저장 실패: ${result.error}`);
      }
    } catch (error: any) {
      alert(`템플릿 저장 중 오류: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  // 템플릿 삭제
  const deleteTemplate = async (purchase: Purchase) => {
    if (
      !confirm(
        `"${purchase.name}" 업체의 템플릿을 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`
      )
    ) {
      return;
    }

    try {
      setDeletingId(purchase.id);
      const headers = getAuthHeaders();
      const response = await fetch(
        `/api/purchase/templates?purchaseId=${purchase.id}`,
        {
          method: "DELETE",
          headers,
        }
      );

      const result = await response.json();
      if (result.success) {
        alert("템플릿이 성공적으로 삭제되었습니다.");
        await loadData();
      } else {
        alert(`템플릿 삭제 실패: ${result.error}`);
      }
    } catch (error: any) {
      alert(`템플릿 삭제 중 오류: ${error.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  // 날짜 포맷팅 (한국 시간)
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Seoul",
    });
  };

  // 검색 필터링
  const filteredPurchases = purchases.filter((purchase) => {
    if (!searchQuery.trim()) return true;
    return purchase.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase().trim());
  });

  return (
    <div className="w-full h-full flex flex-col items-start justify-start pt-4 px-4">
      <div className="w-full bg-[#ffffff] rounded-lg px-8 shadow-md">
        <div className="w-full mt-6">
          <div className="mb-4 flex gap-4 items-center justify-between">
            <h2 className="text-xl font-bold">업체별 템플릿 관리</h2>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                placeholder="업체명 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <button
                className="px-5 py-2 bg-gray-500 text-white text-sm rounded hover:bg-gray-600 transition-colors"
                onClick={loadData}
                disabled={loading}
              >
                새로고침
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-500">로딩 중...</div>
          ) : purchases.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              등록된 업체가 없습니다.
            </div>
          ) : filteredPurchases.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              검색 결과가 없습니다.
            </div>
          ) : (
            <div className="mt-2 w-full overflow-x-auto pb-12">
              <table className="table-auto border border-collapse border-gray-400 w-full min-w-[800px]">
                <thead>
                  <tr>
                    <th className="border border-[#cacaca] bg-gray-100 px-4 py-2 text-xs text-center">
                      번호
                    </th>
                    <th className="border border-[#cacaca] bg-gray-100 px-4 py-2 text-xs text-center">
                      업체명
                    </th>
                    <th className="border border-[#cacaca] bg-gray-100 px-4 py-2 text-xs text-center">
                      템플릿 헤더 수
                    </th>
                    <th className="border border-[#cacaca] bg-gray-100 px-4 py-2 text-xs text-center">
                      수정일시
                    </th>
                    <th className="border border-[#cacaca] bg-gray-100 px-4 py-2 text-xs text-center">
                      작업
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPurchases.map((purchase, index) => (
                    <tr key={purchase.id} style={{height: "56px"}}>
                      <td
                        className="border px-4 border-gray-300 text-xs text-center align-middle"
                        style={{height: "56px"}}
                      >
                        {filteredPurchases.length - index}
                      </td>
                      <td
                        className="border px-4 border-gray-300 text-xs align-middle text-left"
                        style={{height: "56px"}}
                      >
                        {purchase.name}
                      </td>
                      <td
                        className="border px-4 border-gray-300 text-xs text-center align-middle"
                        style={{height: "56px"}}
                      >
                        {purchase.template_headers?.length || 0}개
                      </td>
                      <td
                        className="border px-4 border-gray-300 text-xs text-center align-middle"
                        style={{height: "56px"}}
                      >
                        {purchase.updated_at
                          ? formatDate(purchase.updated_at)
                          : "-"}
                      </td>
                      <td
                        className="border px-4 border-gray-300 text-xs text-center align-middle"
                        style={{height: "56px"}}
                      >
                        <div className="flex gap-2 justify-center">
                          {purchase.template_headers &&
                            purchase.template_headers.length > 0 && (
                              <>
                                <button
                                  onClick={() => {
                                    setViewPurchase(purchase);
                                    setShowViewModal(true);
                                  }}
                                  className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors"
                                >
                                  보기
                                </button>
                                <button
                                  onClick={() => deleteTemplate(purchase)}
                                  disabled={deletingId === purchase.id}
                                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {deletingId === purchase.id
                                    ? "삭제 중..."
                                    : "삭제"}
                                </button>
                              </>
                            )}
                          <button
                            onClick={() => openCreateModal(purchase)}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                          >
                            템플릿 {purchase.template_headers ? "수정" : "생성"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 템플릿 생성/수정 모달 */}
      {showModal && selectedPurchase && (
        <div className="fixed inset-0 bg-black/30 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-[90%] max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">
                템플릿 {selectedPurchase.template_headers ? "수정" : "생성"} -{" "}
                {selectedPurchase.name}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                헤더를 선택하고 헤더명을 변경할 수 있습니다.
              </p>
              <p className="text-xs text-gray-500 mb-4">
                선택된 헤더는 드래그 앤 드롭으로 순서를 변경할 수 있습니다.
              </p>

              {/* 선택된 헤더 목록 (드래그 앤 드롭 가능) */}
              {selectedHeaders.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-semibold mb-2 text-gray-700">
                    선택된 헤더 (순서 변경 가능)
                  </h4>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto border border-blue-200 rounded p-4 bg-blue-50">
                    {selectedHeaders.map((header, index) => {
                      const alias = headerAliases.find(
                        (a) => a.column_key === header.column_key
                      );
                      return (
                        <div
                          key={header.column_key}
                          draggable
                          onDragStart={() => handleDragStart(index)}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, index)}
                          onDragEnd={handleDragEnd}
                          className={`flex items-center gap-4 p-3 rounded cursor-move transition-all ${
                            draggedIndex === index
                              ? "opacity-50 bg-gray-200"
                              : dragOverIndex === index
                              ? "bg-blue-200 border-2 border-blue-400"
                              : "bg-white hover:bg-gray-100 border border-gray-200"
                          }`}
                        >
                          <div className="flex items-center gap-2 text-gray-400">
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 8h16M4 16h16"
                              />
                            </svg>
                            <span className="text-xs text-gray-500">
                              {index + 1}
                            </span>
                          </div>
                          <div className="flex-1 flex items-center gap-4">
                            <span className="text-sm font-medium w-32">
                              {alias?.column_label || header.column_label}
                            </span>
                            <span className="text-sm text-gray-400">→</span>
                            <input
                              type="text"
                              value={header.display_name}
                              onChange={(e) =>
                                updateHeaderName(
                                  header.column_key,
                                  e.target.value
                                )
                              }
                              placeholder="헤더명 입력"
                              className="flex-1 px-3 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <button
                            onClick={() => {
                              setSelectedHeaders(
                                selectedHeaders.filter(
                                  (h) => h.column_key !== header.column_key
                                )
                              );
                            }}
                            className="text-red-500 hover:text-red-700 text-sm px-2"
                            title="제거"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 전체 헤더 목록 (선택용) */}
              <div>
                <h4 className="text-sm font-semibold mb-2 text-gray-700">
                  헤더 선택
                </h4>
                <div className="space-y-2 max-h-[300px] overflow-y-auto border border-gray-200 rounded p-4">
                  {headerAliases.map((alias) => {
                    const isSelected = selectedHeaders.some(
                      (h) => h.column_key === alias.column_key
                    );

                    return (
                      <div
                        key={alias.id}
                        className={`flex items-center gap-4 p-2 rounded ${
                          isSelected
                            ? "bg-gray-100 opacity-60"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleHeader(alias)}
                          className="w-4 h-4"
                          disabled={isSelected}
                        />
                        <div className="flex-1">
                          <span className="text-sm font-medium">
                            {alias.column_label}
                          </span>
                          {isSelected && (
                            <span className="text-xs text-gray-500 ml-2">
                              (이미 선택됨)
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-gray-500 text-white text-sm rounded hover:bg-gray-600 transition-colors"
              >
                취소
              </button>
              <button
                onClick={saveTemplate}
                disabled={saving || selectedHeaders.length === 0}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 템플릿 헤더 뷰 모달 */}
      {showViewModal && viewPurchase && (
        <div className="fixed inset-0 bg-black/30 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-[90%] max-w-6xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">
                템플릿 헤더 뷰 - {viewPurchase.name}
              </h3>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setViewPurchase(null);
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            {viewPurchase.template_headers &&
              viewPurchase.template_headers.length > 0 &&
              (() => {
                const headers = viewPurchase.template_headers!;
                return (
                  <div className="mt-4">
                    <h4 className="text-sm font-semibold mb-3 text-gray-700">
                      엑셀 형식 뷰 (헤더 행)
                    </h4>
                    <div className="w-full overflow-x-auto border border-gray-300 bg-white">
                      {/* 엑셀 스타일 테이블 */}
                      <table
                        className="border-collapse"
                        style={{
                          fontFamily: "Arial, sans-serif",
                          fontSize: "12px",
                          width: "100%",
                        }}
                      >
                        <thead>
                          <tr style={{height: "30px"}}>
                            {headers.map((header, index) => (
                              <th
                                key={header.column_key}
                                style={{
                                  border: "1px solid #000000",
                                  backgroundColor: "#FFFFFD01", // 노란색 배경
                                  fontWeight: "bold",
                                  textAlign: "center",
                                  verticalAlign: "middle",
                                  padding: "4px 8px",
                                  minWidth: "100px",
                                  whiteSpace: "nowrap",
                                  fontSize: "12px",
                                  fontFamily: "Arial, sans-serif",
                                }}
                              >
                                {header.display_name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {/* 빈 데이터 행 (엑셀처럼 보이게) */}
                          {[1, 2, 3, 4, 5].map((rowIndex) => (
                            <tr key={rowIndex} style={{height: "20px"}}>
                              {headers.map((header) => (
                                <td
                                  key={header.column_key}
                                  style={{
                                    border: "1px solid #D3D3D3",
                                    padding: "2px 4px",
                                    backgroundColor: "#FFFFFF",
                                    fontSize: "11px",
                                    fontFamily: "Arial, sans-serif",
                                    minWidth: "100px",
                                  }}
                                >
                                  {/* 빈 셀 */}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* 엑셀 열 번호 표시 (A, B, C...) */}
                    <div className="mt-2 flex gap-0">
                      <div
                        style={{
                          width: "30px",
                          height: "30px",
                          border: "1px solid #D3D3D3",
                          backgroundColor: "#F0F0F0",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "10px",
                          fontFamily: "Arial, sans-serif",
                        }}
                      >
                        {/* 빈 공간 (행 번호 영역) */}
                      </div>
                      {headers.map((_, index) => {
                        const columnLetter = String.fromCharCode(65 + index); // A, B, C...
                        return (
                          <div
                            key={index}
                            style={{
                              width: "100px",
                              height: "30px",
                              border: "1px solid #D3D3D3",
                              backgroundColor: "#F0F0F0",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "10px",
                              fontFamily: "Arial, sans-serif",
                              fontWeight: "bold",
                            }}
                          >
                            {columnLetter}
                          </div>
                        );
                      })}
                    </div>

                    <p className="text-xs text-gray-500 mt-3">
                      총 {headers.length}개 헤더 | 엑셀 형식으로 표시됨
                    </p>
                  </div>
                );
              })()}
            {(!viewPurchase.template_headers ||
              viewPurchase.template_headers.length === 0) && (
              <div className="text-center py-8 text-gray-500">
                템플릿 헤더가 없습니다.
              </div>
            )}

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setViewPurchase(null);
                }}
                className="px-4 py-2 bg-gray-500 text-white text-sm rounded hover:bg-gray-600 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
