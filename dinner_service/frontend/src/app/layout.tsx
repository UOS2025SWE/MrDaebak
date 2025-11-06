import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ToastProvider } from "@/contexts/ToastContext";
import ToastContainer from "@/components/ToastContainer";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "미스터 대박 프리미엄 디너 서비스",
  description: "최고급 재료로 만든 특별한 디너를 집에서 편안하게 즐기세요. 음성 주문 & AI 추천 서비스",
  icons: {
    icon: [
      { url: '/icon.jpg', sizes: '32x32', type: 'image/jpeg' },
      { url: '/icon.jpg', sizes: '16x16', type: 'image/jpeg' },
    ],
    shortcut: '/icon.jpg',
    apple: '/icon.jpg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${inter.variable} antialiased`}>
        <AuthProvider>
          <ToastProvider>
            {children}
            <ToastContainer />
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
