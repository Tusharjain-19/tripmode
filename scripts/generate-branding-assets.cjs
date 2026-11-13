const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

// Helper: point in triangle/polygon test
function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const v0x = cx - ax, v0y = cy - ay;
  const v1x = bx - ax, v1y = by - ay;
  const v2x = px - ax, v2y = py - ay;
  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;
  const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
  return (u >= 0) && (v >= 0) && (u + v <= 1);
}

// Check point in arrowhead (two triangles: tip-right-bottomcenter, tip-bottomcenter-left)
function pointInArrow(px, py, tipX, tipY, rightX, rightY, notchX, notchY, leftX, leftY) {
  return pointInTriangle(px, py, tipX, tipY, rightX, rightY, notchX, notchY) ||
         pointInTriangle(px, py, tipX, tipY, notchX, notchY, leftX, leftY);
}

// Distance to rounded rectangle (squircle)
function distToRoundRect(px, py, w, h, rx) {
  const qx = Math.abs(px - w / 2) - (w / 2 - rx);
  const qy = Math.abs(py - h / 2) - (h / 2 - rx);
  const outsideDist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const insideDist = Math.min(Math.max(qx, qy), 0);
  return (outsideDist + insideDist) - rx;
}

// Render Trip Mode Convoy Icon of given width & height
function renderIcon(size) {
  const png = new PNG({ width: size, height: size });
  const scale = size / 120;
  const rx = 28 * scale;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      const d = distToRoundRect(x + 0.5, y + 0.5, size, size, rx);

      if (d > 0.5) {
        // Transparent outside
        png.data[idx] = 0;
        png.data[idx + 1] = 0;
        png.data[idx + 2] = 0;
        png.data[idx + 3] = 0;
        continue;
      }

      // Base background color: #143D30 (20, 61, 48)
      let r = 20, g = 61, b = 48, a = 255;
      if (d > -0.5) {
        // Antialias outer edge
        a = Math.round(255 * (0.5 - d));
      }

      // Coordinates mapped to 120x120 viewBox
      const vx = (x + 0.5) / scale;
      const vy = (y + 0.5) / scale;

      // Center dashed speed line: x = 60, stroke = 2
      if (Math.abs(vx - 60) <= 1.2 && vy >= 16 && vy <= 104) {
        const dash = (vy - 16) % 10;
        if (dash < 4) {
          // #F7F5F0 with opacity 0.15
          r = Math.round(r * 0.85 + 247 * 0.15);
          g = Math.round(g * 0.85 + 245 * 0.15);
          b = Math.round(b * 0.85 + 240 * 0.15);
        }
      }

      // Lead Convoy Vanguard (White #F7F5F0): Tip(60,22), Right(86,58), Notch(60,50), Left(34,58)
      if (pointInArrow(vx, vy, 60, 22, 86, 58, 60, 50, 34, 58)) {
        // Dot at center: circle cx=60, cy=40, r=3
        const distDot = Math.hypot(vx - 60, vy - 40);
        if (distDot <= 3.2) {
          r = 20; g = 61; b = 48; // Cutout inner green dot
        } else {
          r = 247; g = 245; b = 240; // Warm white
        }
      }
      // Escort Convoy Vehicle (Sky Blue #56B4E9): Tip(60,56), Right(79,80), Notch(60,73), Left(41,80)
      else if (pointInArrow(vx, vy, 60, 56, 79, 80, 60, 73, 41, 80)) {
        // Dot at cx=60, cy=67, r=2.5
        const distDot = Math.hypot(vx - 60, vy - 67);
        if (distDot <= 2.6) {
          r = 20; g = 61; b = 48;
        } else {
          r = 86; g = 180; b = 233; // Sky blue
        }
      }
      // Sweep Convoy Vehicle (Warm Amber #E69F00): Tip(60,78), Right(72,96), Notch(60,91), Left(48,96)
      else if (pointInArrow(vx, vy, 60, 78, 72, 96, 60, 91, 48, 96)) {
        r = 230; g = 159; b = 0; // Warm amber
      }

      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }

  return png;
}

// Simple 8x12 bitmap font for crisp offline text rendering in OG image
const FONT = {
  'A': [0x18,0x24,0x42,0x42,0x7E,0x42,0x42,0x42],
  'B': [0x7C,0x42,0x42,0x7C,0x42,0x42,0x7C,0x00],
  'C': [0x3C,0x42,0x40,0x40,0x40,0x42,0x3C,0x00],
  'D': [0x78,0x44,0x42,0x42,0x42,0x44,0x78,0x00],
  'E': [0x7E,0x40,0x40,0x7C,0x40,0x40,0x7E,0x00],
  'G': [0x3C,0x42,0x40,0x4E,0x42,0x42,0x3C,0x00],
  'I': [0x3C,0x18,0x18,0x18,0x18,0x18,0x3C,0x00],
  'L': [0x40,0x40,0x40,0x40,0x40,0x40,0x7E,0x00],
  'M': [0x42,0x66,0x5A,0x42,0x42,0x42,0x42,0x00],
  'N': [0x42,0x62,0x52,0x4A,0x46,0x42,0x42,0x00],
  'O': [0x3C,0x42,0x42,0x42,0x42,0x42,0x3C,0x00],
  'P': [0x7C,0x42,0x42,0x7C,0x40,0x40,0x40,0x00],
  'R': [0x7C,0x42,0x42,0x7C,0x48,0x44,0x42,0x00],
  'S': [0x3C,0x42,0x40,0x3C,0x02,0x42,0x3C,0x00],
  'T': [0x7E,0x18,0x18,0x18,0x18,0x18,0x18,0x00],
  'V': [0x42,0x42,0x42,0x42,0x42,0x24,0x18,0x00],
  ' ': [0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00],
  '-': [0x00,0x00,0x00,0x3C,0x00,0x00,0x00,0x00],
  '.': [0x00,0x00,0x00,0x00,0x00,0x18,0x18,0x00],
  '•': [0x00,0x00,0x18,0x3C,0x3C,0x18,0x00,0x00],
};

function drawText(png, text, startX, startY, pixelScale, r, g, b, a = 255) {
  let cx = startX;
  for (const ch of text.toUpperCase()) {
    const glyph = FONT[ch] || FONT[' '];
    for (let row = 0; row < 8; row++) {
      const bits = glyph[row] || 0;
      for (let col = 0; col < 8; col++) {
        if ((bits >> (7 - col)) & 1) {
          for (let py = 0; py < pixelScale; py++) {
            for (let px = 0; px < pixelScale; px++) {
              const x = cx + col * pixelScale + px;
              const y = startY + row * pixelScale + py;
              if (x >= 0 && x < png.width && y >= 0 && y < png.height) {
                const idx = (png.width * y + x) << 2;
                png.data[idx] = r;
                png.data[idx + 1] = g;
                png.data[idx + 2] = b;
                png.data[idx + 3] = a;
              }
            }
          }
        }
      }
    }
    cx += 8 * pixelScale + Math.round(2 * pixelScale);
  }
}

// Render 1200x630 OpenGraph Banner
function renderOgImage() {
  const width = 1200;
  const height = 630;
  const png = new PNG({ width, height });

  // Gradient background: Dark green automotive dashboard
  for (let y = 0; y < height; y++) {
    const t = y / height;
    // Top: #091C16 (9, 28, 22), Bottom: #143D30 (20, 61, 48)
    const bgR = Math.round(9 + t * 11);
    const bgG = Math.round(28 + t * 33);
    const bgB = Math.round(22 + t * 26);

    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = bgR;
      png.data[idx + 1] = bgG;
      png.data[idx + 2] = bgB;
      png.data[idx + 3] = 255;
    }
  }

  // Draw subtle road grid lines in the background
  for (let x = 80; x < width; x += 120) {
    for (let y = 0; y < height; y++) {
      if ((y % 16) < 8) {
        const idx = (width * y + x) << 2;
        png.data[idx] = Math.min(255, png.data[idx] + 8);
        png.data[idx + 1] = Math.min(255, png.data[idx + 1] + 16);
        png.data[idx + 2] = Math.min(255, png.data[idx + 2] + 12);
      }
    }
  }

  // Stamp 320x320 Convoy Icon on the left side
  const iconSize = 340;
  const iconPng = renderIcon(iconSize);
  const iconX = 90;
  const iconY = Math.round((height - iconSize) / 2);

  for (let iy = 0; iy < iconSize; iy++) {
    for (let ix = 0; ix < iconSize; ix++) {
      const srcIdx = (iconSize * iy + ix) << 2;
      const sa = iconPng.data[srcIdx + 3] / 255;
      if (sa > 0) {
        const destX = iconX + ix;
        const destY = iconY + iy;
        if (destX < width && destY < height) {
          const destIdx = (width * destY + destX) << 2;
          png.data[destIdx] = Math.round(iconPng.data[srcIdx] * sa + png.data[destIdx] * (1 - sa));
          png.data[destIdx + 1] = Math.round(iconPng.data[srcIdx + 1] * sa + png.data[destIdx + 1] * (1 - sa));
          png.data[destIdx + 2] = Math.round(iconPng.data[srcIdx + 2] * sa + png.data[destIdx + 2] * (1 - sa));
          png.data[destIdx + 3] = 255;
        }
      }
    }
  }

  // Render text on the right side
  // "TRIP MODE"
  drawText(png, "TRIP MODE", 480, 195, 9, 247, 245, 240); // 72px tall

  // "LIVE CONVOY NAVIGATION"
  drawText(png, "LIVE CONVOY NAVIGATION", 485, 290, 4, 86, 180, 233); // Sky blue

  // Pill badge: "REAL-TIME GPS • SAFE SPACING"
  // Pill background box
  const pillX = 485, pillY = 350, pillW = 540, pillH = 46;
  for (let py = pillY; py < pillY + pillH; py++) {
    for (let px = pillX; px < pillX + pillW; px++) {
      const idx = (width * py + px) << 2;
      png.data[idx] = Math.round(png.data[idx] * 0.7 + 25 * 0.3);
      png.data[idx + 1] = Math.round(png.data[idx + 1] * 0.7 + 85 * 0.3);
      png.data[idx + 2] = Math.round(png.data[idx + 2] * 0.7 + 65 * 0.3);
    }
  }
  drawText(png, "REAL-TIME GPS - SAFE SPACING", 505, 362, 3, 230, 159, 0); // Warm amber

  // Tagline: "TRAVEL TOGETHER IN SEPARATE VEHICLES"
  drawText(png, "TRAVEL TOGETHER ON ONE LIVE MAP", 485, 430, 3, 180, 210, 195);

  return png;
}

// Convert PNG to ICO file format
function createIco(pngBuffers) {
  // pngBuffers: array of { width, height, buffer }
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // icon type
  header.writeUInt16LE(count, 4); // count

  let offset = 6 + count * 16;
  const entries = [];
  const images = [];

  for (const item of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(item.width >= 256 ? 0 : item.width, 0);
    entry.writeUInt8(item.height >= 256 ? 0 : item.height, 1);
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(item.buffer.length, 8); // size
    entry.writeUInt32LE(offset, 12); // offset
    entries.push(entry);
    images.push(item.buffer);
    offset += item.buffer.length;
  }

  return Buffer.concat([header, ...entries, ...images]);
}

async function main() {
  console.log("Generating authentic Trip Mode branding assets...");

  // 1. Generate apple-touch-icon.png (180x180)
  const icon180 = renderIcon(180);
  const icon180Buf = PNG.sync.write(icon180);
  fs.writeFileSync(path.join(__dirname, "../public/apple-touch-icon.png"), icon180Buf);
  console.log("Created public/apple-touch-icon.png (180x180)");

  // 2. Generate 32x32 and 48x48 for favicon.ico
  const icon32 = renderIcon(32);
  const icon32Buf = PNG.sync.write(icon32);
  const icon48 = renderIcon(48);
  const icon48Buf = PNG.sync.write(icon48);

  const icoBuf = createIco([
    { width: 32, height: 32, buffer: icon32Buf },
    { width: 48, height: 48, buffer: icon48Buf },
  ]);
  fs.writeFileSync(path.join(__dirname, "../public/favicon.ico"), icoBuf);
  console.log("Overwrote public/favicon.ico with multi-resolution Trip Mode icon (32x32, 48x48)");

  // 3. Generate og-image.png (1200x630)
  const og = renderOgImage();
  const ogBuf = PNG.sync.write(og);
  fs.writeFileSync(path.join(__dirname, "../public/og-image.png"), ogBuf);
  console.log("Created public/og-image.png (1200x630)");

  console.log("All Lovable branding completely purged and replaced with authentic Trip Mode convoy branding!");
}

main().catch(console.error);

