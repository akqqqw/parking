/**
 * Перекраска спрайтов машин под набор цветов из магазина.
 *
 * Спрайты нарисованы каждый в своём цвете, но у каждого есть маска кузова:
 * белая там, где краска, и прозрачная там, где стекло, шины, фары, хром и
 * обводка. Перекраска меняет только оттенок и насыщенность пикселей под
 * маской, а светлоту оставляет как есть — благодаря этому сохраняются блики,
 * тени и объём кузова.
 *
 * Готовые текстуры складываются в кэш Phaser по ключу `спрайт#цвет`, поэтому
 * повторные уровни с теми же цветами не пересчитываются.
 */

import Phaser from 'phaser';
import { spriteMaskKey } from './carSprites';

/** Порог альфы маски: ниже — пиксель считается «не кузовом». */
const MASK_CUTOFF = 90;

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-4) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: (h * 60) / 360, s, l };
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s < 1e-4) {
    const value = Math.round(l * 255);
    return [value, value, value];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    Math.round(hueToRgb(p, q, h) * 255),
    Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
  ];
}

interface Drawable {
  image: CanvasImageSource;
  width: number;
  height: number;
}

function drawable(scene: Phaser.Scene, key: string): Drawable | null {
  if (!scene.textures.exists(key)) return null;
  const texture = scene.textures.get(key);
  // Phaser отдаёт готовую к рисованию картинку (Image, Canvas или RenderTexture).
  const image = texture.getSourceImage() as CanvasImageSource | undefined;
  const source = texture.source[0];
  if (!image || !source?.width || !source.height) return null;
  return { image, width: source.width, height: source.height };
}

/**
 * Текстура перекрашенного спрайта. Возвращает `null`, если спрайт или маска
 * недоступны (тогда сцена просто нарисует машину вектором).
 */
export function paintedTextureKey(
  scene: Phaser.Scene,
  textureKey: string,
  color: number,
): string | null {
  const outKey = `${textureKey}#${color.toString(16)}`;
  if (scene.textures.exists(outKey)) return outKey;

  const sprite = drawable(scene, textureKey);
  const mask = drawable(scene, spriteMaskKey(textureKey));
  if (!sprite || !mask) return null;

  const width = sprite.width;
  const height = sprite.height;
  if (!width || !height || mask.width !== width || mask.height !== height) return null;

  const spriteCanvas = document.createElement('canvas');
  spriteCanvas.width = width;
  spriteCanvas.height = height;
  const spriteCtx = spriteCanvas.getContext('2d', { willReadFrequently: true });
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
  if (!spriteCtx || !maskCtx) return null;

  try {
    spriteCtx.drawImage(sprite.image, 0, 0, width, height);
    maskCtx.drawImage(mask.image, 0, 0, width, height);
    const spriteData = spriteCtx.getImageData(0, 0, width, height);
    const maskData = maskCtx.getImageData(0, 0, width, height);

    const target = rgbToHsl((color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff);
    const paintSaturation = Math.min(1, target.s * 1.15);
    const pixels = spriteData.data;
    for (let i = 0; i < pixels.length; i += 4) {
      if (maskData.data[i + 3] <= MASK_CUTOFF) continue;
      const { l } = rgbToHsl(pixels[i], pixels[i + 1], pixels[i + 2]);
      const [r, g, b] = hslToRgb(target.h, paintSaturation, l);
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
    }
    spriteCtx.putImageData(spriteData, 0, 0);
  } catch (error) {
    console.warn('Не удалось перекрасить спрайт машины', textureKey, error);
    return null;
  }

  const texture = scene.textures.createCanvas(outKey, width, height);
  if (!texture) return null;
  texture.getContext().drawImage(spriteCanvas, 0, 0);
  texture.refresh();
  return outKey;
}
