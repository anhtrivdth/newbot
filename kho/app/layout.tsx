import type { Metadata } from "next";
import { Be_Vietnam_Pro, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const sans = Be_Vietnam_Pro({ variable: "--font-sans", subsets: ["vietnamese"], weight: ["400", "500", "600", "700"] });
const mono = IBM_Plex_Mono({ variable: "--font-mono", subsets: ["vietnamese"], weight: ["500", "600"] });

export const metadata: Metadata = {
  title: "botnf Kho — Quản lý kho key",
  description: "Trung tâm quản lý kho key và đơn hàng Telegram tự động.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body className={`${sans.variable} ${mono.variable}`}>{children}</body></html>;
}
