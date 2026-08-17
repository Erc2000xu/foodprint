const expected = "京ICP备2026047829号-1";
const configured = process.env.NEXT_PUBLIC_ICP_RECORD?.trim();
const required = process.argv.includes("--required");

if (required && !configured) {
  console.error("Missing required NEXT_PUBLIC_ICP_RECORD for a production release.");
  process.exit(1);
}

if (configured && configured !== expected) {
  console.error("NEXT_PUBLIC_ICP_RECORD does not match the confirmed Foodprint filing number.");
  process.exit(1);
}

console.log(JSON.stringify({ valid: true, required, configured: Boolean(configured) }));
