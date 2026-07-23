import Link from "next/link";
import Image from "next/image";

export default function OfflinePage() {
  return <main className="offline-page"><section><Image className="offline-dog" src="/mascot/offline.jpg" width={190} height={190} alt="食迹腊肠狗在等待网络恢复" priority /><p className="eyebrow">食迹 Foodprint</p><h1>现在没有网络</h1><p>你仍可以回到应用壳；地图、搜索和云端内容需要网络恢复后才能加载。</p><Link className="primary-link" href="/">重新连接后回到地图</Link></section></main>;
}
