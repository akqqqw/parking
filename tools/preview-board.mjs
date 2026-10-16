/**
 * Оффлайн-превью игрового кадра: рисует парковку и машины теми же спрайтами и
 * той же математикой, что и сцена (`CarView`, `layout.carPixelPos`).
 *
 * Запуск: `node tools/preview-board.mjs <уровень> [fit|fill|stretch]`
 * Результат: `/tmp/mock-board-fill.png`. Нужен, чтобы проверять спрайты и
 * посадку машин в клетки там, где нет браузера. Логика игры здесь намеренно
 * продублирована — файл инструментальный и в бандл не попадает.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const SRC = 'public/cars';
const cache = new Map();
const load = (key) => {
  if (!cache.has(key)) cache.set(key, PNG.sync.read(readFileSync(`${SRC}/${key}.png`)));
  return cache.get(key);
};

// 1) Уровень и цвета берём из каталога, повторяя логику игры.
const generated = readFileSync('src/game/levels/generated.ts', 'utf8');
const levels = [...generated.matchAll(/id: (\d+),\s*\n\s*name: '[^']*',\s*\n\s*tier: '[^']*',\s*\n\s*par: (\d+),\s*\n\s*map: \[([^\]]+)\]/g)]
  .map(([, id, par, mapStr]) => ({
    id: Number(id),
    par: Number(par),
    map: [...mapStr.matchAll(/'([^']+)'/g)].map((m) => m[1]),
  }));

const LEVEL_ID = Number(process.argv[2] ?? 88);
const MODE = process.argv[3] ?? 'fill';

function parseLevel(def) {
  const byChar = new Map();
  def.map.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      if (!byChar.has(ch)) byChar.set(ch, []);
      byChar.get(ch).push({ x, y });
    });
  });
  const cols = def.map[0].length, rows = def.map.length;
  let exitRow = 0;
  const cars = [];
  for (const [ch, cells] of byChar) {
    const isTarget = ch === '*';
    const sameRow = cells.every((c) => c.y === cells[0].y);
    const vertical = !sameRow;
    const axis = Math.min(...cells.map((c) => (vertical ? c.y : c.x)));
    const cross = vertical ? cells[0].x : cells[0].y;
    if (isTarget) exitRow = cross;
    cars.push({
      id: isTarget ? 'target' : ch,
      length: cells.length,
      orientation: vertical ? 'v' : 'h',
      x: vertical ? cross : axis,
      y: vertical ? axis : cross,
      target: isTarget,
    });
  }
  return { cols, rows, exitRow, cars, id: def.id, par: def.par };
}

// 2) Те же правила выбора спрайта и поворота, что в игре.
function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}
const KIND_SPRITES = {
  sedan: { short: ['sedan-beige', 'sport-white', 'sport-purple'], long: ['van-taupe'] },
  hatch: { short: ['compat-orange', 'sport-purple', 'sport-white'], long: ['van-taupe'] },
  suv: { short: ['suv-brown'], long: ['suv-brown'] },
  van: { short: ['van-taupe'], long: ['van-taupe'] },
  bus: { short: ['bus-green'], long: ['bus-green'] },
  truck: { short: ['box-blue'], long: ['box-blue'] },
};
const kindsFor = (length) =>
  length >= 3 ? ['bus', 'van', 'truck', 'suv'] : ['sedan', 'hatch', 'suv', 'sedan', 'sport'];
const COLORS = {
  red: 0xe23b3b, blue: 0x3b7fe2, green: 0x3fae5a, yellow: 0xf2c327, orange: 0xef8a3c,
  purple: 0x8b5cd6, teal: 0x2fb8b0, pink: 0xe86ba0, silver: 0xc4ccd6, graphite: 0x5b6672,
  lime: 0x9ccb3b, bronze: 0xb0784a,
};
const COLOR_KEYS = Object.keys(COLORS);
function decorate(index, length) {
  const kinds = kindsFor(length);
  const kind = kinds[Math.floor(hashString(`k${index}`) % kinds.length)];
  const color = COLOR_KEYS[Math.floor(hashString(`c${index}`) % COLOR_KEYS.length)];
  return { kind: kind === 'sport' ? 'sedan' : kind, color };
}

// 3) Перекраска по маске (копия src/game/phaser/carPaint.ts).
function paint(key, color) {
  const sprite = load(key);
  const mask = load(`${key}-mask`);
  const out = new PNG({ width: sprite.width, height: sprite.height });
  sprite.data.copy(out.data);
  const tr = (color >> 16) & 255, tg = (color >> 8) & 255, tb = color & 255;
  const hsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    let h = 0, s = 0;
    if (d > 1e-4) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = (mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
    }
    return [h, s, l];
  };
  const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  const toRgb = (h, s, l) => {
    if (s < 1e-4) { const v = Math.round(l * 255); return [v, v, v]; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [Math.round(f(p, q, h + 1 / 3) * 255), Math.round(f(p, q, h) * 255), Math.round(f(p, q, h - 1 / 3) * 255)];
  };
  const [th, ts] = hsl(tr, tg, tb);
  const sat = Math.min(1, ts * 1.15);
  for (let i = 0; i < out.data.length; i += 4) {
    if (mask.data[i + 3] <= 90) continue;
    const [, , l] = hsl(out.data[i], out.data[i + 1], out.data[i + 2]);
    const [r, g, b] = toRgb(th, sat, l);
    out.data[i] = r; out.data[i + 1] = g; out.data[i + 2] = b;
  }
  return out;
}

// 4) Кадр: асфальт, разметка, выезд и машины.
const W = 900, H = 900;
const frame = new PNG({ width: W, height: H });
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const o = (y * W + x) * 4;
  frame.data[o] = 58; frame.data[o + 1] = 82; frame.data[o + 2] = 54; frame.data[o + 3] = 255;
}
function blend(dst, sx, sy, r, g, b, a) {
  if (a <= 0.004 || sx < 0 || sy < 0 || sx >= W || sy >= H) return;
  const o = (sy * W + sx) * 4, inv = 1 - a;
  dst.data[o] = r * a + dst.data[o] * inv;
  dst.data[o + 1] = g * a + dst.data[o + 1] * inv;
  dst.data[o + 2] = b * a + dst.data[o + 2] * inv;
  dst.data[o + 3] = Math.max(dst.data[o + 3], a * 255);
}
const level = parseLevel(levels.find((l) => l.id === LEVEL_ID));
const { cols, rows } = level;
const exitLaneCols = 0.85;
const frameCols = 0.3;
const cell = Math.floor(Math.min((W * 0.92) / (cols + frameCols * 2 + exitLaneCols), (H * 0.92) / (rows + frameCols * 2)));
const margin = cell * frameCols;
const boardW = cols * cell, boardH = rows * cell;
const boardX = Math.round((W - (boardW + margin * 2 + cell * exitLaneCols)) / 2 + margin);
const boardY = Math.round((H - (boardH + margin * 2)) / 2 + margin);

// газон и асфальт
for (let y = 0; y < boardH + margin * 2; y++) for (let x = 0; x < boardW + margin * 2; x++)
  blend(frame, boardX - margin + x, boardY - margin + y, 44, 62, 48, 1);
for (let y = 0; y < boardH; y++) for (let x = 0; x < boardW; x++)
  blend(frame, boardX + x, boardY + y, 66, 70, 78, 1);
// разметка мест
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  const px = boardX + c * cell, py = boardY + r * cell;
  for (let i = 0; i < cell; i++) {
    blend(frame, px, py + i, 210, 214, 220, 0.5);
    blend(frame, px + i, py, 210, 214, 220, 0.5);
  }
}
// выезд: проём и стрелка
const exitY = boardY + level.exitRow * cell;
for (let y = 0; y < cell; y++) for (let x = 0; x < cell * exitLaneCols; x++)
  blend(frame, boardX + boardW + x, exitY + y, 40, 44, 52, 1);
for (let i = 0; i < Math.round(cell * 0.4); i++)
  for (let w = -i; w <= i; w++) blend(frame, boardX + boardW + Math.round(cell * 0.25) + i, exitY + Math.round(cell / 2) + w, 255, 210, 87, 0.9);

// 5) Машины: та же вписываемость и поворот, что в CarView.
function drawSprite(img, cx, cy, angleDeg, flipX) {
  const rad = (angleDeg * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  const dw = img.width, dh = img.height;
  const halfDiag = Math.ceil(Math.hypot(dw, dh) / 2) + 2;
  for (let dy = -halfDiag; dy <= halfDiag; dy++) for (let dx = -halfDiag; dx <= halfDiag; dx++) {
    const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
    const sx = (flipX ? -lx : lx) + dw / 2, sy = ly + dh / 2;
    if (sx < 0 || sy < 0 || sx >= dw || sy >= dh) continue;
    const o = (Math.floor(sy) * dw + Math.floor(sx)) * 4;
    const a = img.data[o + 3] / 255;
    blend(frame, Math.round(cx + dx), Math.round(cy + dy), img.data[o], img.data[o + 1], img.data[o + 2], a);
  }
}
const occupancy = new Map();
level.cars.forEach((car, index) => {
  const decorated = car.target ? { kind: 'suv', color: 'red' } : decorate(`${level.id}:${car.id}:${index}`, car.length);
  const kind = decorated.kind;
  const set = KIND_SPRITES[kind];
  const candidates = car.length >= 3 ? set.long : set.short;
  const spriteKey = car.target
    ? 'target-red'
    : candidates[hashString(`${level.id}:${car.id}:${kind}`) % candidates.length];
  const textureKey = car.length >= 3 ? `${spriteKey}-long` : spriteKey;
  const base = load(textureKey);
  const texture = car.target ? base : paint(textureKey, COLORS[decorated.color] ?? COLORS.blue);
  const aspect = base.width / base.height;
  const maxW = car.length * cell - cell * 0.06, maxH = cell * 0.94;
  let dw, dh;
  if (MODE === 'stretch') {
    dw = maxW; dh = maxH;
  } else if (MODE === 'fill') {
    // заполняем длину клеток, ширину ограничиваем чуть больше клетки
    const capH = cell * 1.06;
    dw = maxW; dh = dw / aspect;
    if (dh > capH) { dh = capH; dw = dh * aspect; }
  } else {
    dw = maxW; dh = dw / aspect;
    if (dh > maxH) { dh = maxH; dw = dh * aspect; }
  }
  // как в CarView: спрайт вписывается в габарит, затем масштабируется
  const scaled = new PNG({ width: Math.round(dw), height: Math.round(dh) });
  for (let y = 0; y < scaled.height; y++) for (let x = 0; x < scaled.width; x++) {
    const sx = Math.min(texture.width - 1, Math.floor((x / scaled.width) * texture.width));
    const sy = Math.min(texture.height - 1, Math.floor((y / scaled.height) * texture.height));
    const o = (sy * texture.width + sx) * 4, d = (y * scaled.width + x) * 4;
    scaled.data[d] = texture.data[o]; scaled.data[d + 1] = texture.data[o + 1];
    scaled.data[d + 2] = texture.data[o + 2]; scaled.data[d + 3] = texture.data[o + 3];
  }
  const vertical = car.orientation === 'v';
  const facing = car.target ? 'right' : hashString(`${level.id}:${car.id}`) % 2 === 0 ? 'right' : 'left';
  // как в layout.carPixelPos: центр по оси машины, поперёк — середина её полосы
  const centre = car.length / 2;
  const cx = vertical ? boardX + (car.x + 0.5) * cell : boardX + (car.x + centre) * cell;
  const cy = vertical ? boardY + (car.y + centre) * cell : boardY + (car.y + 0.5) * cell;
  const angle = vertical ? (facing === 'right' ? -90 : 90) : 0;
  drawSprite(scaled, cx, cy, angle, !vertical && facing === 'left');
  // Тело машины = 96% непрозрачных пикселей (убирает тонкие зеркала и антенны).
  const rows = [], colsMass = [];
  for (let y = 0; y < scaled.height; y++) {
    let mass = 0;
    for (let x = 0; x < scaled.width; x++) mass += scaled.data[(y * scaled.width + x) * 4 + 3] > 90 ? 1 : 0;
    rows.push(mass);
  }
  const maxRow = Math.max(...rows) || 1;
  let top = 0, bottom = rows.length - 1;
  while (top < rows.length && rows[top] < maxRow * 0.04) top++;
  while (bottom > top && rows[bottom] < maxRow * 0.04) bottom--;
  const cellW = car.length * cell, cellH = cell;
  const bodyH = bottom - top + 1;
  occupancy.set(car.id, {
    car, kind, spriteKey,
    draw: `${Math.round(dw)}x${Math.round(dh)}`,
    bodyLenPct: Math.round((dw / cellW) * 100),
    bodyWidthPct: Math.round((bodyH / cellH) * 100),
  });
});
const outPath = process.env.OUT ?? `/tmp/mock-board-${MODE}.png`;
writeFileSync(outPath, PNG.sync.write(frame));
console.log(`уровень ${level.id} (${cols}x${rows}, пар ${level.par}), клетка ${cell.toFixed(1)}px, машин ${level.cars.length}`);
for (const [, info] of occupancy) {
  console.log(`  ${String(info.car.id).padEnd(7)} ${info.car.orientation}${info.car.length} → ${info.spriteKey.padEnd(14)} ${info.draw.padEnd(9)} длина ${String(info.bodyLenPct).padStart(3)}% Width ${String(info.bodyWidthPct).padStart(3)}% клетки`);
}
