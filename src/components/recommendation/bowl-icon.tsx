/* eslint-disable @next/next/no-img-element */

export type BowlLevel = 1 | 2 | 3;

export const bowlLabels: Record<BowlLevel, string> = {
  1: "值得去",
  2: "想再去",
  3: "会专门去",
};

const bowlSources: Record<BowlLevel, string> = {
  1: "/icons/recommendation/bowl-level-1-ui.png",
  2: "/icons/recommendation/bowl-level-2-ui.png",
  3: "/icons/recommendation/bowl-level-3-ui.png",
};

export function toBowlLevel(value: number | null | undefined): BowlLevel {
  if (Number(value) >= 3) return 3;
  if (Number(value) >= 2) return 2;
  return 1;
}

export function bowlIconSource(value: number | null | undefined) {
  return bowlSources[toBowlLevel(value)];
}

export function BowlIcon({
  level,
  size = "md",
}: {
  level: BowlLevel;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  return <img
    aria-hidden="true"
    alt=""
    className={`bowl-icon bowl-icon--${size}`}
    decoding="async"
    height={256}
    src={bowlSources[level]}
    width={256}
  />;
}
