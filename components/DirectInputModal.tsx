"use client";

interface DirectInputModalProps {
  open: boolean;
  fields: string[];
  values: {[key: string]: string};
  fieldNameMap: {[key: string]: string};
  onClose: () => void;
  onSave: () => void;
  onValueChange: (key: string, value: string) => void;
}

export default function DirectInputModal({
  open,
  fields,
  values,
  fieldNameMap,
  onClose,
  onSave,
  onValueChange,
}: DirectInputModalProps) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#00000080] bg-opacity-30"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white shadow-xl rounded-xl px-8 py-7 min-w-[340px] max-w-[90vw] overflow-y-auto relative flex flex-col items-start"
      >
        <div className="font-bold text-lg mb-4 text-center text-[#333]">
          신규 상품정보 직접 입력
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
          className="w-full"
        >
          <table className="w-full text-xs mb-3 ">
            <tbody className="w-full flex flex-col gap-[10px]">
              {fields.map((key) => (
                <tr key={key} className="flex gap-[6px]">
                  <td className="pr-2 py-1 text-right font-medium text-gray-500 w-[75px]">
                    {fieldNameMap[key] || key}
                  </td>
                  <td className="w-full">
                    {key === "name" ? (
                      <input
                        type="text"
                        className="border border-[#e1e0e0] px-2 py-1 rounded w-full bg-gray-100 text-[#333]"
                        value={values.name || ""}
                        readOnly
                      />
                    ) : key === "type" ? (
                      <select
                        className="border border-[#e1e0e0] px-2 py-1 rounded w-full text-[#333]"
                        value={values[key] || ""}
                        onChange={(e) => onValueChange(key, e.target.value)}
                      >
                        <option value="">선택하세요</option>
                        <option value="내주">내주</option>
                        <option value="외주">외주</option>
                      </select>
                    ) : key === "postType" ? (
                      <select
                        className="border border-[#e1e0e0] px-2 py-1 rounded w-full text-[#333]"
                        value={values[key] || ""}
                        onChange={(e) => onValueChange(key, e.target.value)}
                      >
                        <option value="">선택하세요</option>
                        <option value="CJ대한통운">CJ대한통운</option>
                        <option value="우체국택배">우체국택배</option>
                        <option value="로젠택배">로젠택배</option>
                        <option value="롯데택배">롯데택배</option>
                        <option value="한진택배">한진택배</option>
                        <option value="천일택배">천일택배</option>
                      </select>
                    ) : key === "billType" ? (
                      <select
                        className="border border-[#e1e0e0] px-2 py-1 rounded w-full text-[#333]"
                        value={values[key] || ""}
                        onChange={(e) => onValueChange(key, e.target.value)}
                      >
                        <option value="">선택하세요</option>
                        <option value="과세">과세</option>
                        <option value="면세">면세</option>
                      </select>
                    ) : key === "productType" ? (
                      <select
                        className="border border-[#e1e0e0] px-2 py-1 rounded w-full text-[#333]"
                        value={values[key] || ""}
                        onChange={(e) => onValueChange(key, e.target.value)}
                      >
                        <option value="">선택하세요</option>
                        <option value="사입">사입</option>
                        <option value="제조">제조</option>
                      </select>
                    ) : key === "category" ? (
                      <select
                        className="border border-[#e1e0e0] px-2 py-1 rounded w-full text-[#333]"
                        value={values[key] || ""}
                        onChange={(e) => onValueChange(key, e.target.value)}
                      >
                        <option value="">선택하세요</option>
                        <option value="납품업체">납품업체</option>
                        <option value="온라인">온라인</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        className="border border-[#e1e0e0] px-2 py-1 rounded w-full text-[#333]"
                        value={values[key] || ""}
                        onChange={(e) => onValueChange(key, e.target.value)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-row gap-4 justify-end mt-4">
            <button
              type="button"
              className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300 text-xs font-semibold"
              onClick={onClose}
            >
              닫기
            </button>
            <button
              type="submit"
              className="bg-blue-600 px-4 py-2 rounded hover:bg-blue-700 text-xs text-white font-semibold"
            >
              저장
            </button>
          </div>
        </form>
        <button
          className="absolute top-2 right-4 text-gray-400 hover:text-black text-[24px]"
          onClick={onClose}
        >
          ×
        </button>
      </div>
    </div>
  );
}

