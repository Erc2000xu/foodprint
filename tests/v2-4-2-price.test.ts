import { describe, expect, it } from "vitest";
import { averageValidVisitPrices, formatAveragePrice, formatVisitPrice, parseOptionalPrice, priceSummaryFromDatabase } from "@/lib/price";

describe("V2.4.2 optional visit price contract", () => {
  it("accepts blank or at most two decimals and rejects invalid amounts", () => {
    expect(parseOptionalPrice("")).toEqual({ valid: true, value: null });
    expect(parseOptionalPrice("80.50")).toEqual({ valid: true, value: 80.5 });
    expect(parseOptionalPrice("1")).toEqual({ valid: true, value: 1 });
    expect(parseOptionalPrice("0").valid).toBe(false);
    expect(parseOptionalPrice("100000").valid).toBe(false);
    expect(parseOptionalPrice("80.123").valid).toBe(false);
    expect(parseOptionalPrice("1e2").valid).toBe(false);
  });

  it("computes an arithmetic average from valid visit rows only", () => {
    expect(averageValidVisitPrices(["10", "20.50", null, "0", "bad", "100000"])).toEqual({ avgPricePerPerson: 15.25, priceSampleCount: 2 });
    expect(priceSummaryFromDatabase("15.25", "2")).toEqual({ avgPricePerPerson: 15.25, priceSampleCount: 2 });
    expect(priceSummaryFromDatabase(null, "0")).toEqual({ avgPricePerPerson: null, priceSampleCount: 0 });
  });

  it("uses whole yuan in list summaries while preserving visit precision", () => {
    expect(formatAveragePrice(80.5)).toBe("81");
    expect(formatVisitPrice(80.5)).toBe("80.5");
    expect(formatVisitPrice(80.05)).toBe("80.05");
  });
});
