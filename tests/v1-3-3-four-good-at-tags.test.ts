import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260731110000_v1_3_3_four_good_at_tags.sql"), "utf8");

describe("V1.3.3 four good-at tags follow-up migration", () => {
  it("raises both stored tag limits to four and keeps the valid tag allow-list", () => {
    expect(migration).toContain("current_opinions_tags_max_four");
    expect(migration).toContain("visit_records_tags_max_four");
    expect(migration).toContain("cardinality(v_tags) not between 1 and 4");
    expect(migration).toContain("array['tasty', 'comfortable', 'good_for_chat', 'good_value']::text[]");
  });
});
