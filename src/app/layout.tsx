import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "食迹 Foodprint",
  description: "由朋友共同维护的真实餐饮体验地图",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
