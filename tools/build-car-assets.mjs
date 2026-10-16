/**
 * Сборка спрайтов машин из исходников (`assets/cars-src`) в игровые ассеты
 * (`public/cars`).
 *
 * Запуск: `npm run assets:cars`
 *
 * Что делает для каждого исходного PNG (исходники нарисованы сверху, носом
 * вверх, с прозрачным фоном):
 *   1. поворачивает на 90° по часовой — в игре машина «смотрит» носом вправо
 *      (вертикальные машины сцена сама поворачивает на ±90°, как и раньше);
 *   2. обрезает по видимым пикселям (alpha bbox);
 *   3. уменьшает до игрового разрешения (примерно 2× от размера на экране);
 *   4. для машин, которые бывают длиной в 3 клетки, делает вытянутый вариант:
 *      плавная горизонтальная растяжка середины кузова (нос и корма остаются
 *      целыми) — «фургон» превращается в «минивэн/автобус» без потери стиля;
 *   5. строит маску кузова (без стёкол, колёс, фар и хрома) — по ней в игре
 *      перекрашиваются наборы цветов из магазина.
 *
 * Файлы в `public/cars`: `<ключ>.png`, `<ключ>-long.png`, `<ключ>-mask.png`.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = resolve(ROOT, 'assets/cars-src');
const OUT_DIR = resolve(ROOT, 'public/cars');

/** Ширина спрайта в пикселях: 2 клетки ≈ 384 px (на экране ~200 CSS px при 2×). */
const SHORT_WIDTH = 384;
/** Длинный (3 клетки) вариант — ровно в 1.5 раза длиннее. */
const LONG_FACTOR = 1.5;
/** Порог альфы при обрезке. */
const ALPHA_CUTOFF = 12;

function readPng(path) {
  return PNG.sync.read(readFileSync(path));
}

function writePng(path, png) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, PNG.sync.write(png, { deflateLevel: 9, deflateStrategy: 3, colorType: 6 }));
}

/** Поворот на 90° по часовой: нос вверх → нос вправо. */
function rotateCw(src) {
  const { width: w, height: h, data } = src;
  const out = new PNG({ width: h, height: w });
  for (let dy = 0; dy < w; dy += 1) {
    for (let dx = 0; dx < h; dx += 1) {
      const sx = dy;
      const sy = h - 1 - dx;
      const so = (sy * w + sx) * 4;
      const do_ = (dy * h + dx) * 4;
      out.data[do_] = data[so];
      out.data[do_ + 1] = data[so + 1];
      out.data[do_ + 2] = data[so + 2];
      out.data[do_ + 3] = data[so + 3];
    }
  }
  return out;
}

/** Обрезка по видимым пикселям. */
function trim(src, cutoff = ALPHA_CUTOFF) {
  const { width: w, height: h, data } = src;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (data[(y * w + x) * 4 + 3] <= cutoff) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return src;
  const tw = maxX - minX + 1;
  const th = maxY - minY + 1;
  const out = new PNG({ width: tw, height: th });
  for (let y = 0; y < th; y += 1) {
    for (let x = 0; x < tw; x += 1) {
      const so = ((y + minY) * w + (x + minX)) * 4;
      const do_ = (y * tw + x) * 4;
      out.data[do_] = data[so];
      out.data[do_ + 1] = data[so + 1];
      out.data[do_ + 2] = data[so + 2];
      out.data[do_ + 3] = data[so + 3];
    }
  }
  return out;
}

/** Билинейная выборка с прозрачностью (картинка хранится «как есть», premultiply на месте). */
function sample(data, w, h, x, y, out) {
  const cx = Math.max(0, Math.min(w - 1.001, x));
  const cy = Math.max(0, Math.min(h - 1.001, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = cx - x0;
  const fy = cy - y0;
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (const [px, py, weight] of [
    [x0, y0, (1 - fx) * (1 - fy)],
    [x1, y0, fx * (1 - fy)],
    [x0, y1, (1 - fx) * fy],
    [x1, y1, fx * fy],
  ]) {
    if (weight <= 0) continue;
    const o = (py * w + px) * 4;
    const alpha = data[o + 3] / 255;
    r += data[o] * alpha * weight;
    g += data[o + 1] * alpha * weight;
    b += data[o + 2] * alpha * weight;
    a += alpha * weight;
  }
  if (a <= 0.0001) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    return;
  }
  out[0] = Math.min(255, Math.round(r / a));
  out[1] = Math.min(255, Math.round(g / a));
  out[2] = Math.min(255, Math.round(b / a));
  out[3] = Math.min(255, Math.round(a * 255));
}

/** Масштабирование до нужной ширины (бикубическая выборка по площади). */
function scaleToWidth(src, targetW) {
  const { width: w, height: h, data } = src;
  const targetH = Math.max(1, Math.round((h * targetW) / w));
  const out = new PNG({ width: targetW, height: targetH });
  const px = [0, 0, 0, 0];
  for (let y = 0; y < targetH; y += 1) {
    for (let x = 0; x < targetW; x += 1) {
      // Усредняем по площади исходного пикселя — так мелкие детали не «звенят».
      const sx0 = (x * w) / targetW;
      const sx1 = ((x + 1) * w) / targetW;
      const sy0 = (y * h) / targetH;
      const sy1 = ((y + 1) * h) / targetH;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      const steps = 3;
      for (let iy = 0; iy < steps; iy += 1) {
        for (let ix = 0; ix < steps; ix += 1) {
          sample(
            data,
            w,
            h,
            sx0 + ((ix + 0.5) / steps) * (sx1 - sx0),
            sy0 + ((iy + 0.5) / steps) * (sy1 - sy0),
            px,
          );
          const alpha = px[3] / 255;
          r += px[0] * alpha;
          g += px[1] * alpha;
          b += px[2] * alpha;
          a += alpha;
          count += 1;
        }
      }
      const o = (y * targetW + x) * 4;
      if (a <= 0.0001) {
        out.data[o] = 0;
        out.data[o + 1] = 0;
        out.data[o + 2] = 0;
        out.data[o + 3] = 0;
        continue;
      }
      out.data[o] = Math.min(255, Math.round(r / a));
      out.data[o + 1] = Math.min(255, Math.round(g / a));
      out.data[o + 2] = Math.min(255, Math.round(b / a));
      out.data[o + 3] = Math.min(255, Math.round((a / count) * 255));
    }
  }
  return out;
}

/**
 * Растяжка по горизонтали с плавным распределением: края (нос и корма) почти
 * не трогаем, середина удлиняется сильнее. Это даёт «автобус» из «фургона»
 * без изломов и без обрезанных фар.
 */
function stretchLong(src, factor) {
  const { width: w, height: h, data } = src;
  const targetW = Math.round(w * factor);
  const out = new PNG({ width: targetW, height: h });

  // Вес растяжения w(t) = 1 + a·sin²(πt), средний вес = 1 + a/2 = factor.
  const a = Math.max(0, (factor - 1) * 2);
  const steps = 512;
  const cumulative = new Float64Array(steps + 1);
  for (let i = 1; i <= steps; i += 1) {
    const t = (i - 0.5) / steps;
    const weight = 1 + a * Math.sin(Math.PI * t) ** 2;
    cumulative[i] = cumulative[i - 1] + weight / steps;
  }
  const total = cumulative[steps];
  const sourceAt = (t) => {
    const pos = t * steps;
    const i0 = Math.min(steps - 1, Math.floor(pos));
    const frac = pos - i0;
    const value = cumulative[i0] + (cumulative[i0 + 1] - cumulative[i0]) * frac;
    return (value / total) * (w - 1);
  };

  const px = [0, 0, 0, 0];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < targetW; x += 1) {
      const t = (x + 0.5) / targetW;
      const sx = sourceAt(t);
      sample(data, w, h, sx, y + 0.5, px);
      const o = (y * targetW + x) * 4;
      out.data[o] = px[0];
      out.data[o + 1] = px[1];
      out.data[o + 2] = px[2];
      out.data[o + 3] = px[3];
    }
  }
  return out;
}

function toHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 0.0001) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Маска кузова: непрозрачно там, где краска, прозрачно там, где стекло, шины,
 * фары, хром и обводка. Для цветных машин краска опознаётся по основному
 * оттенку, для белых и серых — по светлоте.
 */
function buildMask(src) {
  const { width: w, height: h, data } = src;
  const bins = new Float64Array(72);
  let opaque = 0;
  let chromatic = 0;
  for (let i = 0; i < w * h; i += 1) {
    const o = i * 4;
    const alpha = data[o + 3];
    if (alpha <= 90) continue;
    opaque += 1;
    const [hue, s, l] = toHsl(data[o], data[o + 1], data[o + 2]);
    if (s > 0.22 && l > 0.16 && l < 0.95) {
      bins[Math.round(hue / 5) % 72] += s;
      chromatic += s;
    }
  }
  let mainHue = 0;
  let mainWeight = 0;
  for (let i = 0; i < bins.length; i += 1) {
    if (bins[i] > mainWeight) {
      mainWeight = bins[i];
      mainHue = i * 5;
    }
  }
  const useHue = chromatic / Math.max(1, opaque) > 0.12;

  const mask = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i += 1) {
    const o = i * 4;
    const alpha = data[o + 3];
    if (alpha === 0) continue;
    const [hue, s, l] = toHsl(data[o], data[o + 1], data[o + 2]);
    let paint = false;
    if (useHue) {
      paint = hueDistance(hue, mainHue) < 45 && s > 0.13 && l > 0.22 && !(s > 0.45 && l < 0.3);
    } else {
      paint = l > 0.55 && s < 0.35;
    }
    if (!paint) continue;
    mask.data[o] = 255;
    mask.data[o + 1] = 255;
    mask.data[o + 2] = 255;
    mask.data[o + 3] = 255;
  }
  return mask;
}

/** Ключ спрайта → исходник + нужен ли «длинный» вариант. */
const SPRITES = [
  { key: 'sport-purple', source: 'vehicle1.png', long: false },
  { key: 'box-blue', source: 'vehicle2.png', long: true },
  { key: 'sedan-beige', source: 'vehicle3.png', long: false },
  { key: 'sport-white', source: 'vehicle4.png', long: false },
  { key: 'compat-orange', source: 'vehicle5.png', long: false },
  { key: 'target-red', source: 'vehicle6.png', long: false },
  { key: 'suv-brown', source: 'vehicle7.png', long: true },
  { key: 'bus-green', source: 'vehicle8.png', long: true },
  { key: 'van-taupe', source: 'vehicle9.png', long: true },
];

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const report = [];
  for (const sprite of SPRITES) {
    const from = resolve(SRC_DIR, sprite.source);
    if (!existsSync(from)) {
      console.warn(`нет исходника ${sprite.source} — пропускаю ${sprite.key}`);
      continue;
    }
    const raw = trim(rotateCw(readPng(from)));
    const short = scaleToWidth(raw, SHORT_WIDTH);
    writePng(resolve(OUT_DIR, `${sprite.key}.png`), short);
    writePng(resolve(OUT_DIR, `${sprite.key}-mask.png`), buildMask(short));

    let longInfo = '—';
    if (sprite.long) {
      const long = stretchLong(scaleToWidth(raw, SHORT_WIDTH), LONG_FACTOR);
      writePng(resolve(OUT_DIR, `${sprite.key}-long.png`), long);
      writePng(resolve(OUT_DIR, `${sprite.key}-long-mask.png`), buildMask(long));
      longInfo = `${long.width}x${long.height}`;
    }
    report.push(
      `${sprite.key.padEnd(15)} ${short.width}x${short.height}  длинный: ${longInfo}  (из ${sprite.source})`,
    );
  }
  console.log(report.join('\n'));
  console.log(`\nГотово: ${report.length} спрайтов → public/cars`);
}

main();
