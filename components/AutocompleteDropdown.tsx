"use client";

import {useState, useEffect, useRef} from "react";

interface AutocompleteDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  onSelect?: (value: string) => void; // 드롭다운에서 선택했을 때만 호출
}

export default function AutocompleteDropdown({
  value,
  onChange,
  options,
  placeholder = "입력 또는 선택",
  className = "",
  onSelect,
}: AutocompleteDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [filteredOptions, setFilteredOptions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // value가 외부에서 변경되면 inputValue도 업데이트
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // 입력값에 따라 필터링된 옵션 업데이트
  useEffect(() => {
    if (inputValue.trim() === "") {
      setFilteredOptions(options);
    } else {
      const filtered = options.filter((opt) =>
        opt.toLowerCase().includes(inputValue.toLowerCase())
      );
      setFilteredOptions(filtered);
    }
    setSelectedIndex(-1);
  }, [inputValue, options]);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
    setIsOpen(true);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  const handleOptionClick = (option: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setInputValue(option);
    onChange(option);
    setIsOpen(false);
    // 드롭다운에서 선택했을 때만 onSelect 호출
    if (onSelect) {
      onSelect(option);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || filteredOptions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < filteredOptions.length) {
          const syntheticEvent = {
            preventDefault: () => {},
            stopPropagation: () => {},
          } as React.MouseEvent;
          handleOptionClick(filteredOptions[selectedIndex], syntheticEvent);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
    }
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="border border-gray-300 px-3 py-1 rounded text-sm w-full pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500"
          style={{minWidth: "150px"}}
        />
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-1 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded focus:outline-none"
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
      </div>
      {isOpen && filteredOptions.length > 0 && (
        <div 
          className="absolute z-50 mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-y-auto w-full"
          onMouseDown={(e) => e.preventDefault()} // 드롭다운 클릭 시 외부 클릭 감지 방지
        >
          {filteredOptions.map((option, index) => (
            <div
              key={option}
              className={`px-3 py-2 cursor-pointer hover:bg-gray-100 ${
                index === selectedIndex ? "bg-blue-50" : ""
              }`}
              onClick={(e) => handleOptionClick(option, e)}
              onMouseDown={(e) => e.preventDefault()} // mousedown 이벤트 전파 방지
            >
              <span className="text-sm">{option}</span>
            </div>
          ))}
        </div>
      )}
      {isOpen && inputValue.trim() !== "" && filteredOptions.length === 0 && (
        <div 
          className="absolute z-50 mt-1 bg-white border border-gray-300 rounded shadow-lg w-full"
          onMouseDown={(e) => e.preventDefault()} // 드롭다운 클릭 시 외부 클릭 감지 방지
        >
          <div className="px-3 py-2 text-sm text-gray-500">
            일치하는 항목이 없습니다
          </div>
        </div>
      )}
    </div>
  );
}
