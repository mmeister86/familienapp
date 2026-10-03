// Generates the placeholder PWA icons + favicon with zero dependencies.
//
//   node scripts/generate-icons.mjs
//
// Outputs (all written to public/):
//   public/icons/icon-192.png           rounded square, primary #1f2b50
//   public/icons/icon-512.png
//   public/icons/maskable-192.png       full-bleed, glyph inside the safe zone
//   public/icons/maskable-512.png
//   public/apple-touch-icon.png         full-bleed 180px
//   public/favicon.svg                  same glyph as vector
//
// Glyph: a white house (roof triangle + body + door) on the theme's primary
// colour (--primary = #1f2b50 from src/index.css).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public");

const PRIMARY = [31, 43, 80]; // #1f2b50, theme --primary (light)
const GLYPH = [255, 255, 255];
const SS = 4; // supersampling factor for anti-aliasing

// ---------------------------------------------------------------------------
// PNG encoding
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Geometry (all coordinates normalised to 0..1 of the glyph box)
// ---------------------------------------------------------------------------
function insideRoundedSquare(x, y, radius) {
  const r = radius;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function insideTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const sign = (x1, y1, x2, y2, x3, y3) =>
    (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
  const d1 = sign(px, py, ax, ay, bx, by);
  const d2 = sign(px, py, bx, by, cx, cy);
  const d3 = sign(px, py, cx, cy, ax, ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

// House drawn in a 0..1 box: roof triangle, wall rectangle, door cut-out.
const ROOF = [[0.5, 0.06], [0.02, 0.5], [0.98, 0.5]];
function insideHouse(x, y) {
  if (insideTriangle(x, y, ...ROOF.flat())) return true;
  const inWall = x >= 0.16 && x <= 0.84 && y >= 0.46 && y <= 0.96;
  if (!inWall) return false;
  const inDoor = x >= 0.42 && x <= 0.58 && y >= 0.7 && y <= 0.96;
  return !inDoor;
}

// ---------------------------------------------------------------------------
// Rasteriser (supersampled, premultiplied alpha)
// ---------------------------------------------------------------------------
function raster(size, { round, glyphScale }) {
  const big = size * SS;
  const out = Buffer.alloc(size * size * 4);
  const radius = round ? 0.22 : 0; // corner radius of the background square
  const offset = (1 - glyphScale) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ux = (x * SS + sx + 0.5) / big;
          const uy = (y * SS + sy + 0.5) / big;
          const bg = round ? insideRoundedSquare(ux, uy, radius) : true;
          if (!bg) continue;
          const gx = (ux - offset) / glyphScale;
          const gy = (uy - offset) / glyphScale;
          const onGlyph = insideHouse(gx, gy);
          const [cr, cg, cb] = onGlyph ? GLYPH : PRIMARY;
          r += cr;
          g += cg;
          b += cb;
          a += 1;
        }
      }
      const samples = SS * SS;
      const i = (y * size + x) * 4;
      if (a > 0) {
        out[i] = Math.round(r / a);
        out[i + 1] = Math.round(g / a);
        out[i + 2] = Math.round(b / a);
      }
      out[i + 3] = Math.round((a / samples) * 255);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------
mkdirSync(join(OUT, "icons"), { recursive: true });

const rasterize = (size, opts) => encodePNG(size, size, raster(size, opts));

writeFileSync(
  join(OUT, "icons", "icon-192.png"),
  rasterize(192, { round: true, glyphScale: 0.62 }),
);
writeFileSync(
  join(OUT, "icons", "icon-512.png"),
  rasterize(512, { round: true, glyphScale: 0.62 }),
);
writeFileSync(
  join(OUT, "icons", "maskable-192.png"),
  rasterize(192, { round: false, glyphScale: 0.5 }),
);
writeFileSync(
  join(OUT, "icons", "maskable-512.png"),
  rasterize(512, { round: false, glyphScale: 0.5 }),
);
writeFileSync(
  join(OUT, "apple-touch-icon.png"),
  rasterize(180, { round: false, glyphScale: 0.62 }),
);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Familienapp">
  <rect width="64" height="64" rx="14" fill="#1f2b50"/>
  <path d="M32 13 7 35h7v19h13V43h10v11h13V35h7L32 13Z" fill="#ffffff"/>
</svg>
`;
writeFileSync(join(OUT, "favicon.svg"), svg);

console.log(`Wrote icons + favicon.svg to ${OUT}`);
