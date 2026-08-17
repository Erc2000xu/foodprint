import fs from "node:fs";
import path from "node:path";

const nextDirectory = path.join(process.cwd(), ".next");
const expectedRecord = "京ICP备2026047829号-1";
const expectedUrl = "https://beian.miit.gov.cn/";

function* readFiles(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* readFiles(filePath);
    else if (/\.(js|html|json|txt)$/.test(filePath)) yield filePath;
  }
}

const scanRoots = ["server", "static", "app"].map((directory) => path.join(nextDirectory, directory));
let hasRecord = false;
let hasUrl = false;
let filesScanned = 0;
for (const root of scanRoots) {
  for (const filePath of readFiles(root)) {
    const output = fs.readFileSync(filePath, "utf8");
    filesScanned += 1;
    hasRecord ||= output.includes(expectedRecord);
    hasUrl ||= output.includes(expectedUrl);
    if (hasRecord && hasUrl) break;
  }
  if (hasRecord && hasUrl) break;
}

if (!hasRecord || !hasUrl) {
  console.error(JSON.stringify({ valid: false, hasRecord, hasUrl }));
  console.error("The Next.js build output is missing the confirmed ICP record or MIIT URL.");
  process.exit(1);
}
console.log(JSON.stringify({ valid: true, filesScanned }));
