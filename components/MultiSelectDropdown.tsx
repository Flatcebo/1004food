"use client";

import {useEffect, useState, useRef, useMemo} from "react";

interface Option {
  value: string | number;
  label: string;
}

interface MultiSelectDropdownProps {
  label: string;
  options: string[] | Option[];
  selectedValues: (string | number)[];
  onChange: (values: (string | number)[]) => void;
  placeholder?: string;
  className?: string;
  showSelectedTags?: boolean;
  enableAutocomplete?: boolean;
  customPadding?: string;
  labelOnTop?: boolean;
}

export default function MultiSelectDropdown({
  label,
  options,
  selectedValues,
  onChange,
  placeholder = "전체",
  className = "",
  showSelectedTags = false,
  enableAutocomplete = false,
  customPadding,
  labelOnTop = false,
}: MultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [filteredOptions, setFilteredOptions] = useState<Option[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        !target.closest(`.multi-select-dropdown-${label.replace(/\s+/g, "-")}`)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [label]);

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
    if (!isOpen && enableAutocomplete) {
      setInputValue("");
    }
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
    if (enableAutocomplete) {
      setInputValue("");
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setIsOpen(true);
    setSelectedIndex(-1);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || filteredOptions.length === 0) {
      if (e.key === "Enter" && inputValue.trim() !== "") {
        // 입력된 값과 정확히 일치하는 옵션 찾기
        const exactMatch = normalizedOptions.find(
          (opt) =>
            opt.label.toLowerCase() === inputValue.toLowerCase() &&
            !selectedValues.some((v) => String(v) === String(opt.value)),
        );
        if (exactMatch) {
          handleToggleOption(exactMatch.value);
          setInputValue("");
        }
      } else if (e.key === "Escape") {
        setIsOpen(false);
        setInputValue("");
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : prev,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < filteredOptions.length) {
          // 키보드로 선택된 항목 선택
          handleToggleOption(filteredOptions[selectedIndex].value);
        } else if (inputValue.trim() !== "") {
          // 입력된 값과 정확히 일치하는 옵션 찾기
          const exactMatch = normalizedOptions.find(
            (opt) =>
              opt.label.toLowerCase() === inputValue.toLowerCase() &&
              !selectedValues.some((v) => String(v) === String(opt.value)),
          );
          if (exactMatch) {
            handleToggleOption(exactMatch.value);
          }
        }
        break;
      case "Escape":
        setIsOpen(false);
        setInputValue("");
        setSelectedIndex(-1);
        break;
    }
  };

  // options가 string[]인지 Option[]인지 확인하고 정규화 (메모이제이션)
  const normalizedOptions: Option[] = useMemo(() => {
    return options.map((opt: string | Option) => {
      if (typeof opt === "string") {
        return {value: opt, label: opt};
      }
      return opt;
    });
  }, [options]);

  // 인풋 값에 따라 필터링된 옵션 업데이트
  useEffect(() => {
    if (!enableAutocomplete || inputValue.trim() === "") {
      setFilteredOptions(normalizedOptions);
    } else {
      const filtered = normalizedOptions.filter((opt) =>
        opt.label.toLowerCase().includes(inputValue.toLowerCase()),
      );
      setFilteredOptions(filtered);
    }
    setSelectedIndex(-1);
  }, [inputValue, normalizedOptions, enableAutocomplete]);

  // 선택된 인덱스가 변경될 때 스크롤 처리
  useEffect(() => {
    if (selectedIndex >= 0 && dropdownRef.current) {
      const selectedElement = dropdownRef.current.children[
        selectedIndex
      ] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      }
    }
  }, [selectedIndex]);

  // 드롭다운이 열릴 때 인풋에 포커스
  useEffect(() => {
    if (isOpen && enableAutocomplete && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [isOpen, enableAutocomplete]);

  const handleToggleOption = (optionValue: string | number) => {
    // 타입 안전한 비교를 위해 모든 값을 문자열로 변환하여 비교
    const normalizedSelected = selectedValues.map((v) => String(v));
    const normalizedValue = String(optionValue);

    if (normalizedSelected.includes(normalizedValue)) {
      // 제거: 원본 타입 유지하면서 필터링
      onChange(selectedValues.filter((v) => String(v) !== normalizedValue));
    } else {
      // 추가: 원본 타입 유지하면서 추가
      onChange([...selectedValues, optionValue]);
    }

    // 자동완성 모드일 때 인풋 초기화
    if (enableAutocomplete) {
      setInputValue("");
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  };

  // 체크박스 체크 상태 확인 (타입 안전)
  const isOptionSelected = (optionValue: string | number) => {
    return selectedValues.some((v) => String(v) === String(optionValue));
  };

  // 선택된 값들의 라벨 찾기
  const getSelectedLabels = () => {
    return selectedValues
      .map((val) => {
        const option = normalizedOptions.find((opt) => opt.value === val);
        return option ? option.label : String(val);
      })
      .filter(Boolean);
  };

  const selectedLabels = getSelectedLabels();
  const displayText =
    selectedValues.length === 0
      ? placeholder
      : selectedValues.length === 1
        ? selectedLabels[0] || String(selectedValues[0])
        : `${selectedValues.length}개 선택됨`;

  return (
    <div
      className={`text-sm font-medium multi-select-dropdown-${label.replace(
        /\s+/g,
        "-",
      )} relative ${
        labelOnTop || showSelectedTags ? "flex flex-col" : "flex items-center"
      } ${className}`}
    >
      {labelOnTop ? (
        <label className="mb-1">{label} :</label>
      ) : (
        <label className="mr-0">{label} :</label>
      )}
      <div
        className={`relative ${labelOnTop ? "" : "ml-2"} ${
          showSelectedTags ? "w-full" : ""
        }`}
      >
        <div
          className={`px-2 ${
            customPadding || "py-1"
          } border border-gray-300 rounded-lg bg-white text-left ${
            showSelectedTags ? "w-full" : "min-w-[150px]"
          } flex items-center justify-between hover:border-gray-400 focus-within:ring-2 focus-within:ring-blue-500`}
          onClick={(e) => {
            if (!enableAutocomplete) {
              toggleDropdown();
            }
          }}
        >
          {enableAutocomplete && isOpen ? (
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              placeholder={placeholder}
              className="flex-1 outline-none text-sm"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <button
              type="button"
              onClick={toggleDropdown}
              className="flex-1 text-left flex items-center justify-between focus:outline-none"
            >
              <span className="truncate">{displayText}</span>
            </button>
          )}
          {isOpen && selectedValues.length > 0 ? (
            <button
              type="button"
              onClick={handleClearAll}
              className="w-4 h-4 ml-2 flex items-center justify-center text-gray-500 hover:text-red-600 transition-colors shrink-0"
              title="전체 해제"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleDropdown}
              className="w-4 h-4 ml-2 flex items-center justify-center shrink-0 focus:outline-none"
            >
              <svg
                className={`w-4 h-4 transition-transform ${
                  isOpen ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          )}
        </div>
        {isOpen && (
          <div
            ref={dropdownRef}
            className="absolute z-9999 mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-48 overflow-y-auto min-w-[150px]"
          >
            {filteredOptions && filteredOptions.length > 0 ? (
              filteredOptions.map((option, index) => {
                const isChecked = isOptionSelected(option.value);
                const isHighlighted = index === selectedIndex;
                return (
                  <div
                    key={String(option.value)}
                    className={`flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer ${
                      isHighlighted ? "bg-blue-50" : ""
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleOption(option.value);
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      readOnly
                      className="mr-2 pointer-events-none"
                    />
                    <span className="text-sm">{option.label}</span>
                  </div>
                );
              })
            ) : (
              <div className="px-3 py-2 text-sm text-gray-500">
                옵션이 없습니다
              </div>
            )}
          </div>
        )}
      </div>
      {/* 선택된 항목들 표시 */}
      {showSelectedTags && selectedValues.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {selectedValues.map((value) => {
            const option = normalizedOptions.find(
              (opt) => String(opt.value) === String(value),
            );
            const label = option ? option.label : String(value);
            return (
              <span
                key={String(value)}
                className="inline-flex items-center px-2 py-1 rounded-md bg-blue-100 text-blue-800 text-xs"
              >
                {label}
                <button
                  type="button"
                  onClick={() => {
                    onChange(
                      selectedValues.filter((v) => String(v) !== String(value)),
                    );
                  }}
                  className="ml-1 text-blue-600 hover:text-blue-800"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
