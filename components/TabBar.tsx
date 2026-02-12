"use client";

import {useState, useCallback} from "react";
import {
  useTabStore,
  saveTabConfigToStorage,
  loadTabConfigFromStorage,
  clearTabConfigFromStorage,
  type TabItem,
} from "@/stores/tabStore";
import {IoClose, IoSave, IoFolderOpen, IoTrash} from "react-icons/io5";

export default function TabBar() {
  const {tabs, activeTabId, setActiveTab, removeTab, setTabs, clearAllTabs} =
    useTabStore();
  const [showSaveMenu, setShowSaveMenu] = useState(false);

  const handleSave = useCallback(() => {
    saveTabConfigToStorage();
    setShowSaveMenu(false);
    alert("탭 구성이 저장되었습니다.");
  }, []);

  const handleLoad = useCallback(() => {
    const saved = loadTabConfigFromStorage();
    if (!saved || saved.length === 0) {
      alert("저장된 탭 구성이 없습니다.");
      setShowSaveMenu(false);
      return;
    }
    setTabs(saved);
    setShowSaveMenu(false);
  }, [setTabs]);

  const handleDeleteConfig = useCallback(() => {
    if (!confirm("저장된 탭 구성을 삭제하시겠습니까?")) return;
    clearTabConfigFromStorage();
    clearAllTabs();
    setShowSaveMenu(false);
    alert("저장된 탭 구성이 삭제되었습니다.");
  }, [clearAllTabs]);

  if (tabs.length === 0) return null;

  return (
    <div className="w-full bg-gray-50 border-b border-gray-200 flex items-center">
      <div className="flex-1 flex items-center overflow-x-auto scrollbar-thin">
        {tabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={activeTabId === tab.id}
            onSelect={() => setActiveTab(tab.id)}
            onClose={() => removeTab(tab.id)}
          />
        ))}
      </div>
      <div className="shrink-0 flex items-center gap-1 px-2 py-1 border-l border-gray-200">
        <div className="relative">
          <button
            onClick={() => setShowSaveMenu(!showSaveMenu)}
            className="p-2 rounded hover:bg-gray-200 text-gray-600 hover:text-gray-900 transition-colors"
            title="탭 관리"
          >
            <IoSave className="w-4 h-4" />
          </button>
          {showSaveMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowSaveMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 py-1 bg-white rounded-lg shadow-lg border border-gray-200 z-20 min-w-[160px]">
                <button
                  onClick={handleSave}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                >
                  <IoSave className="w-4 h-4" />
                  저장
                </button>
                <button
                  onClick={handleLoad}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                >
                  <IoFolderOpen className="w-4 h-4" />
                  불러오기
                </button>
                <button
                  onClick={handleDeleteConfig}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                >
                  <IoTrash className="w-4 h-4" />
                  저장 구성 삭제
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TabItem({
  tab,
  isActive,
  onSelect,
  onClose,
}: {
  tab: TabItem;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`
        flex items-center gap-2 px-4 py-2 min-w-0 max-w-[200px] cursor-pointer
        border-r border-gray-200 transition-colors
        ${isActive ? "bg-white border-t-2 border-t-blue-500 text-blue-600 font-medium" : "hover:bg-gray-100 text-gray-600"}
      `}
    >
      <span className="truncate flex-1 text-sm">{tab.name}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="p-0.5 rounded hover:bg-gray-200 hover:text-gray-800 shrink-0"
      >
        <IoClose className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
