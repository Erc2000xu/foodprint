import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  inspectLegacyTrigger,
  legacyTriggerCatalogQuery,
  runProductionSql,
} from "./legacy-trigger-state.mjs";

const reconciliationSqlPath = fileURLToPath(
  new URL("../supabase/reconciliation/2026-08-03_group_places_normalize_archive_trigger.sql", import.meta.url),
);
const reconciliationSql = readFileSync(reconciliationSqlPath, "utf8");

if (!reconciliationSql.includes("create trigger group_places_normalize_archive_metadata")) {
  console.error("The committed reconciliation SQL does not contain the expected trigger definition.");
  process.exit(1);
}

try {
  const before = inspectLegacyTrigger(
    await runProductionSql(legacyTriggerCatalogQuery, { readOnly: true }),
  );

  if (before.isCorrect) {
    console.log("The legacy trigger is already correct; no production schema change was made.");
    process.exit(0);
  }

  await runProductionSql(reconciliationSql, { readOnly: false });

  const after = inspectLegacyTrigger(
    await runProductionSql(legacyTriggerCatalogQuery, { readOnly: true }),
  );
  if (!after.isCorrect) {
    console.error("The trigger reconciliation did not produce the required production definition.");
    process.exit(1);
  }

  console.log("Reconciled the legacy group_places archive trigger and verified its production definition.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Unable to reconcile the legacy trigger.");
  process.exit(1);
}
