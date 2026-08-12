/**
 * Generates the raster app icons from the same geometry as src/app/icon.svg:
 * a rounded gradient tile (indigo -> fuchsia, matching the site header) with
 * the beamed-notes mark.
 *
 * Shapes are evaluated as signed distance fields and anti-aliased against the
 * pixel footprint, so the 16px favicon stays crisp. PNG encoding uses Node's
 * zlib; the .ico embeds PNGs (supported everywhere since Windows Vista).
 *
 * Run: node scripts/generate-icons.mjs
 */

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "app");

// --- Design constants (24-unit design space, shared with icon.svg) ---------

const CORNER_RADIUS = 7.2;
const GLYPH_SCALE = 0.78;
const GLYPH_CENTER = { x: 12.725, y: 11.275 };
const STROKE_RADIUS = 1.35; // half of the 2.7 stroke width
const HEAD_RADIUS = 2.9;
const GRADIENT_FROM = [0x63, 0x66, 0xf1]; // indigo-500
const GRADIENT_TO = [0xc0, 0x26, 0xd3]; // fuchsia-600

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;

function sdRoundRect(px, py, cx, cy, halfW, halfH, radius) {
  const qx = Math.abs(px - cx) - (halfW - radius);
  const qy = Math.abs(py - cy) - (halfH - radius);
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    radius
  );
}

function sdCircle(px, py, cx, cy, radius) {
  return Math.hypot(px - cx, py - cy) - radius;
}

function sdCapsule(px, py, ax, ay, bx, by, radius) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h) - radius;
}

/** Distance to the note mark, in glyph coordinates. */
function sdMark(gx, gy) {
  return Math.min(
    sdCapsule(gx, gy, 9, 18, 9, 5, STROKE_RADIUS), // left stem
    sdCapsule(gx, gy, 9, 5, 21, 3, STROKE_RADIUS), // beam
    sdCapsule(gx, gy, 21, 3, 21, 16, STROKE_RADIUS), // right stem
    sdCircle(gx, gy, 6, 18, HEAD_RADIUS), // left note head
    sdCircle(gx, gy, 18, 16, HEAD_RADIUS) // right note head
  );
}

export function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const unitsPerPixel = 24 / size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) * unitsPerPixel;
      const dy = (y + 0.5) * unitsPerPixel;

      const tileAlpha = clamp(
        0.5 - sdRoundRect(dx, dy, 12, 12, 12, 12, CORNER_RADIUS) / unitsPerPixel,
        0,
        1
      );

      const gx = (dx - 12) / GLYPH_SCALE + GLYPH_CENTER.x;
      const gy = (dy - 12) / GLYPH_SCALE + GLYPH_CENTER.y;
      const markAlpha = clamp(
        0.5 - (sdMark(gx, gy) * GLYPH_SCALE) / unitsPerPixel,
        0,
        1
      );

      const t = clamp((dx + dy) / 48, 0, 1);
      const offset = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        const base = lerp(GRADIENT_FROM[c], GRADIENT_TO[c], t);
        rgba[offset + c] = Math.round(lerp(base, 255, markAlpha));
      }
      rgba[offset + 3] = Math.round(tileAlpha * 255);
    }
  }
  return rgba;
}

// --- PNG encoding ----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

export function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // color type: RGBA
  // bytes 10-12: compression, filter, interlace — all 0

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- ICO encoding ----------------------------------------------------------

export function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;
  images.forEach(({ size, png }, i) => {
    const entry = i * 16;
    directory[entry] = size >= 256 ? 0 : size;
    directory[entry + 1] = size >= 256 ? 0 : size;
    directory[entry + 2] = 0; // palette size
    directory[entry + 3] = 0; // reserved
    directory.writeUInt16LE(1, entry + 4); // color planes
    directory.writeUInt16LE(32, entry + 6); // bits per pixel
    directory.writeUInt32BE(0, entry + 8);
    directory.writeUInt32LE(png.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });

  return Buffer.concat([header, directory, ...images.map((i) => i.png)]);
}

// --- Emit ------------------------------------------------------------------

function main() {
  const icoSizes = [16, 32, 48];
  const ico = encodeIco(
    icoSizes.map((size) => ({ size, png: encodePng(size, renderIcon(size)) }))
  );
  writeFileSync(join(APP_DIR, "favicon.ico"), ico);

  const appleSize = 180;
  writeFileSync(
    join(APP_DIR, "apple-icon.png"),
    encodePng(appleSize, renderIcon(appleSize))
  );

  console.log(
    `favicon.ico (${icoSizes.join("/")}px, ${ico.length} bytes) and apple-icon.png (${appleSize}px) written to src/app`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
