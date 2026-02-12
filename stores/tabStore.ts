import {create} from "zustand";
import {persist} from "zustand/middleware";

const STORAGE_KEY = "tab-saved-config";

export interface TabItem {
  id: string;
  path: string;
  name: string;
}

interface TabState {
  tabs: TabItem[];
  activeTabId: string | null;
  addTab: (path: string, name: string) => void;
  removeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  getOrCreateTab: (path: string, name: string) => TabItem;
  clearAllTabs: () => void;
  setTabs: (tabs: TabItem[]) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
}

function generateTabId() {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  addTab: (path: string, name: string) => {
    const {tabs, getOrCreateTab} = get();
    const tab = getOrCreateTab(path, name);
    const exists = tabs.some((t) => t.id === tab.id);
    if (!exists) {
      set({
        tabs: [...tabs, tab],
        activeTabId: tab.id,
      });
    } else {
      set({activeTabId: tab.id});
    }
  },

  removeTab: (id: string) => {
    const {tabs, activeTabId} = get();
    const index = tabs.findIndex((t) => t.id === id);
    if (index === -1) return;

    const newTabs = tabs.filter((t) => t.id !== id);
    let newActiveId = activeTabId;

    if (activeTabId === id) {
      if (newTabs.length > 0) {
        newActiveId =
          index < newTabs.length
            ? newTabs[index].id
            : newTabs[newTabs.length - 1].id;
      } else {
        newActiveId = null;
      }
    }

    set({tabs: newTabs, activeTabId: newActiveId});
  },

  setActiveTab: (id: string) => {
    set({activeTabId: id});
  },

  getOrCreateTab: (path: string, name: string) => {
    const {tabs} = get();
    const existing = tabs.find((t) => t.path === path);
    if (existing) return existing;
    return {
      id: generateTabId(),
      path,
      name,
    };
  },

  clearAllTabs: () => {
    set({tabs: [], activeTabId: null});
  },

  setTabs: (tabs: TabItem[]) => {
    set({
      tabs,
      activeTabId: tabs.length > 0 ? tabs[0].id : null,
    });
  },

  reorderTabs: (fromIndex: number, toIndex: number) => {
    const {tabs} = get();
    if (
      fromIndex < 0 ||
      fromIndex >= tabs.length ||
      toIndex < 0 ||
      toIndex >= tabs.length
    )
      return;
    const newTabs = [...tabs];
    const [removed] = newTabs.splice(fromIndex, 1);
    newTabs.splice(toIndex, 0, removed);
    set({tabs: newTabs});
  },
}));

// localStorage에 저장된 탭 구성 (저장/불러오기/삭제용)
export function saveTabConfigToStorage() {
  const state = useTabStore.getState();
  const config = {
    tabs: state.tabs,
    savedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }
  return config;
}

export function loadTabConfigFromStorage(): TabItem[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const config = JSON.parse(raw);
    return config.tabs || null;
  } catch {
    return null;
  }
}

export function clearTabConfigFromStorage() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}
