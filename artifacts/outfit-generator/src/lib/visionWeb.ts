/**
 * visionWeb.ts — canvas-based dominant colour extraction for clothing photos.
 *
 * Algorithm:
 *  1. Draw the image onto a 48×48 canvas.
 *  2. Sample 4×4 patches from each corner to detect the background colour.
 *  3. Exclude pixels within a Euclidean-distance threshold of the background.
 *  4. Map every surviving foreground pixel to a colour-name bucket.
 *  5. Return colour names that cover at least 10% of foreground pixels.
 */

const CANVAS_SIZE = 48;
const CORNER_PATCH = 4;          // pixels sampled per corner
const BG_THRESHOLD = 40;         // Euclidean RGB distance to exclude as background
const MIN_COVERAGE = 0.10;       // 10% foreground coverage threshold

/** Convert an RGB triplet to a human-readable colour name. */
function rgbToColorName(r: number, g: number, b: number): string {
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;

  if (brightness < 80)  return "black";
  if (brightness < 110) return "dark grey";
  if (brightness < 175) return "grey";
  if (brightness < 225) return "light grey";

  // Compute saturation (HSL) to decide achromatic vs. chromatic
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));

  if (sat < 0.12) return brightness >= 235 ? "white" : "beige";

  // Hue (0–360)
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const d  = max - min;
  let hue  = 0;
  if      (max === rn) hue = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) hue = ((bn - rn) / d + 2) * 60;
  else                 hue = ((rn - gn) / d + 4) * 60;

  if (brightness < 140 && sat > 0.25) {
    if (hue < 35 || hue >= 330) return "brown";
    if (hue < 75)               return "tan";
  }

  if (hue < 15 || hue >= 345) return "red";
  if (hue < 35)               return "orange";
  if (hue < 65)               return "yellow";
  if (hue < 100)              return "green";
  if (hue < 170)              return "teal";
  if (hue < 260)              return "blue";
  if (hue < 290)              return "purple";
  if (hue < 345)              return "pink";
  return "red";
}

/** Euclidean distance between two RGB points. */
function rgbDist(r1: number, g1: number, b1: number,
                 r2: number, g2: number, b2: number): number {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/** Average the RGBA samples from the four corner patches. */
function detectBackground(data: Uint8ClampedArray, width: number): [number, number, number] {
  let rSum = 0, gSum = 0, bSum = 0, count = 0;

  const corners = [
    { x0: 0,           y0: 0 },
    { x0: width - CORNER_PATCH, y0: 0 },
    { x0: 0,           y0: width - CORNER_PATCH },
    { x0: width - CORNER_PATCH, y0: width - CORNER_PATCH },
  ];

  for (const { x0, y0 } of corners) {
    for (let dy = 0; dy < CORNER_PATCH; dy++) {
      for (let dx = 0; dx < CORNER_PATCH; dx++) {
        const idx = ((y0 + dy) * width + (x0 + dx)) * 4;
        if (data[idx + 3] < 128) continue; // skip transparent
        rSum += data[idx];
        gSum += data[idx + 1];
        bSum += data[idx + 2];
        count++;
      }
    }
  }

  if (count === 0) return [255, 255, 255];
  return [Math.round(rSum / count), Math.round(gSum / count), Math.round(bSum / count)];
}

/**
 * Extract dominant foreground colours from a data URL (JPEG or PNG).
 * Returns an array of colour name strings (may be empty if no image / all background).
 */
export async function extractColorsFromDataUrl(dataUrl: string): Promise<string[]> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width  = CANVAS_SIZE;
          canvas.height = CANVAS_SIZE;
          const ctx = canvas.getContext("2d");
          if (!ctx) { resolve([]); return; }

          ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
          const { data } = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);

          const [bgR, bgG, bgB] = detectBackground(data, CANVAS_SIZE);

          const freq: Record<string, number> = {};
          let fgCount = 0;

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
            if (a < 128) continue;
            if (rgbDist(r, g, b, bgR, bgG, bgB) < BG_THRESHOLD) continue;

            fgCount++;
            const name = rgbToColorName(r, g, b);
            freq[name] = (freq[name] ?? 0) + 1;
          }

          if (fgCount === 0) { resolve([]); return; }

          const results = Object.entries(freq)
            .filter(([, n]) => n / fgCount >= MIN_COVERAGE)
            .sort((a, b) => b[1] - a[1])
            .map(([name]) => name);

          resolve(results);
        } catch {
          resolve([]);
        }
      };
      img.onerror = () => resolve([]);
      img.src = dataUrl;
    } catch {
      resolve([]);
    }
  });
}
