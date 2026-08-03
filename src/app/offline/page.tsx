import Link from "next/link";
import Image from "next/image";

export default function OfflinePage() {
  return <main className="offline-page"><section><Image className="offline-dog" src="/mascot/offline.jpg" width={190} height={190} alt="食迹腊肠狗在等待网络恢复" priority /><p className="eyebrow">食迹</p><h1>网络暂时中断</h1><p>网络恢复后，发现、搜索和地图都会继续可用。</p><Link className="primary-link" href="/">网络恢复后回到发现</Link></section></main>;
}
