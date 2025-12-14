"use client";

import Image from "next/image";
import Link from "next/link";
import {usePathname} from "next/navigation";

const menuNames: {path: string; name: string}[] = [
  // {
  //   path: "/",
  //   name: "홈",
  // },
  {
    path: "/upload",
    name: "발주서 업로드",
  },
  {
    path: "/order",
    name: "주문 리스트",
  },
  {
    path: "/products",
    name: "상품 관리",
  },
  {
    path: "/upload/templates",
    name: "양식 템플릿 관리",
  },
];

export default function SideBar() {
  const pathname = usePathname();

  const isUploadActive =
    pathname === "/upload" ||
    pathname?.startsWith("/upload/view") ||
    pathname?.startsWith("/upload/preview");
  const isOrderActive = pathname === "/order";
  const isProductsActive = pathname === "/products";
  const isTemplatesActive = pathname === "/upload/templates";

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
            {menuNames.map((menu, key) => (
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
            ))}
            {/* <Link
              href="/upload"
              className={`w-full px-4 py-2 rounded-lg transition-all duration-200 ${
                isUploadActive
                  ? "text-[#888eab]"
                  : "hover:bg-gray-700 hover:translate-x-1 active:scale-95 text-white"
              }`}
            >
              <span>발주서 업로드</span>
            </Link>

            <Link
              href="/upload/templates"
              className={`w-full px-4 py-2 rounded-lg transition-all duration-200 ${
                isTemplatesActive
                  ? "text-[#888eab]"
                  : "hover:bg-gray-700 hover:translate-x-1 active:scale-95 text-white"
              }`}
            >
              <span>양식 템플릿 관리</span>
            </Link>

            <Link
              href="/products"
              className={`w-full px-4 py-2 rounded-lg transition-all duration-200 ${
                isProductsActive
                  ? "text-[#888eab]"
                  : "hover:bg-gray-700 hover:translate-x-1 active:scale-95 text-white"
              }`}
            >
              <span>상품 관리</span>
            </Link> */}
          </div>
        </div>

        <div className="w-full text-center text-sm text-white py-2">
          beta0.0.2
        </div>
      </div>
    </div>
  );
}
