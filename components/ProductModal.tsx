"use client";

import {useState, useEffect} from "react";
import {fieldNameMap} from "@/constants/fieldMappings";

interface Product {
  id?: number;
  type: string | null;
  postType: string | null;
  name: string;
  code: string;
  pkg: string | null;
  price: number | null;
  salePrice: number | null;
  postFee: number | null;
  purchase: string | null;
  billType: string | null;
  category: string | null;
  productType: string | null;
  sabangName: string | null;
  etc: string | null;
}

interface ProductModalProps {
  open: boolean;
  product: Product | null;
  onClose: () => void;
  onSave: (product: Product) => Promise<void>;
}

export default function ProductModal({
  open,
  product,
  onClose,
  onSave,
}: ProductModalProps) {
  const [formData, setFormData] = useState<Product>({
    type: null,
    postType: null,
    name: "",
    code: "",
    pkg: null,
    price: null,
    salePrice: null,
    postFee: null,
    purchase: null,
    billType: null,
    category: null,
    productType: null,
    sabangName: null,
    etc: null,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (product) {
        setFormData(product);
      } else {
        // 신규 등록
        setFormData({
          type: null,
          postType: null,
          name: "",
          code: "",
          pkg: null,
          price: null,
          salePrice: null,
          postFee: null,
          purchase: null,
          billType: null,
          category: null,
          productType: null,
          sabangName: null,
          etc: null,
        });
      }
    }
  }, [open, product]);

  const handleChange = (
    field: keyof Product,
    value: string | number | null
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value === "" ? null : value,
    }));
  };

  // 숫자 필드 변경 핸들러 (0 값도 유지)
  const handleNumberChange = (
    field: keyof Product,
    value: string
  ) => {
    if (value === "") {
      setFormData((prev) => ({
        ...prev,
        [field]: null,
      }));
    } else {
      const numValue = Number(value);
      // NaN이 아니면 숫자로 저장 (0도 포함)
      if (!isNaN(numValue)) {
        setFormData((prev) => ({
          ...prev,
          [field]: numValue,
        }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.code.trim()) {
      alert("상품명과 매핑코드는 필수입니다.");
      return;
    }

    setSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error("저장 실패:", error);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">
            {product ? "상품 수정" : "상품 등록"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* 필수 필드 */}
            <div>
              <label className="block text-sm font-medium mb-1">
                {fieldNameMap.name} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name || ""}
                onChange={(e) => handleChange("name", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {fieldNameMap.code} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.code || ""}
                onChange={(e) => handleChange("code", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
                required
              />
            </div>

            {/* 선택 필드 */}
            <div>
              <label className="block text-sm font-medium mb-1">
                {fieldNameMap.type}
              </label>
              <input
                type="text"
                value={formData.type || ""}
                onChange={(e) => handleChange("type", e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {fieldNameMap.postType}
              </label>
              <input
                type="text"
                value={formData.postType || ""}
                onChange={(e) =>
                  handleChange("postType", e.target.value || null)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {fieldNameMap.sabangName}
              </label>
              <input
                type="text"
                value={formData.sabangName || ""}
                onChange={(e) =>
                  handleChange("sabangName", e.target.value || null)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {fieldNameMap.pkg}
              </label>
              <input
                type="text"
                value={formData.pkg || ""}
                onChange={(e) => handleChange("pkg", e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {fieldNameMap.price}
              </label>
              <input
                type="number"
                step="any"
                value={formData.price !== null && formData.price !== undefined ? formData.price : ""}
                onChange={(e) => handleNumberChange("price", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {fieldNameMap.salePrice}
              </label>
              <input
                type="number"
                step="any"
                value={formData.salePrice !== null && formData.salePrice !== undefined ? formData.salePrice : ""}
                onChange={(e) => handleNumberChange("salePrice", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {fieldNameMap.postFee}
              </label>
              <input
                type="number"
                step="any"
                value={formData.postFee !== null && formData.postFee !== undefined ? formData.postFee : ""}
                onChange={(e) => handleNumberChange("postFee", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {fieldNameMap.purchase}
              </label>
              <select
                value={formData.purchase || ""}
                onChange={(e) =>
                  handleChange("purchase", e.target.value || null)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded"
              >
                <option value="">선택하세요</option>
                <option value="납품업체">납품업체</option>
                <option value="온라인">온라인</option>
                <option value="직접구매">직접구매</option>
                <option value="기타">기타</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {fieldNameMap.billType}
              </label>
              <input
                type="text"
                value={formData.billType || ""}
                onChange={(e) =>
                  handleChange("billType", e.target.value || null)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {fieldNameMap.category}
              </label>
              <input
                type="text"
                value={formData.category || ""}
                onChange={(e) =>
                  handleChange("category", e.target.value || null)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {fieldNameMap.productType}
              </label>
              <input
                type="text"
                value={formData.productType || ""}
                onChange={(e) =>
                  handleChange("productType", e.target.value || null)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">
                {fieldNameMap.etc}
              </label>
              <textarea
                value={formData.etc || ""}
                onChange={(e) => handleChange("etc", e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
                rows={3}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:bg-gray-400"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

