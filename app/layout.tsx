import type {Metadata} from "next";
import {Geist, Geist_Mono} from "next/font/google";
import {headers} from "next/headers";
import "./globals.css";
import LayoutWrapper from "@/components/LayoutWrapper";
import AuthGuard from "@/components/AuthGuard";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "천사넷",
  description: "천사넷 관리자 도구",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const isEmbed = headersList.get("x-embed-mode") === "1";

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* 탭 iframe 내부 모달이 부모 창 전체 화면에 표시되도록 */}
        <div id="modal-root" />
        <AuthGuard>
          <LayoutWrapper isEmbedFromServer={isEmbed}>{children}</LayoutWrapper>
        </AuthGuard>
      </body>
    </html>
  );
}
