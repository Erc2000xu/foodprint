const triggerName = "group_places_normalize_archive_metadata";
const triggerFunction = "normalize_group_place_archive_metadata";

export const legacyTriggerCatalogQuery = `
  select pg_catalog.pg_get_triggerdef(trigger_row.oid, true) as trigger_definition
  from pg_catalog.pg_trigger as trigger_row
  join pg_catalog.pg_class as relation
    on relation.oid = trigger_row.tgrelid
  join pg_catalog.pg_namespace as relation_schema
    on relation_schema.oid = relation.relnamespace
  where not trigger_row.tgisinternal
    and trigger_row.tgname = '${triggerName}'
    and relation_schema.nspname = 'public'
    and relation.relname = 'group_places'
  order by trigger_row.oid;
`;

function normalizeDefinition(value) {
  return typeof value === "string"
    ? value.replaceAll('"', "").replace(/\s+/g, " ").trim().replace(/;$/, "")
    : "";
}

export function inspectLegacyTrigger(response) {
  const rows = Array.isArray(response)
    ? response
    : Array.isArray(response?.result)
      ? response.result
      : Array.isArray(response?.data)
        ? response.data
        : [];
  const definitions = rows
    .map((row) => normalizeDefinition(row?.trigger_definition))
    .filter(Boolean);
  const expectedDefinition = new RegExp(
    `^create trigger ${triggerName} before insert or update of (.+) on public\\.group_places for each row execute function (?:public\\.)?${triggerFunction}\\(\\)$`,
    "i",
  );
  const matched = definitions.length === 1 ? expectedDefinition.exec(definitions[0]) : null;
  const updateColumns = matched?.[1]
    ? matched[1].split(",").map((column) => column.trim().toLowerCase()).sort()
    : [];
  const requiredUpdateColumns = ["status", "archived_at", "archived_by", "archived_reason"].sort();

  return {
    definitions,
    isCorrect: updateColumns.length === requiredUpdateColumns.length
      && updateColumns.every((column, index) => column === requiredUpdateColumns[index]),
  };
}

export async function runProductionSql(query, { readOnly }) {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_ID;

  if (!accessToken || !projectRef) {
    throw new Error("SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_ID are required.");
  }

  const response = await fetch(
    `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, read_only: readOnly }),
    },
  );
  const responseText = await response.text();
  let body = null;

  try {
    body = responseText ? JSON.parse(responseText) : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const detail = typeof body?.error === "string"
      ? body.error
      : typeof body?.message === "string"
        ? body.message
        : `HTTP ${response.status}`;
    throw new Error(`Supabase Management API query failed: ${detail}`);
  }

  return body;
}
