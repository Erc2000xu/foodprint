import {
  inspectLegacyTrigger,
  legacyTriggerCatalogQuery,
  runProductionSql,
} from "./legacy-trigger-state.mjs";

try {
  const result = await runProductionSql(legacyTriggerCatalogQuery, { readOnly: true });
  const { isCorrect } = inspectLegacyTrigger(result);

  if (!isCorrect) {
    console.error("Required legacy trigger is missing or has an unexpected definition.");
    process.exit(1);
  }

  console.log("Verified the legacy group_places archive trigger directly from the production catalog.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Unable to verify the legacy trigger.");
  process.exit(1);
}
