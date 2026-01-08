"use client";

import Image from "next/image";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useAuthStore} from "@/stores/authStore";
import {useState, useEffect} from "react";

const menuNames: {path: string; name: string}[] = [
  {
    path: "/order",
    name: "주문 리스트",
  },
  // {
  //   path: "/order/upload",
  //   name: "발주서 업로드",
  // },
  {
    path: "/products",
    name: "상품 리스트",
  },
  {
    path: "/upload/templates",
    name: "양식 템플릿 관리",
  },

  {
    path: "/header-aliases",
    name: "헤더 Alias 관리",
  },
];

const adminMenuNames: {path: string; name: string}[] = [
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
];

export default function SideBar() {
  const pathname = usePathname();
  const {user} = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isAdmin = mounted && user?.grade === "관리자";

  const isUploadActive =
    pathname === "/upload" ||
    pathname?.startsWith("/upload/view") ||
    pathname?.startsWith("/upload/preview");
  const isOrderActive = pathname === "/order";
  const isOrderUploadActive = pathname === "/order/upload";
  const isProductsActive = pathname === "/products";
  const isProductUploadActive = pathname === "/products/upload";
  const isTemplatesActive = pathname === "/upload/templates";
  const isHeaderAliasesActive = pathname === "/header-aliases";
  const isUsersActive = pathname === "/users";
  const isVendorsActive = pathname === "/vendors";

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
            {menuNames.map((menu, key) => {
              const isActive =
                menu.path === "/"
                  ? pathname === "/"
                  : menu.path === "/products/upload"
                  ? isProductUploadActive
                  : menu.path === "/order"
                  ? isOrderActive
                  : menu.path === "/order/upload"
                  ? isOrderUploadActive
                  : menu.path === "/products"
                  ? isProductsActive
                  : menu.path === "/upload/templates"
                  ? isTemplatesActive
                  : menu.path === "/header-aliases"
                  ? isHeaderAliasesActive
                  : false;

              return (
                <Link
                  key={key}
                  href={menu.path}
                  className={`w-full px-4 py-2 rounded-lg transition-all duration-200 ${
                    isActive
                      ? "text-[#888eab]"
                      : "hover:bg-gray-700 hover:translate-x-1 active:scale-95 text-white"
                  }`}
                >
                  <span>{menu.name}</span>
                </Link>
              );
            })}
            {isAdmin &&
              adminMenuNames.map((menu, key) => {
                return (
                  <Link
                    key={key}
                    href={menu.path}
                    className={`w-full px-4 py-2 rounded-lg transition-all duration-200 ${
                      pathname === menu.path
                        ? "text-[#888eab]"
                        : "hover:bg-gray-700 hover:translate-x-1 active:scale-95 text-white"
                    }`}
                  >
                    <span>{menu.name}</span>
                  </Link>
                );
              })}
          </div>
        </div>

        <div className="w-full text-center text-sm text-white py-2">
          beta 2.1.0
        </div>
      </div>
    </div>
  );
}
