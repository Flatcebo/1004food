"use client";

import {useEffect, useState} from "react";
import {HeaderAlias, fetchHeaderAliases, updateHeaderAlias, createHeaderAlias, deleteHeaderAlias} from "@/utils/headerAliases";

export default function HeaderAliasesPage() {
  const [aliases, setAliases] = useState<HeaderAlias[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<HeaderAlias>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAlias, setNewAlias] = useState({
    column_key: "",
    column_label: "",
    aliases: [] as string[],
  });
  const [newAliasInput, setNewAliasInput] = useState(""); // 콤마 입력용 임시 상태
  const [editAliasInput, setEditAliasInput] = useState(""); // 수정용 임시 상태

  // 데이터 로드
  const loadAliases = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/header-aliases');
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '헤더 alias 조회 실패');
      }

      // DB에서 가져온 실제 데이터를 그대로 사용
      setAliases(result.data);
    } catch (error) {
      console.error("헤더 alias 로드 실패:", error);
      alert("헤더 alias를 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAliases();
  }, []);

  // 수정 모드 시작
  const startEditing = (alias: HeaderAlias) => {
    setEditingId(alias.id || null);
    setEditForm({
      column_key: alias.column_key,
      column_label: alias.column_label,
      aliases: [...alias.aliases],
    });
    setEditAliasInput(formatAliasesDisplay(alias.aliases));
  };

  // 수정 취소
  const cancelEditing = () => {
    setEditingId(null);
    setEditForm({});
    setEditAliasInput("");
  };

  // 수정 저장
  const saveEditing = async () => {
    if (!editingId || !editForm.column_key || !editForm.column_label) return;

    try {
      await updateHeaderAlias(editingId, {
        column_key: editForm.column_key,
        column_label: editForm.column_label,
        aliases: editForm.aliases || [],
      });
      await loadAliases();
      cancelEditing();
      setEditAliasInput("");
      alert("헤더 alias가 수정되었습니다.");
    } catch (error) {
      console.error("헤더 alias 수정 실패:", error);
      alert("헤더 alias 수정에 실패했습니다.");
    }
  };

  // 새로운 alias 추가
  const addNewAlias = async () => {
    if (!newAlias.column_key || !newAlias.column_label || newAlias.aliases.length === 0) {
      alert("모든 필드를 입력해주세요.");
      return;
    }

    try {
      await createHeaderAlias({
        column_key: newAlias.column_key,
        column_label: newAlias.column_label,
        aliases: newAlias.aliases,
      });
      await loadAliases();
      setNewAlias({column_key: "", column_label: "", aliases: []});
      setNewAliasInput("");
      setShowAddForm(false);
      alert("새로운 헤더 alias가 추가되었습니다.");
    } catch (error) {
      console.error("헤더 alias 추가 실패:", error);
      alert("헤더 alias 추가에 실패했습니다.");
    }
  };

  // alias 삭제
  const removeAlias = async (id: number) => {
    if (!confirm("정말로 이 헤더 alias를 삭제하시겠습니까?")) return;

    try {
      await deleteHeaderAlias(id);
      await loadAliases();
      alert("헤더 alias가 삭제되었습니다.");
    } catch (error) {
      console.error("헤더 alias 삭제 실패:", error);
      alert("헤더 alias 삭제에 실패했습니다.");
    }
  };

  // alias 문자열을 배열로 변환
  const parseAliasesInput = (input: string): string[] => {
    return input.split(',').map(s => s.trim()).filter(s => s.length > 0);
  };

  // alias 배열을 문자열로 변환
  const formatAliasesDisplay = (aliases: string[]): string => {
    return aliases.join(', ');
  };

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-lg">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col items-start justify-start px-4">
      <div className="w-full pb-80">
        <div className="w-full mt-6 bg-white rounded-lg px-8 py-6 shadow-md">
          <div className="mb-4 flex gap-4 items-center justify-between">
            <h2 className="text-xl font-bold">헤더 Alias 관리</h2>
            <button
              className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded hover:bg-blue-800"
              onClick={() => setShowAddForm(!showAddForm)}
            >
              {showAddForm ? "취소" : "새 Alias 추가"}
            </button>
          </div>

          {/* 새 Alias 추가 폼 */}
          {showAddForm && (
            <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <h3 className="text-lg font-semibold mb-4">새 헤더 Alias 추가</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    컬럼 키
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newAlias.column_key}
                    onChange={(e) => setNewAlias({...newAlias, column_key: e.target.value})}
                    placeholder="예: vendor"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    컬럼 라벨
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newAlias.column_label}
                    onChange={(e) => setNewAlias({...newAlias, column_label: e.target.value})}
                    placeholder="예: 업체명"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Alias들 (쉼표로 구분)
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newAliasInput}
                    onChange={(e) => setNewAliasInput(e.target.value)}
                    onBlur={() => {
                      // 포커스가 벗어날 때 실제 aliases 배열 업데이트
                      const parsed = parseAliasesInput(newAliasInput);
                      setNewAlias({...newAlias, aliases: parsed});
                    }}
                    placeholder="예: 업체명, 업체, 거래처명"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="px-4 py-2 bg-green-600 text-white text-sm font-bold rounded hover:bg-green-800"
                  onClick={addNewAlias}
                >
                  추가
                </button>
                <button
                  className="px-4 py-2 bg-gray-600 text-white text-sm font-bold rounded hover:bg-gray-800"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewAlias({column_key: "", column_label: "", aliases: []});
                    setNewAliasInput("");
                  }}
                >
                  취소
                </button>
              </div>
            </div>
          )}

          {/* Alias 목록 */}
          <div className="overflow-x-auto">
            <table className="w-full table-auto border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-300 px-4 py-2 text-left">컬럼 키</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">컬럼 라벨</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Alias 목록</th>
                  <th className="border border-gray-300 px-4 py-2 text-center w-32">작업</th>
                </tr>
              </thead>
              <tbody>
                {aliases.map((alias) => (
                  <tr key={alias.id} className="hover:bg-gray-50">
                    {editingId === alias.id ? (
                      <>
                        <td className="border border-gray-300 px-4 py-2">
                          <input
                            type="text"
                            className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            value={editForm.column_key || ""}
                            onChange={(e) => setEditForm({...editForm, column_key: e.target.value})}
                          />
                        </td>
                        <td className="border border-gray-300 px-4 py-2">
                          <input
                            type="text"
                            className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            value={editForm.column_label || ""}
                            onChange={(e) => setEditForm({...editForm, column_label: e.target.value})}
                          />
                        </td>
                        <td className="border border-gray-300 px-4 py-2">
                          <input
                            type="text"
                            className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            value={editAliasInput}
                            onChange={(e) => setEditAliasInput(e.target.value)}
                            onBlur={() => {
                              // 포커스가 벗어날 때 실제 aliases 배열 업데이트
                              const parsed = parseAliasesInput(editAliasInput);
                              setEditForm({...editForm, aliases: parsed});
                            }}
                            placeholder="예: 업체명, 업체, 거래처명"
                          />
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center">
                          <div className="flex gap-1 justify-center">
                            <button
                              className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                              onClick={saveEditing}
                            >
                              저장
                            </button>
                            <button
                              className="px-2 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700"
                              onClick={cancelEditing}
                            >
                              취소
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="border border-gray-300 px-4 py-2">{alias.column_key}</td>
                        <td className="border border-gray-300 px-4 py-2">{alias.column_label}</td>
                        <td className="border border-gray-300 px-4 py-2">
                          <div className="flex flex-wrap gap-1">
                            {alias.aliases.map((aliasItem, idx) => (
                              <span
                                key={idx}
                                className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
                              >
                                {aliasItem}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center">
                          <div className="flex gap-1 justify-center">
                            <button
                              className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                              onClick={() => startEditing(alias)}
                            >
                              수정
                            </button>
                            <button
                              className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                              onClick={() => removeAlias(alias.id!)}
                            >
                              삭제
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {aliases.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              등록된 헤더 alias가 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
