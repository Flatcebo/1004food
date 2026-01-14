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
    const newOpenMenus = new Set(openMenus);
    if (newOpenMenus.has(menuId)) {
      newOpenMenus.delete(menuId);
    } else {
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
