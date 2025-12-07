"use client";

import {useState, useEffect} from "react";

interface Template {
  id: number;
  name: string;
  templateData: any;
  createdAt: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // 템플릿 목록 가져오기
  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/upload/template");
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

  // 템플릿 업로드
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const templateName = prompt(
      "템플릿 이름을 입력하세요:",
      file.name.replace(/\.(xlsx|xls)$/i, "")
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

      const response = await fetch("/api/upload/template", {
        method: "POST",
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

  // 템플릿 삭제
  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`템플릿 "${name}"을(를) 삭제하시겠습니까?`)) {
      return;
    }

    setDeletingId(id);
    try {
      const response = await fetch(`/api/upload/template?id=${id}`, {
        method: "DELETE",
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
                        <button
                          onClick={() =>
                            handleDelete(template.id, template.name)
                          }
                          disabled={deletingId === template.id}
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {deletingId === template.id ? "삭제 중..." : "삭제"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
