import {create} from "zustand";

interface SidebarState {
  openMenus: Set<string>;
  toggleMenu: (menuId: string) => void;
  openMenu: (menuId: string) => void;
  closeMenu: (menuId: string) => void;
  isMenuOpen: (menuId: string) => boolean;
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  openMenus: new Set<string>(),

  toggleMenu: (menuId: string) => {
    const {openMenus} = get();
    const newOpenMenus = new Set<string>();
    // 클릭한 메뉴가 이미 열려있으면 닫고, 닫혀있으면 다른 모든 메뉴를 닫고 해당 메뉴만 열기
    if (!openMenus.has(menuId)) {
      newOpenMenus.add(menuId);
    }
    set({openMenus: newOpenMenus});
  },

  openMenu: (menuId: string) => {
    const {openMenus} = get();
    const newOpenMenus = new Set(openMenus);
    newOpenMenus.add(menuId);
    set({openMenus: newOpenMenus});
  },

  closeMenu: (menuId: string) => {
    const {openMenus} = get();
    const newOpenMenus = new Set(openMenus);
    newOpenMenus.delete(menuId);
    set({openMenus: newOpenMenus});
  },

  isMenuOpen: (menuId: string) => {
    return get().openMenus.has(menuId);
  },
}));
