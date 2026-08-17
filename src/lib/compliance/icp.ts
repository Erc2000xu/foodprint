export const FOODPRINT_ICP_RECORD = "京ICP备2026047829号-1" as const;
export const MIIT_FILING_URL = "https://beian.miit.gov.cn/" as const;

/**
 * The filing number is public compliance data, not an optional visual flag.
 * A deployment override is accepted only when it exactly matches the
 * confirmed public record, so a stale value cannot be published.
 */
export function resolveIcpRecord(env: Record<string, string | undefined> = process.env) {
  const configured = env.NEXT_PUBLIC_ICP_RECORD?.trim();
  if (configured && configured !== FOODPRINT_ICP_RECORD) {
    throw new Error("NEXT_PUBLIC_ICP_RECORD must match the confirmed Foodprint filing number");
  }
  return FOODPRINT_ICP_RECORD;
}

export function isValidIcpRecord(value: string | undefined | null) {
  return value?.trim() === FOODPRINT_ICP_RECORD;
}
