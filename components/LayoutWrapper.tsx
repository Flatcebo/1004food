"use client";

import {usePathname} from "next/navigation";
import {useState, useEffect} from "react";
import SideBar from "@/components/SideBar";
import Header from "@/components/Header";
import TabBar from "@/components/TabBar";
import {useTabStore} from "@/stores/tabStore";

interface LayoutWrapperProps {
  children: React.ReactNode;
  isEmbedFromServer?: boolean;
}

export default function LayoutWrapper({
  children,
  isEmbedFromServer = false,
}: LayoutWrapperProps) {
  const pathname = usePathname();
  const {tabs, activeTabId} = useTabStore();
  const isViewPage = pathname?.startsWith("/upload/view");
  const isPreviewPage = pathname?.startsWith("/upload/preview");
  const isLoginPage = pathname === "/login";
  const isRegisterPage = pathname === "/register";
  const isUserLogPage = pathname?.startsWith("/logs/users/");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState<boolean | null>(null); // null로 초기화하여 hydration mismatch 방지
  const [mounted, setMounted] = useState(false);
  // 서버에서 embed=1로 판단했거나, 클라이언트에서 iframe 내부인 경우
  const isEmbed =
    isEmbedFromServer ||
    (typeof window !== "undefined" && window.self !== window.top);

  useEffect(() => {
    setMounted(true);
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // 모바일에서는 기본적으로 사이드바 닫힘
      if (mobile) {
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

  // iframe 안에서 로드된 경우: 레이아웃 없이 콘텐츠만 표시 (탭 전환 시 상태 유지)
  // isEmbed면 mounted 여부와 상관없이 즉시 embed 콘텐츠만 렌더 (사이드바 노출 방지)
  if (isEmbed) {
    return <div className="w-full h-full overflow-auto">{children}</div>;
  }

  if (
    isViewPage ||
    isPreviewPage ||
    isLoginPage ||
    isRegisterPage ||
    isUserLogPage
  ) {
    return <>{children}</>;
  }

  // Hydration mismatch 방지: 마운트 전에는 기본 레이아웃 렌더링
  if (!mounted || isMobile === null) {
    return (
      <div className="w-full h-screen flex overflow-hidden">
        <div className="transition-all duration-300 w-60 overflow-hidden">
          <SideBar />
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header
            onToggleSidebar={toggleSidebar}
            isSidebarOpen={isSidebarOpen}
          />
          <div className="flex-1 overflow-auto">{children}</div>
        </div>
      </div>
    );
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
        <Header
          onToggleSidebar={toggleSidebar}
          isSidebarOpen={isSidebarOpen}
          activeTab={tabs.find((t) => t.id === activeTabId)}
        />
        {tabs.length > 0 ? (
          <>
            <TabBar />
            <div className="flex-1 relative overflow-hidden">
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`absolute inset-0 w-full h-full ${
                    activeTabId === tab.id ? "block" : "hidden"
                  }`}
                >
                  <iframe
                    src={`${tab.path}${tab.path.includes("?") ? "&" : "?"}embed=1`}
                    title={tab.name}
                    className="w-full h-full border-0"
                  />
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-auto">{children}</div>
        )}
      </div>
    </div>
  );
}
