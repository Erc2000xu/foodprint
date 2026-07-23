import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "食迹 Foodprint", short_name: "食迹", description: "由朋友共同维护的真实餐饮体验地图", start_url: "/", display: "standalone",
    background_color: "#f7f3e9", theme_color: "#167d76", lang: "zh-CN",
    icons: [
      { src: "/mascot/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/mascot/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/mascot/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
