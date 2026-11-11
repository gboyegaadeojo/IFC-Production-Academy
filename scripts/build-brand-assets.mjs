// Builds every Signal Line brand file from two sources: the mark below and the approved horizontal
// logo (public/brand/signal-line/svg/logo-horizontal-light.svg, whose outlined "IFC Production" and
// "ACADEMY" are the wordmark). Run `npm run brand:build` after changing either; the output is
// committed. Decision: docs/decisions/2026-11-10-signal-line-brand.md.
//
// Writes the other SVG colourways, the PNG icons (favicons, PWA "any" and "maskable", Apple touch
// icon), favicon.ico, the adaptive SVG favicon, the Open Graph image, and the wordmark paths the
// in-app <Logo> draws (lib/generated/brand-paths.ts).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const brandDir = join(root, "public/brand/signal-line");
const svgDir = join(brandDir, "svg");
const pngDir = join(brandDir, "png");

// The mark (source of truth, viewBox 0 0 96 96). Never redraw it.
const LINE =
  "M14 84V60A8.5 8.5 0 0 1 31 60V70A8.5 8.5 0 0 0 48 70V46A8.5 8.5 0 0 1 65 46V56A8.5 8.5 0 0 0 82 56V30";
const COLOURS = {
  light: { line: "#000000", dot: "#7C3AED" },
  dark: { line: "#F5F5F5", dot: "#B69BFF" },
  onPurple: { line: "#F5F5F5", dot: "#F5F5F5" },
  monoBlack: { line: "#000000", dot: "#000000" },
  monoWhite: { line: "#FFFFFF", dot: "#FFFFFF" },
};
const PURPLE = "#7C3AED";

/** The mark's two shapes. The 16px cut is heavier: stroke 11 and a radius-8 dot. */
function markShapes({ line, dot }, small = false) {
  return (
    `<path d="${LINE}" fill="none" stroke="${line}" stroke-width="${small ? 11 : 10}" stroke-linecap="round"/>` +
    `<circle cx="82" cy="14" r="${small ? 8 : 7}" fill="${dot}"/>`
  );
}

const symbol = (colours, size = 384) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 96 96">${markShapes(colours)}</svg>\n`;

/** An app icon: the mark at 62% of the square, centred. `rounded` false fills the whole square. */
function appIcon(background, colours, rounded = true) {
  const rx = rounded ? ` rx="230"` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">` +
    `<rect width="1024" height="1024"${rx} fill="${background}"/>` +
    `<svg x="194.56" y="194.56" width="634.88" height="634.88" viewBox="0 0 96 96">${markShapes(colours)}</svg></svg>\n`
  );
}

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">${markShapes(COLOURS.light, true)}</svg>\n`;

// The browser tab's icon follows the browser's own light or dark theme.
const adaptiveFavicon =
  `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">` +
  `<style>path{stroke:${COLOURS.light.line}}circle{fill:${COLOURS.light.dot}}` +
  `@media (prefers-color-scheme:dark){path{stroke:${COLOURS.dark.line}}circle{fill:${COLOURS.dark.dot}}}</style>` +
  `<path d="${LINE}" fill="none" stroke-width="11" stroke-linecap="round"/><circle cx="82" cy="14" r="8"/></svg>\n`;

function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

// 1. SVGs. The horizontal logo is recoloured, never redrawn.
const horizontalLight = readFileSync(join(svgDir, "logo-horizontal-light.svg"), "utf8");
function recolourHorizontal({ line, dot }) {
  return horizontalLight
    .replaceAll('stroke="#000000"', `stroke="${line}"`)
    .replaceAll('fill="#000000"', `fill="${line}"`)
    .replaceAll('fill="#7C3AED"', `fill="${dot}"`);
}
const svgs = {
  "logo-horizontal-dark.svg": recolourHorizontal(COLOURS.dark),
  "logo-horizontal-mono-black.svg": recolourHorizontal(COLOURS.monoBlack),
  "logo-horizontal-mono-white.svg": recolourHorizontal(COLOURS.monoWhite),
  "symbol-light.svg": symbol(COLOURS.light),
  "symbol-dark.svg": symbol(COLOURS.dark),
  "symbol-mono-black.svg": symbol(COLOURS.monoBlack),
  "symbol-mono-white.svg": symbol(COLOURS.monoWhite),
  "app-icon-primary.svg": appIcon(PURPLE, COLOURS.onPurple),
  "app-icon-dark.svg": appIcon("#000000", COLOURS.dark),
  "app-icon-light.svg": appIcon("#F5F5F5", COLOURS.light),
  "app-icon-maskable.svg": appIcon(PURPLE, COLOURS.onPurple, false),
  "favicon.svg": favicon,
};
for (const [name, contents] of Object.entries(svgs)) {
  write(join(svgDir, name), contents);
}
write(join(root, "public/icon.svg"), adaptiveFavicon);

// 2. PNGs, each rendered at its own size (no blurry upscaling).
async function png(svg, size, out) {
  const declared = Number(/width="([\d.]+)"/.exec(svg)?.[1] ?? size);
  const buffer = await sharp(Buffer.from(svg), { density: (72 * size) / declared })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
  write(out, buffer);
  return buffer;
}
const faviconPngs = [];
for (const size of [16, 32, 48]) {
  // 16px uses the heavier favicon cut; 32 and 48 use the standard mark.
  const source = size === 16 ? favicon : symbol(COLOURS.light, 96);
  faviconPngs.push({ size, data: await png(source, size, join(pngDir, `favicon-${size}.png`)) });
}
await png(svgs["app-icon-primary.svg"], 192, join(root, "public/icons/icon-192.png"));
await png(svgs["app-icon-primary.svg"], 512, join(root, "public/icons/icon-512.png"));
await png(svgs["app-icon-maskable.svg"], 192, join(root, "public/icons/icon-maskable-192.png"));
await png(svgs["app-icon-maskable.svg"], 512, join(root, "public/icons/icon-maskable-512.png"));
// iOS masks the corners itself, so the Apple icon is a full square with no transparency.
await png(svgs["app-icon-maskable.svg"], 180, join(root, "public/icons/apple-touch-icon.png"));
for (const name of ["app-icon-primary", "app-icon-dark", "app-icon-light", "app-icon-maskable"]) {
  await png(svgs[`${name}.svg`], 1024, join(pngDir, `${name}-1024.png`));
}
for (const tone of ["light", "dark"]) {
  const svg = tone === "light" ? horizontalLight : svgs["logo-horizontal-dark.svg"];
  const buffer = await sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
  write(join(pngDir, `logo-horizontal-${tone}@2x.png`), buffer);
}

// 3. favicon.ico: 16, 32 and 48, stored as PNGs (every current browser reads these).
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, index) => {
    const entry = 6 + 16 * index;
    header.writeUInt8(size, entry);
    header.writeUInt8(size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.data)]);
}
write(join(root, "public/favicon.ico"), ico(faviconPngs));

// 4. The wordmark's outlined paths, for the in-app <Logo>.
const fills = [...horizontalLight.matchAll(/<path fill="(#[0-9A-F]{6})" d="([^"]+)"\/>/g)];
const namePath = fills.find(([, fill]) => fill === "#000000")?.[2];
const academyPath = fills.find(([, fill]) => fill === "#7C3AED")?.[2];
if (!namePath || !academyPath) {
  throw new Error("The horizontal logo's wordmark paths weren't found.");
}
write(
  join(root, "lib/generated/brand-paths.ts"),
  `// Generated by scripts/build-brand-assets.mjs from the approved Signal Line logo. Don't edit.\n` +
    `export const MARK_LINE_PATH = ${JSON.stringify(LINE)};\n` +
    `export const WORDMARK_NAME_PATH = ${JSON.stringify(namePath)};\n` +
    `export const WORDMARK_ACADEMY_PATH = ${JSON.stringify(academyPath)};\n`,
);

// 5. The Open Graph image (1200 x 630), drawn in a real browser so Inter renders exactly.
const { chromium } = await import("@playwright/test");
// Greyscale anti-aliasing: sub-pixel (LCD) text leaves coloured fringes in a saved image.
const browser = await chromium.launch({ args: ["--disable-lcd-text"] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  const lockup = svgs["logo-horizontal-dark.svg"];
  await page.setContent(
    `<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;800&display=swap"><style>
      body{margin:0;width:1200px;height:630px;background:#000;color:#F5F5F5;font-family:Inter,sans-serif;overflow:hidden;position:relative}
      .lockup{position:absolute;left:72px;top:56px;width:416px;height:152px}
      .watermark{position:absolute;right:-90px;bottom:-150px;width:620px;height:620px;opacity:.08}
      h1{position:absolute;left:96px;top:330px;margin:0;font-size:92px;font-weight:800;letter-spacing:-0.04em;line-height:1}
      p{position:absolute;left:96px;top:450px;margin:0;font-size:28px;color:#b4b4b4}
    </style></head><body>
      <svg class="watermark" viewBox="0 0 96 96"><path d="${LINE}" fill="none" stroke="#F5F5F5" stroke-width="10" stroke-linecap="round"/></svg>
      <div class="lockup">${lockup}</div>
      <h1>Learn it. Serve it.</h1><p>Training for the IFC production team.</p>
    </body></html>`,
    { waitUntil: "networkidle" },
  );
  await page.evaluate(() => document.fonts.ready);
  write(join(root, "app/opengraph-image.png"), await page.screenshot({ type: "png" }));
} finally {
  await browser.close();
}
write(
  join(root, "app/opengraph-image.alt.txt"),
  "IFC Production Academy. Learn it. Serve it. Training for the IFC production team.",
);

console.log("Brand assets built.");
