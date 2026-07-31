import Image from "next/image";

export const goodAtOptions = [
  { slug: "tasty", label: "吃得香", description: "味道和出品让人满意" },
  { slug: "comfortable", label: "坐得住", description: "环境舒服，愿意多待一会" },
  { slug: "good_for_chat", label: "聊得开", description: "适合一起吃饭聊天" },
  { slug: "good_value", label: "花得值", description: "价格与体验相称" },
] as const;

export type GoodAtSlug = (typeof goodAtOptions)[number]["slug"];

const assetBySlug: Record<GoodAtSlug, string> = {
  tasty: "/icons/good-at/tasty-ui.png",
  comfortable: "/icons/good-at/comfortable-ui.png",
  good_for_chat: "/icons/good-at/good-for-chat-ui.png",
  good_value: "/icons/good-at/good-value-ui.png",
};

export function isGoodAtSlug(value: string): value is GoodAtSlug {
  return value in assetBySlug;
}

export function GoodAtIcon({ slug, size = 32 }: { slug: GoodAtSlug; size?: number }) {
  return <Image aria-hidden="true" alt="" className="good-at-icon" src={assetBySlug[slug]} width={size} height={size} sizes={`${size}px`} />;
}
