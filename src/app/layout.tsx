import type { Metadata, Viewport } from "next";
import { SiteComplianceFooter } from "@/components/compliance/site-compliance-footer";
import { PwaRegister } from "@/components/pwa/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "食迹",
  description: "由朋友共同维护的真实餐饮体验地图",
  applicationName: "食迹",
  appleWebApp: { capable: true, title: "食迹", statusBarStyle: "default" },
  icons: { apple: [{ url: "/mascot/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f3e9",
};

const deploymentVersion = process.env.DEPLOYMENT_VERSION ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <SiteComplianceFooter />
        <PwaRegister buildId={deploymentVersion} />
      </body>
    </html>
  );
}
