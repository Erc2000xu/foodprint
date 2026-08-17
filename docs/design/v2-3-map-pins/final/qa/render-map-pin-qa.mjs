import path from "node:path";
import sharp from "sharp";

const projectRoot = process.cwd();
const publicRoot = path.join(projectRoot, "public");
const outputRoot = path.join(projectRoot, "docs/design/v2-3-map-pins/final/qa");

const assets = [
  ["一级 默认", "icons/map-pins/pin-level-1-default.svg"],
  ["一级 选中", "icons/map-pins/pin-level-1-selected.svg"],
  ["二级 默认", "icons/map-pins/pin-level-2-default.svg"],
  ["二级 选中", "icons/map-pins/pin-level-2-selected.svg"],
  ["三级 默认", "icons/map-pins/pin-level-3-default.svg"],
  ["三级 选中", "icons/map-pins/pin-level-3-selected.svg"],
];

const panels = [];
for (const [label, source] of assets) {
  const selected = source.includes("selected");
  const width = selected ? 48 : 40;
  const height = selected ? 54 : 45;
  const marker = await sharp(path.join(publicRoot, source))
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();
  panels.push({ label, marker, width, height });
}

const mapSvg = `
<svg width="1200" height="940" viewBox="0 0 1200 940" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="940" fill="#F7F3E9"/>
  <text x="72" y="82" fill="#183B3A" font-family="Arial, sans-serif" font-size="34" font-weight="700">Foodprint V2.3 · 餐盘定位圆章正式资产 QA</text>
  <text x="72" y="122" fill="#667D78" font-family="Arial, sans-serif" font-size="20">默认 40×45px · 选中 48×54px · 下方同时展示真实地图比例</text>
  <rect x="60" y="170" width="1080" height="300" rx="28" fill="#FFFDF8" stroke="#D9D5C9" stroke-width="2"/>
  ${panels.map((panel, index) => {
    const x = 135 + index * 175;
    return `<text x="${x}" y="220" text-anchor="middle" fill="#183B3A" font-family="Arial, sans-serif" font-size="18" font-weight="700">${panel.label}</text>`;
  }).join("\n")}
  <text x="84" y="525" fill="#183B3A" font-family="Arial, sans-serif" font-size="23" font-weight="700">浅色街区背景</text>
  <rect x="60" y="550" width="1080" height="300" rx="28" fill="#EEEDE5"/>
  <path d="M60 650H1140M60 760H1140M250 550V850M475 550V850M720 550V850M950 550V850" stroke="#FFFDF8" stroke-width="24"/>
  <path d="M1050 550C910 630 820 660 740 850" stroke="#A9D6D0" stroke-width="72" fill="none" opacity=".75"/>
  <path d="M1050 550C910 630 820 660 740 850" stroke="#DDF0EC" stroke-width="4" fill="none"/>
  <rect x="128" y="585" width="105" height="58" rx="9" fill="#DCE6D3"/>
  <rect x="520" y="720" width="130" height="65" rx="9" fill="#DCE6D3"/>
  <text x="72" y="905" fill="#667D78" font-family="Arial, sans-serif" font-size="17">验证重点：1/2/3碗差异、选中橙色外圈、底部锚点、绿地/水系/道路上的对比度</text>
</svg>`;

const composites = [];
for (const [index, panel] of panels.entries()) {
  composites.push({
    input: panel.marker,
    left: Math.round(135 + index * 175 - panel.width / 2),
    top: Math.round(285 - panel.height / 2),
  });
  composites.push({
    input: panel.marker,
    left: Math.round(150 + index * 170 - panel.width / 2),
    top: Math.round(660 + (index % 2) * 78 - panel.height),
  });
}

await sharp(Buffer.from(mapSvg))
  .composite(composites)
  .png()
  .toFile(path.join(outputRoot, "map-pin-size-and-map-preview.png"));

const contactSvg = `
<svg width="880" height="360" viewBox="0 0 880 360" xmlns="http://www.w3.org/2000/svg">
  <rect width="880" height="360" fill="#FFFDF8"/>
  <text x="48" y="54" fill="#183B3A" font-family="Arial, sans-serif" font-size="25" font-weight="700">24 / 28 / 32 / 40 / 48px 小尺寸轮廓检查</text>
  ${[24, 28, 32, 40, 48].map((size, index) => `<text x="${105 + index * 155}" y="102" text-anchor="middle" fill="#667D78" font-family="Arial, sans-serif" font-size="17">${size}px</text>`).join("\n")}
  ${[1, 2, 3].map((level, index) => `<text x="42" y="${155 + index * 82}" fill="#183B3A" font-family="Arial, sans-serif" font-size="17" font-weight="700">${level}级</text>`).join("\n")}
</svg>`;

const contactComposites = [];
for (const [levelIndex, level] of [1, 2, 3].entries()) {
  for (const [sizeIndex, width] of [24, 28, 32, 40, 48].entries()) {
    const height = Math.round(width * 72 / 64);
    const marker = await sharp(path.join(publicRoot, `icons/map-pins/pin-level-${level}-default.svg`))
      .resize(width, height, { fit: "fill" })
      .png()
      .toBuffer();
    contactComposites.push({
      input: marker,
      left: Math.round(105 + sizeIndex * 155 - width / 2),
      top: Math.round(138 + levelIndex * 82),
    });
  }
}

await sharp(Buffer.from(contactSvg))
  .composite(contactComposites)
  .png()
  .toFile(path.join(outputRoot, "map-pin-small-size-grid.png"));

async function renderCluster(count, active) {
  const width = active ? 96 : 88;
  const height = active ? 108 : 100;
  const fontSize = count === "100+" ? 21 : 28;
  const circleCenterY = height * 30 / 72;
  const label = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <text x="${width / 2}" y="${circleCenterY}" text-anchor="middle" dominant-baseline="central" fill="#0D5D58" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="800">${count}</text>
    </svg>
  `);
  return sharp(path.join(publicRoot, `icons/map-pins/cluster-${active ? "active" : "default"}.svg`))
    .resize(width, height, { fit: "fill" })
    .composite([{ input: label }])
    .png()
    .toBuffer();
}

const completeAssets = {
  level1Default: await sharp(path.join(publicRoot, "icons/map-pins/pin-level-1-default.svg")).resize(80, 90).png().toBuffer(),
  level1Selected: await sharp(path.join(publicRoot, "icons/map-pins/pin-level-1-selected.svg")).resize(96, 108).png().toBuffer(),
  level2Default: await sharp(path.join(publicRoot, "icons/map-pins/pin-level-2-default.svg")).resize(80, 90).png().toBuffer(),
  level2Selected: await sharp(path.join(publicRoot, "icons/map-pins/pin-level-2-selected.svg")).resize(96, 108).png().toBuffer(),
  level3Default: await sharp(path.join(publicRoot, "icons/map-pins/pin-level-3-default.svg")).resize(80, 90).png().toBuffer(),
  level3Selected: await sharp(path.join(publicRoot, "icons/map-pins/pin-level-3-selected.svg")).resize(96, 108).png().toBuffer(),
  clusterDefault: await renderCluster("12", false),
  clusterActive: await renderCluster("100+", true),
  userLocation: await sharp(path.join(publicRoot, "icons/map-pins/user-location.svg")).resize(72, 72).png().toBuffer(),
};

const completeSvg = `
<svg width="1400" height="940" viewBox="0 0 1400 940" xmlns="http://www.w3.org/2000/svg">
  <rect width="1400" height="940" fill="#F7F3E9"/>
  <text x="70" y="75" fill="#183B3A" font-family="Arial, sans-serif" font-size="36" font-weight="800">Foodprint V2.3 · 正式地图 Pin 完整状态</text>
  <text x="70" y="116" fill="#667D78" font-family="Arial, sans-serif" font-size="20">B 餐盘定位圆章 · v2.3.0 · 三级推荐 / 选中 / 聚合 / 用户位置</text>
  ${[
    [70, "1 级推荐", "值得去", "一层小碗"],
    [500, "2 级推荐", "想再去", "两层小碗"],
    [930, "3 级推荐", "会专门去", "三层小碗"],
  ].map(([x, level, label, bowls]) => `
    <rect x="${x}" y="160" width="400" height="410" rx="28" fill="#FFFDF8" stroke="#D9D5C9" stroke-width="2"/>
    <text x="${Number(x) + 34}" y="215" fill="#183B3A" font-family="Arial, sans-serif" font-size="27" font-weight="800">${level}</text>
    <text x="${Number(x) + 34}" y="251" fill="#0D5D58" font-family="Arial, sans-serif" font-size="22" font-weight="700">${label}</text>
    <text x="${Number(x) + 34}" y="282" fill="#667D78" font-family="Arial, sans-serif" font-size="17">${bowls}</text>
    <text x="${Number(x) + 105}" y="518" text-anchor="middle" fill="#667D78" font-family="Arial, sans-serif" font-size="18">默认 · 40×45</text>
    <text x="${Number(x) + 292}" y="518" text-anchor="middle" fill="#667D78" font-family="Arial, sans-serif" font-size="18">选中 · 48×54</text>
  `).join("\n")}
  <rect x="70" y="610" width="1260" height="255" rx="28" fill="#FFFDF8" stroke="#D9D5C9" stroke-width="2"/>
  <text x="105" y="663" fill="#183B3A" font-family="Arial, sans-serif" font-size="26" font-weight="800">辅助状态</text>
  <text x="250" y="824" text-anchor="middle" fill="#667D78" font-family="Arial, sans-serif" font-size="18">聚合默认 · 12 家</text>
  <text x="600" y="824" text-anchor="middle" fill="#667D78" font-family="Arial, sans-serif" font-size="18">聚合激活 · 100+</text>
  <text x="950" y="824" text-anchor="middle" fill="#667D78" font-family="Arial, sans-serif" font-size="18">用户当前位置 · 蓝色独立语义</text>
  <text x="70" y="912" fill="#667D78" font-family="Arial, sans-serif" font-size="17">定位尖角统一锚定底部中心；橙红表示选中，不表示推荐等级；聚合数字由程序动态绘制。</text>
</svg>`;

await sharp(Buffer.from(completeSvg))
  .composite([
    { input: completeAssets.level1Default, left: 135, top: 330 },
    { input: completeAssets.level1Selected, left: 310, top: 312 },
    { input: completeAssets.level2Default, left: 565, top: 330 },
    { input: completeAssets.level2Selected, left: 740, top: 312 },
    { input: completeAssets.level3Default, left: 995, top: 330 },
    { input: completeAssets.level3Selected, left: 1170, top: 312 },
    { input: completeAssets.clusterDefault, left: 206, top: 688 },
    { input: completeAssets.clusterActive, left: 552, top: 680 },
    { input: completeAssets.userLocation, left: 914, top: 697 },
  ])
  .png()
  .toFile(path.join(outputRoot, "map-pin-complete-state-board.png"));

console.log("Rendered map pin QA previews.");
