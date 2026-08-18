import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../../..");
const sourcePath = path.join(scriptDirectory, "imagegen-chroma-master-v2.png");
const outputDirectory = path.join(projectRoot, "public/icons/map-controls");
const qaPath = path.join(scriptDirectory, "qa-location-control.png");

const OUTPUTS = [
  ["locate-current-master.png", 1024],
  ["locate-current-ui.png", 256],
  ["locate-current-26.png", 26],
  ["locate-current-52.png", 52],
  ["locate-current-78.png", 78],
];

function isChromaBackground(red, green, blue) {
  const magentaFloor = Math.min(red, blue);
  return (
    red > 80 &&
    blue > 120 &&
    green < 120 &&
    magentaFloor - green > 20 &&
    red + blue > 205
  );
}

function hasMagentaSpill(red, green, blue) {
  const magentaFloor = Math.min(red, blue);
  return (
    red > 55 &&
    blue > 100 &&
    green < 130 &&
    magentaFloor - green > 10 &&
    red + blue > 170
  );
}

function isCleanOuterTeal(red, green, blue) {
  return green > red + 10 && green >= blue - 15 && blue < 210;
}

function findConnectedIcon(rgb, width, height, channels) {
  const pixelCount = width * height;
  const candidate = new Uint8Array(pixelCount);

  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * channels;
    candidate[index] = isChromaBackground(
      rgb[offset],
      rgb[offset + 1],
      rgb[offset + 2],
    )
      ? 0
      : 1;
  }

  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  let seedIndex = centerY * width + centerX;

  if (!candidate[seedIndex]) {
    outer: for (let radius = 1; radius < 40; radius += 1) {
      for (let y = centerY - radius; y <= centerY + radius; y += 1) {
        for (let x = centerX - radius; x <= centerX + radius; x += 1) {
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const index = y * width + x;
          if (candidate[index]) {
            seedIndex = index;
            break outer;
          }
        }
      }
    }
  }

  const component = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;
  queue[tail] = seedIndex;
  tail += 1;
  component[seedIndex] = 1;

  const neighborOffsets = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ];

  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);

    for (const [deltaX, deltaY] of neighborOffsets) {
      const nextX = x + deltaX;
      const nextY = y + deltaY;
      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
        continue;
      }
      const nextIndex = nextY * width + nextX;
      if (candidate[nextIndex] && !component[nextIndex]) {
        component[nextIndex] = 1;
        queue[tail] = nextIndex;
        tail += 1;
      }
    }
  }

  return component;
}

function blurMask(mask, width, height) {
  const output = new Uint8Array(width * height);
  const weights = [1, 2, 1, 2, 4, 2, 1, 2, 1];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let weightedTotal = 0;
      let weightTotal = 0;
      let weightIndex = 0;

      for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
        for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
          const sampleX = x + deltaX;
          const sampleY = y + deltaY;
          const weight = weights[weightIndex];
          weightIndex += 1;
          if (
            sampleX < 0 ||
            sampleY < 0 ||
            sampleX >= width ||
            sampleY >= height
          ) {
            continue;
          }
          weightedTotal += mask[sampleY * width + sampleX] * weight;
          weightTotal += weight;
        }
      }

      output[y * width + x] = Math.round(
        (weightedTotal / Math.max(weightTotal, 1)) * 255,
      );
    }
  }

  return output;
}

function measureMask(mask, width, height) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) {
    throw new Error("No connected icon pixels were found in the chroma master.");
  }

  return {
    left,
    top,
    right,
    bottom,
    width: right - left + 1,
    height: bottom - top + 1,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

function nearestCleanInteriorPixel({
  rgb,
  component,
  width,
  height,
  channels,
  x,
  y,
  centerX,
  centerY,
}) {
  const distance = Math.hypot(centerX - x, centerY - y) || 1;
  const directionX = (centerX - x) / distance;
  const directionY = (centerY - y) / distance;

  for (let step = 1; step <= 16; step += 1) {
    const sampleX = Math.round(x + directionX * step);
    const sampleY = Math.round(y + directionY * step);
    if (
      sampleX < 0 ||
      sampleY < 0 ||
      sampleX >= width ||
      sampleY >= height
    ) {
      continue;
    }
    const sampleIndex = sampleY * width + sampleX;
    const sampleOffset = sampleIndex * channels;
    const red = rgb[sampleOffset];
    const green = rgb[sampleOffset + 1];
    const blue = rgb[sampleOffset + 2];

    if (component[sampleIndex] && isCleanOuterTeal(red, green, blue)) {
      return [red, green, blue];
    }
  }

  return [13, 93, 88];
}

function buildTransparentRgba(rgb, info, component) {
  const { width, height, channels } = info;
  const alpha = blurMask(component, width, height);
  const bounds = measureMask(component, width, height);
  const rgba = Buffer.alloc(width * height * 4);

  for (let index = 0; index < width * height; index += 1) {
    const sourceOffset = index * channels;
    const outputOffset = index * 4;
    const x = index % width;
    const y = Math.floor(index / width);
    const alphaValue = alpha[index];

    if (alphaValue === 0) {
      rgba[outputOffset] = 0;
      rgba[outputOffset + 1] = 0;
      rgba[outputOffset + 2] = 0;
      rgba[outputOffset + 3] = 0;
      continue;
    }

    const original = [
      rgb[sourceOffset],
      rgb[sourceOffset + 1],
      rgb[sourceOffset + 2],
    ];
    const needsCleanColor =
      alphaValue < 255 ||
      !component[index] ||
      hasMagentaSpill(original[0], original[1], original[2]);
    const color = needsCleanColor
      ? nearestCleanInteriorPixel({
          rgb,
          component,
          width,
          height,
          channels,
          x,
          y,
          centerX: bounds.centerX,
          centerY: bounds.centerY,
        })
      : original;

    rgba[outputOffset] = color[0];
    rgba[outputOffset + 1] = color[1];
    rgba[outputOffset + 2] = color[2];
    rgba[outputOffset + 3] = alphaValue;
  }

  return { rgba, alpha, bounds };
}

function squareCrop(bounds, sourceWidth, sourceHeight) {
  const largestDimension = Math.max(bounds.width, bounds.height);
  const padding = Math.ceil(largestDimension * 0.06);
  let size = largestDimension + padding * 2;
  size = Math.min(size, sourceWidth, sourceHeight);
  let left = Math.round(bounds.centerX - size / 2);
  let top = Math.round(bounds.centerY - size / 2);
  left = Math.max(0, Math.min(left, sourceWidth - size));
  top = Math.max(0, Math.min(top, sourceHeight - size));
  return { left, top, width: size, height: size };
}

async function renderQaBoard(masterPath) {
  const boardWidth = 1400;
  const boardHeight = 900;
  const checkerSize = 28;
  const checkerCells = [];

  for (let y = 0; y < 448; y += checkerSize) {
    for (let x = 0; x < 448; x += checkerSize) {
      checkerCells.push(
        `<rect x="${80 + x}" y="${150 + y}" width="${checkerSize}" height="${checkerSize}" fill="${
          (x / checkerSize + y / checkerSize) % 2 === 0 ? "#ffffff" : "#d9ddd8"
        }"/>`,
      );
    }
  }

  const baseSvg = Buffer.from(`
    <svg width="${boardWidth}" height="${boardHeight}" viewBox="0 0 ${boardWidth} ${boardHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="1400" height="900" fill="#f4efe5"/>
      <text x="48" y="55" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#153f3b">Foodprint V2.4.1 — location control asset QA</text>
      <rect x="48" y="88" width="544" height="746" rx="28" fill="#ffffff"/>
      <text x="80" y="130" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#153f3b">True-alpha transparency</text>
      ${checkerCells.join("\n")}
      <text x="80" y="640" font-family="Arial, sans-serif" font-size="17" fill="#58706d">Checkerboard is QA background, not baked into the PNG.</text>
      <rect x="632" y="88" width="720" height="340" rx="28" fill="#dce9e2"/>
      <path d="M650 305 C820 180 1040 360 1334 165" fill="none" stroke="#c4d6ce" stroke-width="18"/>
      <path d="M660 155 C920 330 1110 155 1338 335" fill="none" stroke="#eef4ef" stroke-width="12"/>
      <text x="664" y="130" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#153f3b">44 px control geometry — 4× inspection</text>
      <circle cx="994" cy="270" r="88" fill="#fffdf8" stroke="#d9ded8" stroke-width="4"/>
      <rect x="632" y="460" width="720" height="220" rx="28" fill="#102a2a"/>
      <text x="664" y="505" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#ffffff">Dark-background fringe check</text>
      <rect x="632" y="712" width="720" height="122" rx="28" fill="#fffdf8"/>
      <text x="664" y="752" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#153f3b">Native pixels</text>
      <text x="820" y="810" font-family="Arial, sans-serif" font-size="14" fill="#58706d">26</text>
      <text x="970" y="810" font-family="Arial, sans-serif" font-size="14" fill="#58706d">52</text>
      <text x="1140" y="810" font-family="Arial, sans-serif" font-size="14" fill="#58706d">78</text>
    </svg>
  `);

  const icon420 = await sharp(masterPath).resize(420, 420).png().toBuffer();
  const icon104 = await sharp(masterPath).resize(104, 104).png().toBuffer();
  const icon160 = await sharp(masterPath).resize(160, 160).png().toBuffer();
  const nativeIcons = await Promise.all(
    [26, 52, 78].map((size) => sharp(masterPath).resize(size, size).png().toBuffer()),
  );

  await sharp(baseSvg)
    .composite([
      { input: icon420, left: 94, top: 164 },
      { input: icon104, left: 942, top: 218 },
      { input: icon160, left: 912, top: 520 },
      { input: nativeIcons[0], left: 816, top: 765 },
      { input: nativeIcons[1], left: 964, top: 752 },
      { input: nativeIcons[2], left: 1130, top: 739 },
    ])
    .png()
    .toFile(qaPath);
}

async function auditOutput(filePath, expectedSize) {
  const image = sharp(filePath);
  const metadata = await image.metadata();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const cornerCoordinates = [
    [0, 0],
    [info.width - 1, 0],
    [0, info.height - 1],
    [info.width - 1, info.height - 1],
  ];
  const cornerAlpha = cornerCoordinates.map(([x, y]) => {
    return data[(y * info.width + x) * info.channels + 3];
  });
  const centerOffset =
    (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) *
    info.channels;
  const centerAlpha = data[centerOffset + 3];
  let visibleMagentaPixels = 0;
  let visibleLeft = info.width;
  let visibleTop = info.height;
  let visibleRight = -1;
  let visibleBottom = -1;

  for (let index = 0; index < info.width * info.height; index += 1) {
    const offset = index * info.channels;
    const alphaValue = data[offset + 3];
    if (alphaValue > 8) {
      const x = index % info.width;
      const y = Math.floor(index / info.width);
      visibleLeft = Math.min(visibleLeft, x);
      visibleTop = Math.min(visibleTop, y);
      visibleRight = Math.max(visibleRight, x);
      visibleBottom = Math.max(visibleBottom, y);
    }
    if (
      alphaValue > 16 &&
      hasMagentaSpill(data[offset], data[offset + 1], data[offset + 2])
    ) {
      visibleMagentaPixels += 1;
    }
  }

  const visibleCenterX = (visibleLeft + visibleRight) / 2;
  const visibleCenterY = (visibleTop + visibleBottom) / 2;
  const canvasCenterX = (info.width - 1) / 2;
  const canvasCenterY = (info.height - 1) / 2;
  const centerDelta = {
    x: visibleCenterX - canvasCenterX,
    y: visibleCenterY - canvasCenterY,
  };

  if (
    metadata.width !== expectedSize ||
    metadata.height !== expectedSize ||
    metadata.channels !== 4 ||
    !metadata.hasAlpha ||
    cornerAlpha.some((value) => value !== 0) ||
    centerAlpha < 250 ||
    Math.abs(centerDelta.x) > 1 ||
    Math.abs(centerDelta.y) > 1 ||
    visibleMagentaPixels !== 0
  ) {
    throw new Error(
      `Asset audit failed for ${path.basename(filePath)}: ${JSON.stringify({
        width: metadata.width,
        height: metadata.height,
        channels: metadata.channels,
        hasAlpha: metadata.hasAlpha,
        cornerAlpha,
        centerAlpha,
        centerDelta,
        visibleMagentaPixels,
      })}`,
    );
  }

  return {
    file: path.relative(projectRoot, filePath),
    width: metadata.width,
    height: metadata.height,
    channels: metadata.channels,
    hasAlpha: metadata.hasAlpha,
    cornerAlpha,
    centerAlpha,
    centerDelta,
    visibleMagentaPixels,
  };
}

async function main() {
  const { data: rgb, info } = await sharp(sourcePath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const component = findConnectedIcon(rgb, info.width, info.height, info.channels);
  const { rgba, bounds } = buildTransparentRgba(rgb, info, component);
  const crop = squareCrop(bounds, info.width, info.height);
  const transparentSource = sharp(rgba, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  }).extract(crop);

  const masterBuffer = await transparentSource
    .clone()
    .resize(1024, 1024, { kernel: sharp.kernel.mitchell })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  for (const [fileName, size] of OUTPUTS) {
    const outputPath = path.join(outputDirectory, fileName);
    if (size === 1024) {
      await sharp(masterBuffer).png({ compressionLevel: 9 }).toFile(outputPath);
    } else {
      await sharp(masterBuffer)
        .resize(size, size, { kernel: sharp.kernel.mitchell })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toFile(outputPath);
    }
  }

  await renderQaBoard(path.join(outputDirectory, "locate-current-master.png"));

  const audits = [];
  for (const [fileName, size] of OUTPUTS) {
    audits.push(await auditOutput(path.join(outputDirectory, fileName), size));
  }

  console.log(
    JSON.stringify(
      {
        source: path.relative(projectRoot, sourcePath),
        detectedBounds: bounds,
        crop,
        outputs: audits,
        qa: path.relative(projectRoot, qaPath),
      },
      null,
      2,
    ),
  );
}

await main();
