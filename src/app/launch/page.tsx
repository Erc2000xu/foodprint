/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { LaunchGate } from "@/components/pwa/launch-gate";

export default function LaunchPage() {
  return <main className="launch-page"><section className="launch-page__card"><div className="launch-page__brand"><img src="/mascot/icon-192.png" alt="" width="72" height="72" /><div><p className="eyebrow">食迹</p><h1>一起吃过的，留在地图上。</h1></div></div><LaunchGate /><noscript><Link href="/">进入食迹</Link></noscript></section></main>;
}
