/**
 * Палитры и темы оформления.
 *
 * Цвета машин и покрытия парковки задаются здесь — магазин (этап 4) просто
 * переключает активный набор.
 */

import type { CarColorKey, CarKind } from '../types';

/** Базовые цвета кузовов. Оттенки (крыша, тень, блик) считаются в рендерере. */
export type CarColorSet = Record<CarColorKey, number>;

export interface CarColorSkin {
  id: string;
  name: string;
  /** Цена в монетах; 0 — доступно сразу. */
  price: number;
  colors: CarColorSet;
}

export interface ParkingSkin {
  id: string;
  name: string;
  price: number;
  asphalt: number;
  asphaltShade: number;
  line: number;
  grass: number;
  grassDark: number;
  curb: number;
  curbDark: number;
  arrow: number;
}

export const CAR_COLOR_KEYS: CarColorKey[] = [
  'red',
  'blue',
  'green',
  'yellow',
  'orange',
  'purple',
  'teal',
  'pink',
  'silver',
  'graphite',
  'lime',
  'bronze',
];

export const CAR_COLOR_SKINS: CarColorSkin[] = [
  {
    id: 'classic',
    name: 'Классика',
    price: 0,
    colors: {
      red: 0xe23b3b,
      blue: 0x3b7fe2,
      green: 0x3fae5a,
      yellow: 0xf2c327,
      orange: 0xef8a3c,
      purple: 0x8b5cd6,
      teal: 0x2fb8b0,
      pink: 0xe86ba0,
      silver: 0xc4ccd6,
      graphite: 0x5b6672,
      lime: 0x9ccb3b,
      bronze: 0xb0784a,
    },
  },
  {
    id: 'candy',
    name: 'Карамель',
    price: 250,
    colors: {
      red: 0xff4d6d,
      blue: 0x4dabff,
      green: 0x2fd18b,
      yellow: 0xffd23f,
      orange: 0xff9f43,
      purple: 0xb06bff,
      teal: 0x24d3d3,
      pink: 0xff7ad9,
      silver: 0xd8e2ee,
      graphite: 0x6a7286,
      lime: 0xc3f04d,
      bronze: 0xd08a5a,
    },
  },
  {
    id: 'noir',
    name: 'Ночной город',
    price: 400,
    colors: {
      red: 0xc62828,
      blue: 0x2f4f9e,
      green: 0x2e7d4f,
      yellow: 0xd9a520,
      orange: 0xc96a1f,
      purple: 0x6a3fb5,
      teal: 0x1f8a92,
      pink: 0xc05a8a,
      silver: 0x9aa6b4,
      graphite: 0x3d4653,
      lime: 0x86b02f,
      bronze: 0x8a5f3b,
    },
  },
];

export const PARKING_SKINS: ParkingSkin[] = [
  {
    id: 'day',
    name: 'Дневная',
    price: 0,
    asphalt: 0x3c4450,
    asphaltShade: 0x323945,
    line: 0xe8edf5,
    grass: 0x5fa04a,
    grassDark: 0x4a8a3b,
    curb: 0xb9bcc4,
    curbDark: 0x8e929b,
    arrow: 0xf3d55a,
  },
  {
    id: 'sunset',
    name: 'Закат',
    price: 300,
    asphalt: 0x4a3b45,
    asphaltShade: 0x3d3039,
    line: 0xf6e3cf,
    grass: 0xa8763f,
    grassDark: 0x8a5f33,
    curb: 0xd0a98a,
    curbDark: 0xa98163,
    arrow: 0xffc46b,
  },
  {
    id: 'night',
    name: 'Ночная',
    price: 450,
    asphalt: 0x272c38,
    asphaltShade: 0x1e2330,
    line: 0xc9d4e6,
    grass: 0x2f4a3a,
    grassDark: 0x243a2e,
    curb: 0x7c8698,
    curbDark: 0x5b6474,
    arrow: 0x8fd6ff,
  },
];

export const DEFAULT_CAR_SKIN = 'classic';
export const DEFAULT_PARKING_SKIN = 'day';

export function getCarSkin(id: string): CarColorSkin {
  return CAR_COLOR_SKINS.find((skin) => skin.id === id) ?? CAR_COLOR_SKINS[0];
}

export function getParkingSkin(id: string): ParkingSkin {
  return PARKING_SKINS.find((skin) => skin.id === id) ?? PARKING_SKINS[0];
}

/** Пропорции кузова: длина/ширина в клетках и «лицо» машины. */
export const CAR_KIND_INFO: Record<CarKind, { label: string }> = {
  hatch: { label: 'Хэтчбек' },
  sedan: { label: 'Седан' },
  suv: { label: 'Внедорожник' },
  van: { label: 'Фургон' },
  bus: { label: 'Автобус' },
  truck: { label: 'Грузовик' },
};

/** Светлая/тёмная вариация цвета (t > 0 — светлее, t < 0 — темнее). */
export function shade(color: number, t: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const mix = (channel: number): number =>
    Math.max(0, Math.min(255, Math.round(t >= 0 ? channel + (255 - channel) * t : channel * (1 + t))));
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

/** CSS-строка цвета (для React-интерфейса). */
export function toCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
