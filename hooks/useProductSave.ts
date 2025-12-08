/**
 * 상품 저장 관련 훅
 */
import {useState, useCallback} from "react";
import {transformProductData} from "@/utils/product";
import {createProduct} from "@/utils/api";

interface UseProductSaveProps {
  onSuccess?: () => void;
}

export function useProductSave({onSuccess}: UseProductSaveProps = {}) {
  const [saving, setSaving] = useState(false);

  const saveProduct = useCallback(
    async (values: {[key: string]: string}) => {
      // 필수값 검증
      if (!values.name || !values.code) {
        alert("상품명과 매핑코드는 필수입니다.");
        return false;
      }

      setSaving(true);
      try {
        const requestBody = transformProductData(values);
        const result = await createProduct(requestBody);

        if (result.success) {
          if (onSuccess) {
            onSuccess();
          }
          return true;
        } else {
          alert(`상품 저장 실패: ${result.error}`);
          return false;
        }
      } catch (error) {
        console.error("상품 저장 실패:", error);
        const errorMessage = error instanceof Error 
          ? error.message 
          : "상품 저장 중 오류가 발생했습니다.";
        alert(`상품 저장 중 오류가 발생했습니다: ${errorMessage}`);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [onSuccess]
  );

  return {
    saveProduct,
    saving,
  };
}

