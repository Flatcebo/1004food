"use client";

import {usePathname} from "next/navigation";
import {useState, useEffect} from "react";
import SideBar from "@/components/SideBar";
import Header from "@/components/Header";

export default function LayoutWrapper({children}: {children: React.ReactNode}) {
  const pathname = usePathname();
  const isViewPage = pathname?.startsWith("/upload/view");
  const isPreviewPage = pathname?.startsWith("/upload/preview");
  const isLoginPage = pathname === "/login";
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      // 모바일에서는 기본적으로 사이드바 닫힘
      if (window.innerWidth < 768) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  if (isViewPage || isPreviewPage || isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="w-full h-screen flex overflow-hidden">
      {/* PC: 사이드바 */}
      {!isMobile && (
        <div
          className={`transition-all duration-300 ${
            isSidebarOpen ? "w-60" : "w-0"
          } overflow-hidden`}
        >
          <SideBar />
        </div>
      )}

      {/* Mobile: 사이드바 모달 */}
      {isMobile && isSidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setIsSidebarOpen(false)}
          />
          <div className="fixed left-0 top-0 h-full w-56 z-50">
            <SideBar />
          </div>
        </>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onToggleSidebar={toggleSidebar} isSidebarOpen={isSidebarOpen} />
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
