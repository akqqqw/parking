/**
 * Мостик между палитрами (данные) и Phaser (рендер).
 */

import type { CarColorKey } from '../types';
import type { CarColorSkin, ParkingSkin } from '../theme/palettes';

/** Цвет кузова из активного набора. */
export function realColor(skin: CarColorSkin, key: CarColorKey): number {
  return skin.colors[key] ?? skin.colors.blue;
}

/** Фон сцены (газон вокруг парковки). */
export function sceneBackground(skin: ParkingSkin): number {
  return skin.grass;
}

/** Цвета интерфейса подсказок внутри сцены. */
export const SCENE_COLORS = {
  hint: 0x7ff0a5,
  danger: 0xff6b6b,
  exitArrow: 0xffd257,
  text: 0xf2f6fb,
} as const;
