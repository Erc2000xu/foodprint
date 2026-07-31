import { GoodAtIcon, goodAtOptions } from "@/components/recommendation/good-at-icon";

export function OpinionCounts({ counts }: { counts: Record<string, number> }) {
  const visible = goodAtOptions.flatMap((value) => {
    const slug = value.slug;
    const count = Number(counts[slug] ?? 0);
    return count > 0 ? [{ count, ...value }] : [];
  });
  if (!visible.length) return null;

  return <div className="opinion-counts" aria-label="朋友觉得好在哪儿">
    {visible.map((item) => <span className={`opinion-count opinion-count--${item.slug}`} key={item.slug}>
      <GoodAtIcon slug={item.slug} size={30} /><b>{item.label}</b><strong>{item.count}</strong>
    </span>)}
  </div>;
}
