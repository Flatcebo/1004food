"use client";

import {usePathname} from "next/navigation";
import SideBar from "@/components/SideBar";

export default function LayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isViewPage = pathname?.startsWith("/upload/view");
  const isPreviewPage = pathname?.startsWith("/upload/preview");

  if (isViewPage || isPreviewPage) {
    return <>{children}</>;
  }

  return (
    <div className="w-full h-full flex ">
      <SideBar />
      <div className="w-full h-screen flex-1">{children}</div>
    </div>
  );
}

