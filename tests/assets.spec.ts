/**
 * Проверки спрайтов машин.
 *
 * Спрайты собираются скриптом `npm run assets:cars` из исходников в
 * `assets/cars-src`. Тесты следят за тем, чтобы код и файлы не разъехались:
 * каждый спрайт из манифеста существует, у него есть маска кузова, длинные
 * варианты ровно в 1.5 раза длиннее коротких, а машины с длиной в 3 клетки
 * получают только те спрайты, у которых вытянутый вариант есть.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CAR_SPRITE_ASSETS,
  TARGET_SPRITE,
  carSpriteKey,
  carTextureFiles,
  spriteMaskKey,
  spriteTextureKey,
} from '@/game/phaser/carSprites';
import { getAllLevels } from '@/game/levels/catalog';
import type { Car, CarKind } from '@/game/types';

const PNG_HEADER = 16;

/** Ширина и высота PNG без сторонних библиотек. */
function pngSize(path: string): { width: number; height: number } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const data = require('node:fs').readFileSync(path) as Buffer;
  return { width: data.readUInt32BE(PNG_HEADER), height: data.readUInt32BE(16 + 4) };
}

describe('спрайты машин', () => {
  it('все файлы из манифеста лежат в public/cars', () => {
    const missing: string[] = [];
    for (const asset of CAR_SPRITE_ASSETS) {
      const names = [`${asset.key}.png`, `${asset.key}-mask.png`];
      if (asset.long) names.push(`${asset.key}-long.png`, `${asset.key}-long-mask.png`);
      for (const name of names) {
        const path = resolve('public/cars', name);
        if (!existsSync(path)) missing.push(name);
      }
    }
    expect(missing).toEqual([]);
  });

  it('сцена грузит только существующие файлы', () => {
    for (const file of carTextureFiles()) {
      const path = resolve('public', file.file.replace(/^\//, ''));
      expect(existsSync(path), `нет файла для текстуры ${file.key}: ${file.file}`).toBe(true);
    }
  });

  it('спрайты имеют игровой размер, длинные — в 1.5 раза шире', () => {
    for (const asset of CAR_SPRITE_ASSETS) {
      const short = pngSize(resolve('public/cars', `${asset.key}.png`));
      expect(short.width, asset.key).toBe(384);
      expect(short.height, asset.key).toBeGreaterThan(120);
      expect(short.height, asset.key).toBeLessThan(320);
      if (asset.long) {
        const long = pngSize(resolve('public/cars', `${asset.key}-long.png`));
        expect(long.width, asset.key).toBe(576);
        expect(long.height, asset.key).toBe(short.height);
      }
    }
  });

  it('маска кузова покрывает краску и не трогает стёкла, шины и фары', () => {
    const { PNG } = require('pngjs') as typeof import('pngjs');
    const fs = require('node:fs') as typeof import('node:fs');
    for (const asset of CAR_SPRITE_ASSETS) {
      const sprite = PNG.sync.read(fs.readFileSync(resolve('public/cars', `${asset.key}.png`)));
      const mask = PNG.sync.read(
        fs.readFileSync(resolve('public/cars', `${asset.key}-mask.png`)),
      );
      let opaque = 0;
      let painted = 0;
      let darkPixels = 0;
      let darkPainted = 0;
      for (let i = 0; i < sprite.data.length; i += 4) {
        if (sprite.data[i + 3] <= 90) continue;
        opaque += 1;
        const light =
          (Math.max(sprite.data[i], sprite.data[i + 1], sprite.data[i + 2]) +
            Math.min(sprite.data[i], sprite.data[i + 1], sprite.data[i + 2])) /
          2 /
          255;
        const inMask = mask.data[i + 3] > 90;
        if (inMask) painted += 1;
        // Тёмные пиксели — это стёкла, шины и обводка: их красить нельзя.
        if (light < 0.22) {
          darkPixels += 1;
          if (inMask) darkPainted += 1;
        }
      }
      const share = painted / opaque;
      expect(share, `${asset.key}: доля кузова ${(share * 100).toFixed(1)}%`).toBeGreaterThan(0.15);
      expect(share, `${asset.key}: доля кузова ${(share * 100).toFixed(1)}%`).toBeLessThan(0.95);
      const darkShare = darkPixels > 0 ? darkPainted / darkPixels : 0;
      expect(
        darkShare,
        `${asset.key}: маска захватила ${(darkShare * 100).toFixed(1)}% тёмных пикселей`,
      ).toBeLessThan(0.2);
    }
  });

  it('длина 3 клетки получает только спрайты с вытянутым вариантом', () => {
    const kinds: CarKind[] = ['hatch', 'sedan', 'suv', 'van', 'bus', 'truck'];
    const longKeys = new Set(
      CAR_SPRITE_ASSETS.filter((asset) => asset.long).map((asset) => asset.key),
    );
    for (const kind of kinds) {
      const car: Car = {
        id: 'c1',
        kind,
        color: 'blue',
        length: 3,
        x: 0,
        y: 0,
        orientation: 'h',
      };
      for (let level = 1; level <= 100; level += 1) {
        expect(longKeys.has(carSpriteKey(car, level)), `${kind} на уровне ${level}`).toBe(true);
      }
    }
  });

  it('целевая машина всегда красная, обычные — из набора кузова', () => {
    const target: Car = {
      id: 'target',
      kind: 'suv',
      color: 'red',
      length: 2,
      x: 1,
      y: 1,
      orientation: 'h',
      target: true,
    };
    expect(carSpriteKey(target, 7)).toBe(TARGET_SPRITE);
    expect(spriteTextureKey(TARGET_SPRITE, 2)).toBe('target-red');
    expect(spriteMaskKey('target-red')).toBe('target-red-mask');

    const plain: Car = { ...target, id: 'c3', target: undefined, color: 'blue' };
    expect(carSpriteKey(plain, 7)).not.toBe(TARGET_SPRITE);
  });

  it('уровни каталога используют только длины 2 и 3 клетки', () => {
    for (const level of getAllLevels()) {
      for (const car of level.cars) {
        expect([2, 3], `уровень ${level.id}, машина ${car.id}`).toContain(car.length);
      }
    }
  });
});
