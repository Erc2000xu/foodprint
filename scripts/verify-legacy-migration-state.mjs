import { existsSync, readFileSync } from "node:fs";

const schemaPath = process.argv[2];

if (!schemaPath) {
  console.error("Usage: node scripts/verify-legacy-migration-state.mjs <schema-dump.sql>");
  process.exit(1);
}

if (!existsSync(schemaPath)) {
  console.error(`Schema dump not found: ${schemaPath}`);
  process.exit(1);
}

const schema = readFileSync(schemaPath, "utf8").replaceAll("\r\n", "\n");
// pg_dump may quote every PostgreSQL identifier. Quotes are semantically
// irrelevant for the known lower-case public schema objects, so normalize them
// before checking to support both `public.table_name` and
// `"public"."table_name"` output formats.
const matchableSchema = schema.replaceAll('"', "");
const failures = new Set();
let verified = 0;

function check(label, pattern) {
  if (pattern.test(matchableSchema)) {
    verified += 1;
    return;
  }

  failures.add(label);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tableDefinition(tableName) {
  const declaration = new RegExp(
    `CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+public\\.${escapeRegExp(tableName)}\\s*\\(`,
    "i",
  ).exec(matchableSchema);

  if (!declaration || declaration.index === undefined) {
    failures.add(`table public.${tableName}`);
    return "";
  }

  const start = declaration.index;
  const end = matchableSchema.indexOf("\n);", start);
  if (end === -1) {
    failures.add(`complete definition for public.${tableName}`);
    return "";
  }

  return matchableSchema.slice(start, end);
}

function checkTableColumn(tableName, columnName, typePattern) {
  const definition = tableDefinition(tableName);
  if (definition && new RegExp(`\\b${escapeRegExp(columnName)}\\s+${typePattern}`, "m").test(definition)) {
    verified += 1;
    return;
  }

  failures.add(`column public.${tableName}.${columnName}`);
}

function checkFunction(functionName) {
  check(
    `function public.${functionName}`,
    new RegExp(`CREATE(?:\\s+OR\\s+REPLACE)?\\s+FUNCTION\\s+public\\.${escapeRegExp(functionName)}\\s*\\(`, "i"),
  );
}

// 20260731100000_v1_3_3_place_content_management.sql
checkTableColumn("group_places", "archived_by", "uuid");
checkTableColumn("group_places", "archived_reason", "text");
checkTableColumn("place_candidates", "resolution_type", "text");
checkTableColumn("place_candidates", "resolution_reason", "text");

for (const constraint of [
  "group_places_archived_reason_length",
  "group_places_archive_metadata_consistent",
  "place_candidates_resolution_type_valid",
  "place_candidates_resolution_reason_length",
  "place_candidates_resolution_consistent",
]) {
  check(`constraint ${constraint}`, new RegExp(`\\b${escapeRegExp(constraint)}\\b`));
}

for (const index of [
  "group_places_management_status_idx",
  "place_candidates_management_status_idx",
  "visit_records_hidden_management_idx",
  "photos_hidden_management_idx",
]) {
  check(`index ${index}`, new RegExp(`CREATE\\s+(?:UNIQUE\\s+)?INDEX(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+${escapeRegExp(index)}\\b`, "i"));
}

for (const functionName of [
  "archive_group_place",
  "restore_group_place",
  "remove_place_candidate",
  "delete_place_candidate",
  "restore_place_candidate",
  "resolve_place_candidate",
  "delete_my_visit_record",
  "restore_group_visit_record",
  "restore_group_photo",
  "list_group_place_management",
  "list_hidden_group_content",
  "list_managed_place_candidates",
  "list_group_visit_feed",
]) {
  checkFunction(functionName);
}

// 20260731110000_v1_3_3_four_good_at_tags.sql
for (const constraint of ["current_opinions_tags_max_four", "visit_records_tags_max_four"]) {
  check(`constraint ${constraint}`, new RegExp(`\\b${escapeRegExp(constraint)}\\b`));
}

const visitFunctionDeclaration = /CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+public\.record_place_visit\s*\(/i.exec(matchableSchema);
const visitFunctionStart = visitFunctionDeclaration?.index ?? -1;
const visitFunctionEnd = visitFunctionStart === -1
  ? -1
  : matchableSchema.indexOf("\nALTER FUNCTION public.record_place_visit", visitFunctionStart);
const visitFunction = visitFunctionStart === -1 || visitFunctionEnd === -1
  ? ""
  : matchableSchema.slice(visitFunctionStart, visitFunctionEnd);

if (!visitFunction) {
  failures.add("complete definition for function public.record_place_visit");
} else {
  for (const [label, pattern] of [
    ["record_place_visit supports one to four tags", /cardinality\(v_tags\)\s+not\s+between\s+1\s+and\s+4/],
    ["record_place_visit allows tasty tag", /'tasty'/],
    ["record_place_visit allows comfortable tag", /'comfortable'/],
    ["record_place_visit allows good_for_chat tag", /'good_for_chat'/],
    ["record_place_visit allows good_value tag", /'good_value'/],
  ]) {
    if (pattern.test(visitFunction)) {
      verified += 1;
    } else {
      failures.add(label);
    }
  }
}

// 20260801100000_v1_3_3_normalize_group_place_archive_metadata.sql
checkFunction("normalize_group_place_archive_metadata");
// The workflow verifies this trigger through pg_catalog rather than relying on
// a pg_dump rendering. See scripts/verify-legacy-trigger-state.mjs.

if (failures.size > 0) {
  console.error("Legacy migration state is not safe to repair. Missing or incomplete checks:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Verified ${verified} legacy migration schema requirements against the production schema dump.`);
console.log("No production data or migration history was changed.");
