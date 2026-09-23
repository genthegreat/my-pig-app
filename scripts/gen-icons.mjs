// Generates the PWA icons as PNGs with nothing but Node's zlib — no image
// library to install on Windows or in Docker. A simple pig on the app's
// green. Run once (`npm run gen:icons`); the output is committed.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../public/icons");
mkdirSync(outDir, { recursive: true });

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Scene: a pig face, drawn with signed-distance shapes and supersampling ──
const BG = [0x2f, 0x6f, 0x4e]; // --accent
const PIG = [0xf2, 0xa7, 0xb8];
const PIG_DARK = [0xd9, 0x7f, 0x95];
const INK = [0x3a, 0x1f, 0x26];

function scene(u, v, maskable) {
  // u, v in [0,1]. Returns [r,g,b,a].
  const cx = u - 0.5;
  const cy = v - 0.5;
  // rounded-square background; maskable icons fill the whole tile
  if (!maskable) {
    const r = 0.22;
    const qx = Math.max(Math.abs(cx) - (0.5 - r), 0);
    const qy = Math.max(Math.abs(cy) - (0.5 - r), 0);
    if (Math.hypot(qx, qy) > r) return [0, 0, 0, 0];
  }
  let col = BG;
  const s = maskable ? 0.78 : 1; // keep the pig inside the safe zone
  const x = cx / s;
  const y = cy / s;
  const inEllipse = (px, py, ex, ey, rx, ry) => ((px - ex) / rx) ** 2 + ((py - ey) / ry) ** 2 <= 1;
  const inTri = (px, py, a, b, c) => {
    const sign = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
    const d1 = sign([px, py], a, b);
    const d2 = sign([px, py], b, c);
    const d3 = sign([px, py], c, a);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  // ears
  if (inTri(x, y, [-0.30, -0.10], [-0.34, -0.40], [-0.06, -0.26])) col = PIG_DARK;
  if (inTri(x, y, [0.30, -0.10], [0.34, -0.40], [0.06, -0.26])) col = PIG_DARK;
  // head
  if (inEllipse(x, y, 0, 0.02, 0.33, 0.30)) col = PIG;
  // eyes
  if (inEllipse(x, y, -0.13, -0.06, 0.035, 0.04)) col = INK;
  if (inEllipse(x, y, 0.13, -0.06, 0.035, 0.04)) col = INK;
  // snout
  if (inEllipse(x, y, 0, 0.13, 0.15, 0.10)) col = PIG_DARK;
  if (inEllipse(x, y, -0.055, 0.13, 0.03, 0.04)) col = INK;
  if (inEllipse(x, y, 0.055, 0.13, 0.03, 0.04)) col = INK;
  return [...col, 255];
}

function render(size, maskable) {
  const buf = Buffer.alloc(size * size * 4);
  const ss = 4; // supersampling
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const [cr, cg, cb, ca] = scene((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size, maskable);
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      }
      const i = (py * size + px) * 4;
      if (a > 0) {
        buf[i] = Math.round(r / a);
        buf[i + 1] = Math.round(g / a);
        buf[i + 2] = Math.round(b / a);
      }
      buf[i + 3] = Math.round(a / (ss * ss));
    }
  }
  return png(size, size, buf);
}

for (const [name, size, maskable] of [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, true],
]) {
  writeFileSync(resolve(outDir, name), render(size, maskable));
  console.log("wrote", name);
}
