const opinionTags = {
  tasty: { label: "吃得香", short: "香" },
  comfortable: { label: "坐得住", short: "坐" },
  good_for_chat: { label: "聊得开", short: "聊" },
  good_value: { label: "花得值", short: "值" },
} as const;

export function OpinionCounts({ counts }: { counts: Record<string, number> }) {
  const visible = Object.entries(opinionTags).flatMap(([slug, value]) => {
    const count = Number(counts[slug] ?? 0);
    return count > 0 ? [{ slug, count, ...value }] : [];
  });
  if (!visible.length) return null;

  return <div className="opinion-counts" aria-label="朋友觉得好在哪儿">
    {visible.map((item) => <span className={`opinion-count opinion-count--${item.slug}`} key={item.slug}>
      <i aria-hidden="true">{item.short}</i><b>{item.label}</b><strong>{item.count}</strong>
    </span>)}
  </div>;
}
