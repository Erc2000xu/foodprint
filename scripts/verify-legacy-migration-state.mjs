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

const rawSchema = readFileSync(schemaPath, "utf8").replaceAll("\r\n", "\n");

// `supabase db dump` uses pg_dump's quoted identifier format, for example:
// `CREATE TABLE IF NOT EXISTS "public"."group_places" (...)` and
// `CREATE OR REPLACE FUNCTION "public"."archive_group_place" (...)`.
// Normalize only dump syntax before applying the structural checks below so
// the verifier checks the actual remote schema instead of depending on one
// particular pg_dump formatting version.
const schema = rawSchema
  .replaceAll(/"([A-Za-z_][A-Za-z0-9_]*)"/g, "$1")
  .replaceAll(/\bCREATE TABLE IF NOT EXISTS\b/g, "CREATE TABLE")
  .replaceAll(/\bCREATE OR REPLACE FUNCTION\b/g, "CREATE FUNCTION")
  .replaceAll(/\bCREATE OR REPLACE TRIGGER\b/g, "CREATE TRIGGER");
const failures = [];
let verified = 0;

function check(label, pattern) {
  if (pattern.test(schema)) {
    verified += 1;
    return;
  }

  failures.push(label);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tableDefinition(tableName) {
  const start = schema.indexOf(`CREATE TABLE public.${tableName} (`);
  if (start === -1) {
    failures.push(`table public.${tableName}`);
    return "";
  }

  const end = schema.indexOf("\n);", start);
  if (end === -1) {
    failures.push(`complete definition for public.${tableName}`);
    return "";
  }

  return schema.slice(start, end);
}

function checkTableColumn(tableName, columnName, typePattern) {
  const definition = tableDefinition(tableName);
  if (definition && new RegExp(`\\b${escapeRegExp(columnName)}\\s+${typePattern}`, "m").test(definition)) {
    verified += 1;
    return;
  }

  failures.push(`column public.${tableName}.${columnName}`);
}

function checkFunction(functionName) {
  check(
    `function public.${functionName}`,
    new RegExp(`CREATE(?: OR REPLACE)? FUNCTION public\\.${escapeRegExp(functionName)}\\(`),
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
  check(`index ${index}`, new RegExp(`CREATE INDEX ${escapeRegExp(index)}\\b`));
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

const visitFunctionStart = schema.indexOf("CREATE FUNCTION public.record_place_visit(");
const visitFunctionEnd = visitFunctionStart === -1 ? -1 : schema.indexOf("\nALTER FUNCTION public.record_place_visit", visitFunctionStart);
const visitFunction = visitFunctionStart === -1 || visitFunctionEnd === -1 ? "" : schema.slice(visitFunctionStart, visitFunctionEnd);

if (!visitFunction) {
  failures.push("complete definition for function public.record_place_visit");
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
      failures.push(label);
    }
  }
}

// 20260801100000_v1_3_3_normalize_group_place_archive_metadata.sql
checkFunction("normalize_group_place_archive_metadata");
check(
  "trigger group_places_normalize_archive_metadata",
  /CREATE TRIGGER group_places_normalize_archive_metadata[\s\S]*?EXECUTE FUNCTION public\.normalize_group_place_archive_metadata\(\)/,
);

if (failures.length > 0) {
  console.error("Legacy migration state is not safe to repair. Missing or incomplete checks:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Verified ${verified} legacy migration schema requirements against the production schema dump.`);
console.log("No production data or migration history was changed.");
