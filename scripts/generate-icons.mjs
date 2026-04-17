import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const publicDir = path.join(root, "public");
const iconsDir = path.join(publicDir, "icons");
const fallbackSvgPath = path.join(iconsDir, "icon.svg");

const ICON_SIZES = [16, 32, 48, 72, 96, 128, 144, 152, 180, 192, 384, 512];
const MASKABLE_SIZES = [192, 512];
const SHORTCUTS = [
  { name: "shortcut-bookings.png", size: 96 },
  { name: "shortcut-catalog.png", size: 96 },
];

const candidates = [
  path.join(publicDir, "logo.svg"),
  path.join(publicDir, "logo.png"),
  path.join(publicDir, "icon.svg"),
  path.join(publicDir, "next.svg"),
];

const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="220" fill="#C6A97E"/>
  <circle cx="512" cy="430" r="200" fill="#F6F3EE"/>
  <rect x="252" y="640" width="520" height="110" rx="55" fill="#F6F3EE"/>
</svg>`;

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function pickSource() {
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  await ensureDir(iconsDir);
  await fs.writeFile(fallbackSvgPath, placeholderSvg, "utf8");
  return fallbackSvgPath;
}

async function generateRegularIcon(sourcePath, size, outputPath) {
  await sharp(sourcePath).resize(size, size, { fit: "cover" }).png().toFile(outputPath);
}

async function generateMaskableIcon(sourcePath, size, outputPath) {
  const insetSize = Math.round(size * 0.8);
  const inset = await sharp(sourcePath).resize(insetSize, insetSize, { fit: "contain" }).png().toBuffer();
  const offset = Math.round((size - insetSize) / 2);
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: "#C6A97E",
    },
  })
    .composite([{ input: inset, top: offset, left: offset }])
    .png()
    .toFile(outputPath);
}

async function main() {
  await ensureDir(iconsDir);
  const sourcePath = await pickSource();

  for (const size of ICON_SIZES) {
    const output = path.join(iconsDir, `icon-${size}.png`);
    await generateRegularIcon(sourcePath, size, output);
  }

  for (const size of MASKABLE_SIZES) {
    const output = path.join(iconsDir, `icon-${size}-maskable.png`);
    await generateMaskableIcon(sourcePath, size, output);
  }

  for (const shortcut of SHORTCUTS) {
    const output = path.join(iconsDir, shortcut.name);
    await generateRegularIcon(sourcePath, shortcut.size, output);
  }
}

await main();
