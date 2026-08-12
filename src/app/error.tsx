"use client";

import Link from "next/link";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="route-error" role="alert"><section><p className="eyebrow">食迹</p><h1>页面暂时没有打开</h1><p>网络有点慢或服务正在恢复。已有内容不会因此改变。</p><div><button className="primary-button" type="button" onClick={() => reset()}>重试</button><Link className="secondary-button" href="/">回到发现</Link></div></section></main>;
}
