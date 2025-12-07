"use client";

interface ActiveFilter {
  type: string;
  label: string;
  value: string;
}

interface ActiveFiltersProps {
  filters: ActiveFilter[];
  onRemoveFilter: (filterType: string) => void;
}

export default function ActiveFilters({
  filters,
  onRemoveFilter,
}: ActiveFiltersProps) {
  if (filters.length === 0) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-gray-400">|</span>
      {filters.map((filter, idx) => (
        <span key={idx} className="flex items-center gap-1">
          <button
            onClick={() => onRemoveFilter(filter.type)}
            className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 transition-colors flex items-center gap-1"
            title="클릭하여 필터 제거"
          >
            <span>
              {filter.label}: {filter.value}
            </span>
            <span className="text-blue-500">×</span>
          </button>
          {idx < filters.length - 1 && <span className="text-gray-300">·</span>}
        </span>
      ))}
    </div>
  );
}

