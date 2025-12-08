/**
 * 테이블 체크박스 선택 상태 관리 훅
 */
import {useState, useMemo, useCallback} from "react";

export function useTableSelection<T extends {id: number}>(
  items: T[]
): {
  selectedIds: Set<number>;
  isAllSelected: boolean;
  isIndeterminate: boolean;
  handleSelectAll: (checked: boolean) => void;
  handleSelectItem: (id: number, checked: boolean) => void;
  clearSelection: () => void;
} {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const isAllSelected = useMemo(() => {
    return items.length > 0 && items.every((item) => selectedIds.has(item.id));
  }, [items, selectedIds]);

  const isIndeterminate = useMemo(() => {
    return selectedIds.size > 0 && selectedIds.size < items.length;
  }, [selectedIds.size, items.length]);

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        const allIds = new Set(items.map((item) => item.id));
        setSelectedIds(allIds);
      } else {
        setSelectedIds(new Set());
      }
    },
    [items]
  );

  const handleSelectItem = useCallback((id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(id);
      } else {
        newSet.delete(id);
      }
      return newSet;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return {
    selectedIds,
    isAllSelected,
    isIndeterminate,
    handleSelectAll,
    handleSelectItem,
    clearSelection,
  };
}

