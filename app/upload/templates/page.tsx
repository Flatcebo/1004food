"use client";

import {useState, useEffect, useRef, useMemo} from "react";
import {getAuthHeaders} from "@/utils/api";
import {IoClose, IoTrash} from "react-icons/io5";

interface Template {
  id: number;
  name: string;
  templateData: any;
  createdAt: string;
}

interface Product {
  code: string;
  displayName: string;
  sabangName: string | null;
  name: string;
  salePrice: number | null;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [allowedMappingCodes, setAllowedMappingCodes] = useState<string[]>([]);
  const [codeInput, setCodeInput] = useState<string>("");
  const [products, setProducts] = useState<Product[]>([]);
  const [codeSearchValue, setCodeSearchValue] = useState<string>("");
  const [isCodeDropdownOpen, setIsCodeDropdownOpen] = useState(false);
  const codeDropdownRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);

  // 템플릿 목록 가져오기
  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const response = await fetch("/api/upload/template", {
        headers,
      });
      const result = await response.json();
      if (result.success) {
        setTemplates(result.templates);
      } else {
        alert(`템플릿 조회 실패: ${result.error}`);
      }
    } catch (error: any) {
      console.error("템플릿 조회 실패:", error);
      alert(`템플릿 조회 중 오류: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  // 상품 목록 조회
  useEffect(() => {
    const loadProducts = async () => {
      const headers = getAuthHeaders();
      try {
        const response = await fetch("/api/mall-promotions/products", {
          headers,
        });
        const result = await response.json();
        if (result.success) {
          setProducts(result.data || []);
        }
      } catch (error) {
        console.error("상품 목록 조회 실패:", error);
      }
    };
    loadProducts();
  }, []);

  // 매핑코드로 필터링
  const filteredProductsByCode = useMemo(() => {
    if (!codeSearchValue) {
      return products.slice(0, 100);
    }
    const searchLower = codeSearchValue.toLowerCase();
    return products
      .filter((product) => product.code.toLowerCase().includes(searchLower))
      .slice(0, 100);
  }, [products, codeSearchValue]);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        codeDropdownRef.current &&
        !codeDropdownRef.current.contains(event.target as Node)
      ) {
        setIsCodeDropdownOpen(false);
      }
    };

    if (isCodeDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isCodeDropdownOpen]);

  // 템플릿 업로드
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const templateName = prompt(
      "템플릿 이름을 입력하세요:",
      file.name.replace(/\.(xlsx|xls)$/i, ""),
    );
    if (!templateName) {
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("templateName", templateName);

      // FormData를 사용할 때는 Content-Type을 제거해야 함 (브라우저가 자동 설정)
      const headers = getAuthHeaders();
      const {["Content-Type"]: _, ...headersWithoutContentType} =
        headers as any;

      const response = await fetch("/api/upload/template", {
        method: "POST",
        headers: headersWithoutContentType,
        body: formData,
      });

      const result = await response.json();
      if (result.success) {
        alert("양식 템플릿이 성공적으로 저장되었습니다.");
        await fetchTemplates();
      } else {
        alert(`템플릿 저장 실패: ${result.error}`);
      }
    } catch (error: any) {
      alert(`템플릿 저장 중 오류: ${error.message}`);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  // 템플릿 수정 모달 열기
  const handleEdit = (template: Template) => {
    setEditingTemplate(template);
    const codes = template.templateData?.allowedMappingCodes || [];
    setAllowedMappingCodes(codes);
    setCodeInput("");
    setCodeSearchValue("");
  };

  // 템플릿 수정 모달 닫기
  const handleCloseEditModal = () => {
    setEditingTemplate(null);
    setAllowedMappingCodes([]);
    setCodeInput("");
    setCodeSearchValue("");
  };

  // 매핑코드 추가
  const handleAddCode = (code?: string) => {
    const codeToAdd = code || codeInput.trim();
    if (!codeToAdd) return;

    if (!allowedMappingCodes.includes(codeToAdd)) {
      setAllowedMappingCodes([...allowedMappingCodes, codeToAdd]);
    }
    setCodeInput("");
    setCodeSearchValue("");
    setIsCodeDropdownOpen(false);
  };

  // 매핑코드 제거
  const handleRemoveCode = (code: string) => {
    setAllowedMappingCodes(allowedMappingCodes.filter((c) => c !== code));
  };

  // 템플릿 수정 저장
  const handleSaveEdit = async () => {
    if (!editingTemplate) return;

    setSaving(true);
    try {
      const headers = getAuthHeaders();
      const response = await fetch("/api/upload/template", {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          templateId: editingTemplate.id,
          allowedMappingCodes: allowedMappingCodes,
        }),
      });

      const result = await response.json();
      if (result.success) {
        alert("템플릿이 성공적으로 수정되었습니다.");
        await fetchTemplates();
        handleCloseEditModal();
      } else {
        alert(`템플릿 수정 실패: ${result.error}`);
      }
    } catch (error: any) {
      alert(`템플릿 수정 중 오류: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  // 템플릿 삭제
  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`템플릿 "${name}"을(를) 삭제하시겠습니까?`)) {
      return;
    }

    setDeletingId(id);
    try {
      const headers = getAuthHeaders();
      const response = await fetch(`/api/upload/template?id=${id}`, {
        method: "DELETE",
        headers,
      });

      const result = await response.json();
      if (result.success) {
        alert("템플릿이 성공적으로 삭제되었습니다.");
        await fetchTemplates();
      } else {
        alert(`템플릿 삭제 실패: ${result.error}`);
      }
    } catch (error: any) {
      alert(`템플릿 삭제 중 오류: ${error.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  // 날짜 포맷팅
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="w-full h-full flex flex-col items-start justify-start pt-4 px-4">
      <div className="w-full bg-[#ffffff] rounded-lg px-8 shadow-md">
        <div className="w-full mt-6">
          <div className="mb-4 flex gap-4 items-center justify-between ">
            <h2 className="text-xl font-bold">양식 템플릿 관리</h2>

            <div className="flex gap-2 items-center mb-0">
              <label className="px-5 py-2 bg-green-600 text-white text-sm font-bold rounded hover:bg-green-800 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {uploading ? "업로드 중..." : "템플릿 업로드"}
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleUpload}
                  disabled={uploading}
                />
              </label>

              <button
                className="px-5 py-2 bg-gray-500 text-white text-sm rounded hover:bg-gray-600 transition-colors"
                onClick={fetchTemplates}
                disabled={loading}
              >
                새로고침
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-500">로딩 중...</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              저장된 템플릿이 없습니다.
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
                      템플릿 이름
                    </th>
                    <th className="border border-[#cacaca] bg-gray-100 px-4 py-2 text-xs text-center">
                      컬럼 수
                    </th>
                    <th className="border border-[#cacaca] bg-gray-100 px-4 py-2 text-xs text-center">
                      생성일시
                    </th>
                    <th className="border border-[#cacaca] bg-gray-100 px-4 py-2 text-xs text-center">
                      작업
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((template, index) => (
                    <tr key={template.id} style={{height: "56px"}}>
                      <td
                        className="border px-4 border-gray-300 text-xs text-center align-middle"
                        style={{height: "56px"}}
                      >
                        {templates.length - index}
                      </td>
                      <td
                        className="border px-4 border-gray-300 text-xs align-middle text-left"
                        style={{height: "56px"}}
                      >
                        {template.name.replace(/\.(xlsx|xls)$/i, "")}
                      </td>
                      <td
                        className="border px-4 border-gray-300 text-xs text-center align-middle"
                        style={{height: "56px"}}
                      >
                        {template.templateData?.headers?.length || 0}개
                      </td>
                      <td
                        className="border px-4 border-gray-300 text-xs text-center align-middle"
                        style={{height: "56px"}}
                      >
                        {formatDate(template.createdAt)}
                      </td>
                      <td
                        className="border px-4 border-gray-300 text-xs text-center align-middle"
                        style={{height: "56px"}}
                      >
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => handleEdit(template)}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                          >
                            수정
                          </button>
                          <button
                            onClick={() =>
                              handleDelete(template.id, template.name)
                            }
                            disabled={deletingId === template.id}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {deletingId === template.id ? "삭제 중..." : "삭제"}
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

      {/* 템플릿 수정 모달 */}
      {editingTemplate && (
        <div className="fixed inset-0 bg-black/40 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">
                템플릿 수정: {editingTemplate.name}
              </h2>
              <button
                className="text-gray-500 hover:text-gray-700"
                onClick={handleCloseEditModal}
              >
                <IoClose className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* CJ외주 발주서인지 확인 */}
              {editingTemplate.name.includes("CJ") &&
                editingTemplate.name.includes("외주") && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        허용된 매핑코드 (CJ외주 발주서 다운로드 시 사용)
                      </label>
                      <p className="text-xs text-gray-500 mb-2">
                        다운로드 시 지정된 매핑코드만 포함됩니다. 매핑코드를
                        선택하거나 직접 입력할 수 있습니다.
                      </p>

                      {/* 매핑코드 입력 */}
                      <div className="relative" ref={codeDropdownRef}>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded"
                            placeholder="매핑코드 입력 또는 검색"
                            value={codeSearchValue || codeInput}
                            onChange={(e) => {
                              setCodeInput(e.target.value);
                              setCodeSearchValue(e.target.value);
                              setIsCodeDropdownOpen(true);
                            }}
                            onFocus={() => setIsCodeDropdownOpen(true)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddCode();
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleAddCode()}
                            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                          >
                            추가
                          </button>
                        </div>

                        {/* 매핑코드 드롭다운 */}
                        {isCodeDropdownOpen &&
                          filteredProductsByCode.length > 0 && (
                            <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded shadow-lg max-h-48 overflow-y-auto">
                              {filteredProductsByCode.map((product) => (
                                <div
                                  key={product.code}
                                  className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                                  onClick={() => handleAddCode(product.code)}
                                >
                                  <div className="font-medium text-sm">
                                    {product.displayName}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    매핑코드: {product.code}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                      </div>

                      {/* 추가된 매핑코드 목록 */}
                      {allowedMappingCodes.length > 0 && (
                        <div className="mt-3">
                          <div className="text-xs font-medium mb-2">
                            추가된 매핑코드 ({allowedMappingCodes.length}개)
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {allowedMappingCodes.map((code) => {
                              const product = products.find(
                                (p) => p.code === code,
                              );
                              return (
                                <div
                                  key={code}
                                  className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs"
                                >
                                  <span className="font-medium">{code}</span>
                                  {product && (
                                    <span className="text-gray-600">
                                      ({product.displayName})
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveCode(code)}
                                    className="ml-1 text-red-600 hover:text-red-800"
                                  >
                                    <IoTrash className="w-3 h-3" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              {/* 버튼 */}
              <div className="flex gap-2 justify-end pt-4 border-t">
                <button
                  type="button"
                  className="px-4 py-2 bg-gray-500 text-white text-sm rounded hover:bg-gray-600"
                  onClick={handleCloseEditModal}
                  disabled={saving}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                  onClick={handleSaveEdit}
                  disabled={saving}
                >
                  {saving ? "저장 중..." : "저장"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
