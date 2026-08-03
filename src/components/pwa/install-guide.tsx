"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const subscribe = (callback: () => void) => { window.addEventListener("appinstalled", callback); return () => window.removeEventListener("appinstalled", callback); };
const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const getIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const getWechat = () => /MicroMessenger/i.test(navigator.userAgent);
const noSubscribe = () => () => undefined;

export function InstallGuide() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const installed = useSyncExternalStore(subscribe, isInstalled, () => false);
  const isIos = useSyncExternalStore(noSubscribe, getIos, () => false);
  const isWechat = useSyncExternalStore(noSubscribe, getWechat, () => false);
  useEffect(() => { const handler = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPromptEvent); }; window.addEventListener("beforeinstallprompt", handler); return () => window.removeEventListener("beforeinstallprompt", handler); }, []);
  if (installed) return <section className="install-guide"><strong>食迹已安装</strong><p>现在可以从主屏幕直接打开。</p></section>;
  if (isWechat) return <section className="install-guide"><strong>请在浏览器中打开</strong><p>微信里无法安装，请点右上角菜单后选择“在浏览器打开”。</p></section>;
  if (isIos) return <section className="install-guide"><strong>添加到 iPhone 主屏幕</strong><p>在 Safari 中点击底部“分享”，再选择“添加到主屏幕”。</p></section>;
  if (prompt) return <section className="install-guide"><strong>安装食迹 App</strong><p>安装后会以独立窗口打开，使用起来更像手机 App。</p><button className="text-button" type="button" onClick={() => void prompt.prompt().then(() => prompt.userChoice).then(() => setPrompt(null))}>安装到设备</button></section>;
  return <section className="install-guide"><strong>安装食迹 App</strong><p>可在浏览器菜单中选择“安装应用”或“添加到主屏幕”。</p></section>;
}
