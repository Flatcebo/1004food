"use client";

import Image from "next/image";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useAuthStore} from "@/stores/authStore";
import {useSidebarStore} from "@/stores/sidebarStore";
import {useEffect, useState} from "react";
import {
  IoList,
  IoCube,
  IoDocumentText,
  IoStatsChart,
  IoChevronDown,
  IoChevronUp,
  IoShieldCheckmark,
} from "react-icons/io5";
import {IconType} from "react-icons";

interface AccordionMenuItem {
  path: string;
  name: string;
}

interface AccordionMenuConfig {
  id: string;
  icon: IconType;
  title: string;
  items: AccordionMenuItem[];
  autoOpenPaths?: string[];
  requiresAdmin?: boolean;
}

// 메뉴 설정 배열 (컴포넌트 외부로 이동)
const menuConfigs: AccordionMenuConfig[] = [
  {
    id: "order",
    icon: IoList,
    title: "주문 관리",
    items: [
      {
        path: "/order",
        name: "주문 리스트",
      },
    ],
    autoOpenPaths: ["/order", "/order/upload"],
  },
  {
    id: "products",
    icon: IoCube,
    title: "상품 관리",
    items: [
      {
        path: "/products",
        name: "상품 조회",
      },
      {
        path: "/products/edit",
        name: "상품 일괄 수정",
      },
    ],
    autoOpenPaths: ["/products", "/products/edit"],
  },
  {
    id: "settlement",
    icon: IoStatsChart,
    title: "정산 관리",
    items: [
      {
        path: "/analytics/sales-by-mall",
        name: "매출 정산 관리",
      },
      {
        path: "/mall-promotions",
        name: "쇼핑몰 프로모션 관리",
      },
    ],
    autoOpenPaths: ["/analytics/sales-by-mall", "/mall-promotions"],
  },
  {
    id: "template",
    icon: IoDocumentText,
    title: "양식 관리",
    items: [
      {
        path: "/upload/templates",
        name: "양식 템플릿 관리",
      },
      {
        path: "/header-aliases",
        name: "헤더 Alias 관리",
      },
    ],
    autoOpenPaths: ["/upload/templates", "/header-aliases"],
  },
  {
    id: "files",
    icon: IoDocumentText,
    title: "파일 관리",
    items: [
      {
        path: "/files",
        name: "파일 업로드/다운로드",
      },
    ],
    autoOpenPaths: ["/files"],
  },

  {
    id: "admin",
    icon: IoShieldCheckmark,
    title: "관리자",
    items: [
      {
        path: "/products/upload",
        name: "상품 데이터 업로드",
      },
      {
        path: "/users",
        name: "회원 관리",
      },
      {
        path: "/vendors",
        name: "납품업체 관리",
      },
      {
        path: "/logs",
        name: "로그",
      },
    ],
    autoOpenPaths: ["/products/upload", "/users", "/vendors", "/logs"],
    requiresAdmin: true,
  },
];

function AccordionMenu({
  config,
  pathname,
}: {
  config: AccordionMenuConfig;
  pathname: string;
}) {
  const {isMenuOpen, toggleMenu} = useSidebarStore();
  const isOpen = isMenuOpen(config.id);

  // 각 아이템의 활성 상태 확인
  const itemsWithActive = config.items.map((item) => ({
    ...item,
    isActive: pathname === item.path,
  }));

  return (
    <div className="w-full">
      <button
        onClick={() => toggleMenu(config.id)}
        className="w-full px-2 pr-8 py-2 rounded-lg transition-all duration-200 flex items-center gap-3 hover:bg-gray-700 hover:translate-x-1 active:scale-95 text-white"
      >
        <span className="text-xl">
          <config.icon />
        </span>
        <span>{config.title}</span>
        <span className="text-lg ml-auto">
          {isOpen ? <IoChevronUp /> : <IoChevronDown />}
        </span>
      </button>
      {isOpen && (
        <div className="ml-4 mt-1 flex flex-col gap-1">
          {itemsWithActive.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={`w-full px-6 py-2 rounded-lg transition-all duration-200 flex items-center gap-3
                text-[15px] ${
                  item.isActive
                    ? "text-[#888eab]"
                    : "hover:bg-gray-700 hover:translate-x-1 active:scale-95 text-[#ffffff]"
                }`}
            >
              <span>{item.name}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SideBar() {
  const pathname = usePathname();
  const {user} = useAuthStore();
  const {openMenu} = useSidebarStore();
  const [mounted, setMounted] = useState(false);

  // 클라이언트에서만 마운트됨을 표시 (Hydration 오류 방지)
  useEffect(() => {
    setMounted(true);
  }, []);

  // 현재 경로에 따라 아코디언 자동 열기 (클라이언트에서만 실행)
  useEffect(() => {
    if (!mounted) return;

    menuConfigs.forEach((config) => {
      if (
        config.autoOpenPaths?.some((path) => pathname === path) ||
        config.autoOpenPaths?.some((path) => pathname.startsWith(path))
      ) {
        openMenu(config.id);
      }
    });
  }, [pathname, openMenu, mounted]);

  const isAdmin = mounted && user?.grade === "관리자";

  // 관리자 메뉴 필터링
  const visibleMenus = menuConfigs.filter(
    (config) => !config.requiresAdmin || isAdmin
  );

  return (
    <div className="w-60 h-full bg-[#25323c] shrink-0">
      <div className="w-full h-full flex flex-col">
        <div className="w-full h-16 border-b border-gray-200">
          <div className="w-full h-full flex items-center justify-center">
            <Link href="/">
              <Image
                src="http://xn--hy1b07t6sj80h.com/img/logo.jpg"
                alt="logo"
                width={150}
                height={150}
              />
            </Link>
          </div>
        </div>

        <div className="w-full flex-1 flex mx-4 my-6">
          <div className="w-full flex flex-col items-start font-semibold text-[16px] gap-2">
            {visibleMenus.map((config) => (
              <AccordionMenu
                key={config.id}
                config={config}
                pathname={pathname}
              />
            ))}
          </div>
        </div>

        <div className="w-full text-center text-sm text-white py-2">
          beta 4.1.0
        </div>
      </div>
    </div>
  );
}
