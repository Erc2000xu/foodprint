import Link from "next/link";

export type PersonalPlace = { groupPlaceId: string; name: string; address: string };

export function PersonalPlaceLists({ marks, wishlist }: { marks: PersonalPlace[]; wishlist: PersonalPlace[] }) {
  return <section className="personal-lists" aria-label="我的地点记录">
    <div className="personal-list-card"><div><p className="eyebrow">我的记录</p><h2>我去过</h2><b>{marks.length}</b><span>已记录 {marks.length} 家</span></div>{marks.length ? <ul>{marks.slice(0, 3).map((place) => <li key={place.groupPlaceId}><Link href={`/place/${place.groupPlaceId}`}><strong>{place.name}</strong><small>{place.address || "地址待补充"}</small></Link></li>)}</ul> : <p>还没有记下过一顿饭。</p>}<Link className="text-button" href="/mark">记下第一顿</Link></div>
    <div className="personal-list-card"><div><p className="eyebrow">下回吃</p><h2>下回吃</h2><b>{wishlist.length}</b><span>已保存 {wishlist.length} 家</span></div>{wishlist.length ? <ul>{wishlist.slice(0, 3).map((place) => <li key={place.groupPlaceId}><Link href={`/place/${place.groupPlaceId}`}><strong>{place.name}</strong><small>{place.address || "地址待补充"}</small></Link></li>)}</ul> : <p>在发现里保存下次想去的地方。</p>}<Link className="text-button" href="/">去发现</Link></div>
  </section>;
}
