/**
 * Спрайты машин: какие файлы грузим и какому кузову какой спрайт достаётся.
 *
 * Картинки лежат в `public/cars` и собираются из исходников скриптом
 * `npm run assets:cars` (см. `tools/build-car-assets.mjs`). Для каждого спрайта
 * есть три файла: короткий (`<ключ>.png`, длина 2 клетки), вытянутый
 * (`<ключ>-long.png`, длина 3 клетки) и маска кузова (`-mask.png`) — по маске
 * в игре перекрашиваются наборы цветов из магазина.
 *
 * Если спрайта нет или он не загрузился, сцена рисует машину вектором
 * (`drawCar.ts`) — игра остаётся играбельной без единой картинки.
 */

import type { Car, CarKind } from '../types';
import { hashString } from '../rng';

export interface CarSpriteAsset {
  /** Ключ файла в `public/cars`. */
  key: string;
  /** Есть ли вытянутый вариант для машин длиной 3 клетки. */
  long: boolean;
}

/** Все спрайты набора (порядок не важен, важен состав). */
export const CAR_SPRITE_ASSETS: CarSpriteAsset[] = [
  { key: 'sport-purple', long: false },
  { key: 'box-blue', long: true },
  { key: 'sedan-beige', long: false },
  { key: 'sport-white', long: false },
  { key: 'compat-orange', long: false },
  { key: 'target-red', long: false },
  { key: 'suv-brown', long: true },
  { key: 'bus-green', long: true },
  { key: 'van-taupe', long: true },
];

/** Целевая машина всегда красная — для неё отдельный спрайт. */
export const TARGET_SPRITE = 'target-red';

/**
 * Кузов → подходящие спрайты. В списке `long` только те, у которых есть
 * вытянутый вариант: машина длиной 3 клетки обязана получить именно его.
 */
const KIND_SPRITES: Record<CarKind, { short: string[]; long: string[] }> = {
  sedan: { short: ['sedan-beige', 'sport-white', 'sport-purple'], long: ['van-taupe'] },
  hatch: { short: ['compat-orange', 'sport-purple', 'sport-white'], long: ['van-taupe'] },
  suv: { short: ['suv-brown'], long: ['suv-brown'] },
  van: { short: ['van-taupe'], long: ['van-taupe'] },
  bus: { short: ['bus-green'], long: ['bus-green'] },
  truck: { short: ['box-blue'], long: ['box-blue'] },
};

/**
 * Ключ спрайта для конкретной машины.
 *
 * Выбор детерминированный (номер уровня + id машины), поэтому у игрока и в
 * сохранении одна и та же расстановка выглядит одинаково, а соседние машины
 * одного типа не превращаются в близнецов.
 */
export function carSpriteKey(car: Car, levelId: number): string {
  if (car.target) return TARGET_SPRITE;
  const set = KIND_SPRITES[car.kind];
  const candidates = car.length >= 3 ? set.long : set.short;
  const index = hashString(`${levelId}:${car.id}:${car.kind}`) % candidates.length;
  return candidates[index];
}

/** Ключ текстуры в Phaser для спрайта нужной длины. */
export function spriteTextureKey(spriteKey: string, length: number): string {
  if (length < 3) return spriteKey;
  return `${spriteKey}-long`;
}

/** Ключ текстуры маски кузова. */
export function spriteMaskKey(textureKey: string): string {
  return `${textureKey}-mask`;
}

/**
 * Базовый адрес статики: в дев-режиме `/`, в собранной игре — путь от
 * `index.html` (сборка использует `base: './'`), поэтому спрайты находятся
 * и при хостинге в подпапке.
 */
export function assetsBase(): string {
  const base = import.meta.env?.BASE_URL ?? '/';
  return base.endsWith('/') ? base : `${base}/`;
}

/** Все текстуры, которые сцена грузит заранее (спрайты + маски). */
export function carTextureFiles(): Array<{ key: string; file: string }> {
  const files: Array<{ key: string; file: string }> = [];
  const base = assetsBase();
  for (const asset of CAR_SPRITE_ASSETS) {
    files.push({ key: asset.key, file: `${base}cars/${asset.key}.png` });
    files.push({ key: spriteMaskKey(asset.key), file: `${base}cars/${asset.key}-mask.png` });
    if (asset.long) {
      files.push({ key: `${asset.key}-long`, file: `${base}cars/${asset.key}-long.png` });
      files.push({
        key: spriteMaskKey(`${asset.key}-long`),
        file: `${base}cars/${asset.key}-long-mask.png`,
      });
    }
  }
  return files;
}
