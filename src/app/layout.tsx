import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { ThemeProvider } from "next-themes";
import { JmToaster, JmTooltipProvider } from "@/jm";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const pretendard = localFont({
  src: "../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "JAEWOOMADE ERP",
  description: "소규모 사업자를 위한 통합 JAEWOOMADE ERP",
};

// viewport-fit=cover: iOS notch/hole-punch 영역을 화면에 포함 → safe-area-inset-* 가 의미 있음
// width=device-width, initial-scale=1: 표준
// maximumScale=1, userScalable=false: POS 환경에서 의도치 않은 핀치줌 방지 (모바일/태블릿)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${pretendard.variable}`}>
      <body className="min-h-screen antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Providers>
            <JmTooltipProvider>
              {children}
              <JmToaster position="top-right" />
            </JmTooltipProvider>
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
