import Link from "next/link";

export type PersonalPlace = { groupPlaceId: string; name: string; address: string; rating?: number };

export function PersonalPlaceLists({ marks, wishlist }: { marks: PersonalPlace[]; wishlist: PersonalPlace[] }) {
  return <section className="personal-lists" aria-label="我的地点记录">
    <div className="personal-list-card"><div><p className="eyebrow">我的记录</p><h2>真实标记</h2><b>{marks.length}</b><span>处已记录体验</span></div>{marks.length ? <ul>{marks.slice(0, 3).map((place) => <li key={place.groupPlaceId}><Link href={`/place/${place.groupPlaceId}`}><strong>{place.name}</strong><small>{place.rating?.toFixed(1)} 分 · {place.address || "地址待补充"}</small></Link></li>)}</ul> : <p>还没有真实标记。</p>}<Link className="text-button" href="/mark">添加真实体验</Link></div>
    <div className="personal-list-card"><div><p className="eyebrow">个人收藏</p><h2>想去</h2><b>{wishlist.length}</b><span>处待体验地点</span></div>{wishlist.length ? <ul>{wishlist.slice(0, 3).map((place) => <li key={place.groupPlaceId}><Link href={`/place/${place.groupPlaceId}`}><strong>{place.name}</strong><small>{place.address || "地址待补充"}</small></Link></li>)}</ul> : <p>在“发现”页收藏朋友推荐的地点。</p>}<Link className="text-button" href="/discover">去发现地点</Link></div>
  </section>;
}
