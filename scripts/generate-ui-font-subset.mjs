import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const input = join(root, "public/fonts/source-han-sans-sc-v2.005.woff2");
const output = join(root, "public/fonts/source-han-sans-sc-ui-v2-2.woff2");
const glyphFile = join(root, "scripts/ui-font-glyphs.txt");

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|css)$/.test(entry.name) ? [path] : [];
  });
}

const sourceText = sourceFiles(join(root, "src")).map((path) => readFileSync(path, "utf8")).join("\n");
const cjkAndPunctuation = [...new Set([...sourceText].filter((character) => /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/u.test(character)))].sort().join("");
const ascii = Array.from({ length: 95 }, (_, index) => String.fromCharCode(32 + index)).join("");
const safetyPunctuation = "，。！？：；（）【】「」『』“”‘’、·…—–《》〈〉￥";
const glyphs = [...new Set(`${ascii}${safetyPunctuation}${cjkAndPunctuation}`)].join("");
writeFileSync(glyphFile, `${glyphs}\n`, "utf8");

const python = process.env.PYTHON ?? "python3";
const result = spawnSync(python, ["-m", "fontTools.subset", input, `--output-file=${output}`, "--flavor=woff2", `--text-file=${glyphFile}`, "--layout-features=*", "--name-IDs=*", "--name-languages=*"], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Generated ${relative(root, output)} from ${glyphs.length} glyphs.`);
