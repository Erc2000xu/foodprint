/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { MapPlace } from "@/components/map/amap-map";
import { OpinionCounts } from "@/components/discover/opinion-counts";
import { WishlistToggle } from "@/components/discover/wishlist-toggle";
import { BowlIcon, toBowlLevel } from "@/components/recommendation/bowl-icon";
import { displayAmapLocationChain } from "@/lib/amap/location-display";
import { sceneTagLabels } from "@/lib/mark-options";

const bowlLabels = ["", "值得去", "想再去", "会专门去"];

export function DiscoveryPlaceCard({
  place,
  href,
  cuisineLabel,
  categoryLabel,
  nearbyLabel,
}: {
  place: MapPlace;
  href: string;
  cuisineLabel?: string;
  categoryLabel: string;
  nearbyLabel?: string;
}) {
  const dishes = place.recommendedItems ?? [];
  const shownDishes = dishes.slice(0, 2);
  const remainingDishCount = Math.max(0, dishes.length - shownDishes.length);
  const location = displayAmapLocationChain(place.city, place.district, place.businessAreaName);
  const hasOpinionCounts = Object.values(place.goodTagCounts ?? {}).some((count) => count > 0);

  return <article className="home-place-card-wrap">
    <div className="home-place-card">
      <div className="home-place-card__media">
        <Link href={href} className="home-place-card__photo-link" aria-label={`查看 ${place.name}`}>
          <div className="home-place-card__photo">
            {place.coverPhotoUrl ? <img src={place.coverPhotoUrl} alt={`${place.name} 的真实照片`} /> : <span>食迹<br />推荐</span>}
          </div>
        </Link>
        <WishlistToggle groupPlaceId={place.id} initialWanted={Boolean(place.savedForLater)} />
      </div>
      <Link href={href} className="home-place-card__body">
        <p className="home-place-card__meta">{[cuisineLabel || categoryLabel, location].filter(Boolean).join(" · ")}</p>
        <h2>{place.name}</h2>
        <p className="home-place-card__location">{nearbyLabel ? `近 ${nearbyLabel} · ` : ""}{place.pricePerPerson !== null && place.pricePerPerson !== undefined ? `人均 ¥${Math.round(place.pricePerPerson)}` : "人均待补充"}</p>
        {place.bowlStrength ? <div className="home-place-card__score-line">
          <BowlIcon level={toBowlLevel(place.bowlStrength)} size="md" />
          <span><b>{bowlLabels[toBowlLevel(place.bowlStrength)]}</b> · {place.markCount} 位朋友吃过</span>
        </div> : place.markCount ? <div className="home-place-card__score-line"><b>{place.averageRating.toFixed(1)}</b><span>{place.markCount} 位朋友标记</span></div> : <div className="home-place-card__score-line"><b>新推荐</b><span>已由成员真实验证</span></div>}
        {hasOpinionCounts ? <OpinionCounts counts={place.goodTagCounts ?? {}} /> : place.sceneTags.length > 0 ? <p className="home-place-card__scenes">适合：{place.sceneTags.map((slug) => sceneTagLabels[slug] ?? slug).join(" · ")}</p> : null}
        {shownDishes.length > 0 ? <div className="home-place-card__recommend"><b>推荐菜</b><span>{shownDishes.join("、")}{remainingDishCount > 0 ? `，等 ${remainingDishCount} 道` : ""}</span></div> : place.review ? <p className="home-place-card__review">{place.review}</p> : null}
      </Link>
    </div>
  </article>;
}
