import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const subset = join(root, "public/fonts/source-han-sans-sc-ui-v2-2.woff2");
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
const photoAction = readFileSync(join(root, "src/app/mark/actions.ts"), "utf8");
const failures = [];
if (!existsSync(subset)) failures.push("UI 字体子集不存在，请先运行 npm run fonts:subset");
else if (statSync(subset).size > 300 * 1024) failures.push(`UI 字体子集超过 300KiB：${statSync(subset).size} bytes`);
if (css.includes("source-han-sans-sc-v2.005.woff2")) failures.push("globals.css 仍引用 5.9MB 思源黑体全量文件");
if (!photoAction.includes("120 * 1024") || !photoAction.includes("600 * 1024")) failures.push("服务端照片尺寸/字节硬上限契约缺失");
if (!existsSync(join(root, "public/fonts/LICENSE-Source-Han-Sans.txt"))) failures.push("思源黑体许可证文件缺失");
if (failures.length) {
  failures.forEach((failure) => console.error(`resource-budget: ${failure}`));
  process.exit(1);
}
console.log(`resource-budget: UI font ${statSync(subset).size} bytes; CSS uses subset only.`);
