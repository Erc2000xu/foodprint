export type PriceSummary = {
  avgPricePerPerson: number | null;
  priceSampleCount: number;
};

export type OptionalPriceParseResult =
  | { valid: true; value: number | null }
  | { valid: false; value: null };

export const PRICE_PER_PERSON_MIN = 1;
export const PRICE_PER_PERSON_MAX = 99_999;

function validPriceNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed)
    && parsed >= PRICE_PER_PERSON_MIN
    && parsed <= PRICE_PER_PERSON_MAX
    && Math.round(parsed * 100) / 100 === parsed
    ? parsed
    : null;
}

/**
 * Parse the user-facing optional price field without accepting exponential
 * notation, hidden precision, infinity, or a value outside the DB contract.
 * The return value is a number only after the decimal scale has been checked.
 */
export function parseOptionalPrice(value: unknown): OptionalPriceParseResult {
  if (value === null || value === undefined || value === "") return { valid: true, value: null };
  if (typeof value !== "string" && typeof value !== "number") return { valid: false, value: null };
  const text = String(value).trim();
  if (!text || !/^\d+(?:\.\d{1,2})?$/.test(text)) return { valid: false, value: null };

  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return { valid: false, value: null };
  const valueInYuan = cents / 100;
  if (valueInYuan < PRICE_PER_PERSON_MIN || valueInYuan > PRICE_PER_PERSON_MAX) return { valid: false, value: null };
  return { valid: true, value: valueInYuan };
}

/** Numeric values from Postgres are strings at the Supabase boundary. */
export function priceSummaryFromDatabase(avgValue: unknown, countValue: unknown): PriceSummary {
  const average = validPriceNumber(avgValue);
  const count = countValue === null || countValue === undefined || countValue === "" ? 0 : Number(countValue);
  if (average === null || !Number.isFinite(count) || count < 1) {
    return { avgPricePerPerson: null, priceSampleCount: 0 };
  }
  return {
    avgPricePerPerson: Math.round(average * 100) / 100,
    priceSampleCount: Math.max(0, Math.floor(count)),
  };
}

/** The aggregate contract excludes blank, deleted/hidden, or invalid rows before averaging. */
export function averageValidVisitPrices(values: readonly unknown[]): PriceSummary {
  const valid = values.flatMap((value) => {
    const parsed = validPriceNumber(value);
    return parsed === null ? [] : [parsed];
  });
  if (!valid.length) return { avgPricePerPerson: null, priceSampleCount: 0 };
  const average = valid.reduce((sum, value) => sum + value, 0) / valid.length;
  return { avgPricePerPerson: Math.round(average * 100) / 100, priceSampleCount: valid.length };
}

export function priceSummaryForPlace(place: { priceSummary?: PriceSummary; pricePerPerson?: number | null }): PriceSummary {
  if (place.priceSummary) return place.priceSummary;
  const legacy = priceSummaryFromDatabase(place.pricePerPerson ?? null, place.pricePerPerson === null || place.pricePerPerson === undefined ? 0 : 1);
  return legacy;
}

/** The list/map contract intentionally rounds averages to whole yuan. */
export function formatAveragePrice(value: number | null | undefined) {
  const normalized = validPriceNumber(value);
  return normalized === null ? null : String(Math.round(normalized));
}

/** A single visit keeps up to two decimals and trims trailing zeroes. */
export function formatVisitPrice(value: number | null | undefined) {
  const normalized = validPriceNumber(value);
  if (normalized === null) return null;
  const cents = Math.round(normalized * 100);
  const whole = Math.floor(cents / 100);
  const fraction = cents % 100;
  if (fraction === 0) return String(whole);
  return `${whole}.${String(fraction).padStart(2, "0").replace(/0$/, "")}`;
}

export function priceSummaryLabel(summary: PriceSummary) {
  const average = formatAveragePrice(summary.avgPricePerPerson);
  return average === null || summary.priceSampleCount < 1 ? "人均待补充" : `人均约 ¥${average}`;
}

export function visitPriceLabel(value: number | null | undefined) {
  const formatted = formatVisitPrice(value);
  return formatted === null ? null : `本次人均 ¥${formatted}`;
}
