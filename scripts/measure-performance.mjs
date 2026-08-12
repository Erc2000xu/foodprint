const baseUrl = new URL(process.env.PERFORMANCE_BASE_URL || "http://127.0.0.1:3000");
const sampleCount = Math.max(1, Math.min(100, Number(process.env.PERFORMANCE_SAMPLES || 5)));
const routes = ["/launch", "/login", "/offline", "/manifest.webmanifest", "/service-worker.js", "/api/health"];

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

const measurements = [];
for (const route of routes) {
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const startedAt = performance.now();
    let status = 0;
    try {
      const response = await fetch(new URL(route, baseUrl), { redirect: "manual", cache: "no-store" });
      status = response.status;
      await response.arrayBuffer();
    } catch {
      status = 0;
    }
    measurements.push({ route, status, durationMs: performance.now() - startedAt });
  }
}

console.log(`# Foodprint performance baseline\n\n- base: \`${baseUrl.origin}\`\n- samples per route: ${sampleCount}\n- collected at: ${new Date().toISOString()}\n- note: this script measures public entry/runtime responses only; it does not send cookies, authorization, query strings or user data.\n\n| Route | p50 ms | p75 ms | p95 ms | HTTP statuses |\n| --- | ---: | ---: | ---: | --- |`);
for (const route of routes) {
  const rows = measurements.filter((measurement) => measurement.route === route);
  const statuses = [...new Set(rows.map((row) => row.status))].sort((left, right) => left - right).join(", ");
  console.log(`| ${route} | ${Math.round(percentile(rows.map((row) => row.durationMs), 0.5) ?? 0)} | ${Math.round(percentile(rows.map((row) => row.durationMs), 0.75) ?? 0)} | ${Math.round(percentile(rows.map((row) => row.durationMs), 0.95) ?? 0)} | ${statuses || "network error"} |`);
}
