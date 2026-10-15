/**
 * Отрисовка автомобиля «сверху» средствами Graphics.
 *
 * Никаких внешних ассетов: весь транспорт рисуется кодом, поэтому графика
 * остаётся векторно-чёткой на любом DPI и легко перекрашивается под тему.
 *
 * Локальная система координат: автомобиль стоит «носом вправо», центр — (0,0),
 * длина вдоль оси X, ширина вдоль оси Y.
 */

import Phaser from 'phaser';
import type { CarKind } from '../types';
import { shade } from '../theme/palettes';

export interface CarDrawOptions {
  kind: CarKind;
  /** Основной цвет кузова. */
  color: number;
  /** Длина в клетках (2..4). */
  length: number;
  /** Размер клетки в пикселях. */
  cell: number;
  target?: boolean;
}

interface BodyGeometry {
  width: number;
  height: number;
}

function roundRect(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  w: number,
  h: number,
  r: number,
  color: number,
  alpha = 1,
): void {
  g.fillStyle(color, alpha);
  g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, Math.max(2, r));
}

function strokeRoundRect(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  w: number,
  h: number,
  r: number,
  color: number,
  alpha = 1,
  lineWidth = 2,
): void {
  g.lineStyle(lineWidth, color, alpha);
  g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, Math.max(2, r));
}

/** Размеры «кабин» и окон для разных типов кузова. */
function cabinRatios(kind: CarKind): { start: number; end: number } {
  switch (kind) {
    case 'bus':
      return { start: -0.46, end: 0.44 };
    case 'van':
      return { start: -0.42, end: 0.3 };
    case 'truck':
      return { start: 0.02, end: 0.36 };
    case 'suv':
      return { start: -0.38, end: 0.16 };
    case 'hatch':
      return { start: -0.36, end: 0.1 };
    case 'sedan':
    default:
      return { start: -0.32, end: 0.12 };
  }
}

/**
 * Нарисовать автомобиль в существующий Graphics (центр — в (0,0)).
 * Возвращает габариты кузова.
 */
export function drawCarInto(g: Phaser.GameObjects.Graphics, options: CarDrawOptions): BodyGeometry {
  const { kind, color, length, cell, target } = options;
  const bodyW = length * cell - cell * 0.12;
  const bodyH = cell - cell * 0.16;
  const halfW = bodyW / 2;
  const halfH = bodyH / 2;
  const radius = Math.min(cell * 0.26, bodyH * 0.36);

  const dark = shade(color, -0.42);
  const light = shade(color, 0.26);
  const roof = shade(color, -0.1);
  const glass = 0x27374d;
  const glassLight = 0x4a6b8f;

  // 1. Колёса (рисуются под кузовом и чуть выглядывают по бокам).
  const wheelW = Math.max(cell * 0.17, 5);
  const wheelH = Math.max(cell * 0.1, 3);
  const wheelColor = 0x1c2027;
  const axleInset = Math.min(halfW * 0.72, cell * 0.62);
  const axles: number[] = length >= 3 ? [-axleInset, 0, axleInset] : [-axleInset, axleInset];
  g.fillStyle(wheelColor, 1);
  for (const axleX of axles) {
    for (const side of [-1, 1]) {
      g.fillRoundedRect(
        axleX - wheelW / 2,
        side * halfH - wheelH / 2 + side * wheelH * 0.32,
        wheelW,
        wheelH,
        wheelH / 2,
      );
    }
  }

  // 2. Корпус.
  roundRect(g, 0, 0, bodyW, bodyH, radius, color, 1);
  // Тень по нижнему краю — объём.
  g.fillStyle(shade(color, -0.3), 0.35);
  g.fillRoundedRect(-halfW, halfH * 0.28, bodyW, halfH * 0.72, radius * 0.9);
  // Блик сверху.
  g.fillStyle(light, 0.5);
  g.fillRoundedRect(-halfW + bodyW * 0.03, -halfH + bodyH * 0.06, bodyW * 0.94, bodyH * 0.28, radius * 0.8);
  strokeRoundRect(g, 0, 0, bodyW, bodyH, radius, dark, 0.85, Math.max(1.5, cell * 0.035));

  // 3. Кабина и стёкла.
  const { start, end } = cabinRatios(kind);
  const cabinX = ((start + end) / 2) * bodyW;
  const cabinW = (end - start) * bodyW;
  const cabinH = bodyH * (kind === 'bus' || kind === 'van' ? 0.8 : 0.72);

  if (kind === 'truck') {
    // Кузов-фургон и отдельная кабина.
    roundRect(g, -bodyW * 0.22, 0, bodyW * 0.5, bodyH * 0.86, radius * 0.55, shade(color, -0.16), 1);
    g.lineStyle(Math.max(1, cell * 0.02), shade(color, -0.4), 0.6);
    g.strokeRoundedRect(-bodyW * 0.47, -bodyH * 0.43, bodyW * 0.5, bodyH * 0.86, radius * 0.55);
    roundRect(g, cabinX, 0, cabinW, cabinH, radius * 0.6, roof, 1);
  } else if (kind === 'bus' || kind === 'van') {
    roundRect(g, cabinX, 0, cabinW, cabinH, radius * 0.7, roof, 1);
  } else {
    roundRect(g, cabinX, 0, cabinW, cabinH, radius * 0.75, roof, 1);
  }

  // Лобовое и заднее стекло.
  const windshieldW = Math.max(cabinW * 0.34, cell * 0.16);
  const windshieldH = cabinH * 0.86;
  const frontX = cabinX + cabinW / 2 - windshieldW / 2;
  const rearX = cabinX - cabinW / 2 + windshieldW / 2;
  roundRect(g, frontX, 0, windshieldW, windshieldH, windshieldW * 0.3, glass, 0.92);
  g.fillStyle(glassLight, 0.35);
  g.fillRoundedRect(
    frontX - windshieldW * 0.42,
    -windshieldH / 2 + windshieldH * 0.08,
    windshieldW * 0.4,
    windshieldH * 0.35,
    windshieldW * 0.2,
  );
  roundRect(g, rearX, 0, windshieldW * 0.7, windshieldH * 0.82, windshieldW * 0.22, glass, 0.85);

  // Боковые окна (у автобуса и фургона — во всю длину).
  if (kind === 'bus' || kind === 'van') {
    const windowCount = Math.max(2, Math.round(cabinW / (cell * 0.5)));
    for (let i = 0; i < windowCount; i += 1) {
      const t = (i + 0.5) / windowCount;
      const wx = cabinX - cabinW / 2 + t * cabinW;
      for (const side of [-1, 1]) {
        g.fillStyle(glass, 0.75);
        g.fillRoundedRect(
          wx - cabinW / (windowCount * 4),
          side * (cabinH / 2) - Math.sign(side) * cabinH * 0.16,
          cabinW / (windowCount * 2),
          cabinH * 0.14,
          2,
        );
      }
    }
  }

  // 4. Оптика: фары спереди, стоп-сигналы сзади.
  const lightW = Math.max(cell * 0.13, 4);
  const lightH = Math.max(cell * 0.14, 4);
  for (const side of [-1, 1]) {
    roundRect(g, halfW - lightW * 0.65, side * (halfH - lightH * 0.75), lightW, lightH, lightH * 0.35, 0xfff2c2, 1);
    roundRect(g, -halfW + lightW * 0.65, side * (halfH - lightH * 0.75), lightW * 0.85, lightH * 0.9, lightH * 0.3, 0xd8453c, 1);
  }

  // 5. Зеркала.
  const mirrorW = Math.max(cell * 0.08, 3);
  const mirrorH = Math.max(cell * 0.06, 2);
  for (const side of [-1, 1]) {
    roundRect(
      g,
      cabinX + cabinW * 0.34,
      side * (halfH + mirrorH * 0.35),
      mirrorW,
      mirrorH,
      mirrorH * 0.4,
      shade(color, -0.5),
      1,
    );
  }

  // 6. Метка целевой машины: стрелка на капоте показывает, куда ехать.
  if (target) {
    const arrowX = halfW - cell * 0.52;
    const arrowSize = Math.max(cell * 0.16, 5);
    g.fillStyle(0xffffff, 0.92);
    g.fillTriangle(
      arrowX + arrowSize * 0.7,
      0,
      arrowX - arrowSize * 0.45,
      -arrowSize * 0.62,
      arrowX - arrowSize * 0.45,
      arrowSize * 0.62,
    );
  }

  return { width: bodyW, height: bodyH };
}

/** Мягкая тень под автомобилем (рисуется отдельным Graphics под кузовом). */
export function drawCarShadow(
  g: Phaser.GameObjects.Graphics,
  options: Pick<CarDrawOptions, 'length' | 'cell'>,
  offset = { x: 0.06, y: 0.1 },
): void {
  const { length, cell } = options;
  const bodyW = length * cell - cell * 0.12;
  const bodyH = cell - cell * 0.16;
  g.fillStyle(0x0b0f14, 0.26);
  g.fillRoundedRect(
    -bodyW / 2 + cell * offset.x,
    -bodyH / 2 + cell * offset.y,
    bodyW,
    bodyH,
    Math.min(cell * 0.26, bodyH * 0.36),
  );
}
