/**
 * Каталог уровней.
 *
 * Карты хранятся в текстовом виде (см. `parse.ts`), «косметика» (тип кузова и
 * цвет) назначается детерминированно из номера уровня — так уровни выглядят
 * одинаково у всех игроков, и это не нужно хранить в сохранении.
 */

import { GENERATED_LEVELS } from './generated';
import { getCustomLevel } from './custom';
import { buildLevel, type CarShape } from './parse';
import { mulberry32, shuffle } from '../rng';
import { CAR_COLOR_KEYS } from '../theme/palettes';
import type { Car, CarColorKey, CarKind, Level } from '../types';
import { validateArrangement } from '../core/rules';
import { solve } from '../core/solver';

export type LevelTier = 'tutorial' | 'easy' | 'medium' | 'hard' | 'expert' | 'master';

export interface LevelDef {
  id: number;
  name: string;
  tier: LevelTier;
  map: string[];
  /** Минимальное число ходов; если не указано — считается решателем на лету. */
  par?: number;
}

export const TIERS: Record<LevelTier, { label: string; from: number; to: number }> = {
  tutorial: { label: 'Обучение', from: 1, to: 10 },
  easy: { label: 'Легко', from: 11, to: 25 },
  medium: { label: 'Средне', from: 26, to: 45 },
  hard: { label: 'Сложно', from: 46, to: 65 },
  expert: { label: 'Очень сложно', from: 66, to: 85 },
  master: { label: 'Эксперт', from: 86, to: 100 },
};

/** Первые уровни — этап 1 (ручная расстановка, проверены решателем). */
const HAND_LEVELS: LevelDef[] = [
  {
    id: 1,
    name: 'Первые шаги',
    tier: 'tutorial',
    map: ['...a..', '...a..', '.**a..', '......', 'bb....', '....ee'],
  },
  {
    id: 2,
    name: 'Дай дорогу',
    tier: 'tutorial',
    map: ['...a..', '...a..', '.**a..', '..cc..', '......', '......'],
  },
  {
    id: 3,
    name: 'Вверх и вниз',
    tier: 'tutorial',
    map: ['..cc..', '..A...', '**AB..', '...B..', '...dd.', '......'],
  },
  {
    id: 4,
    name: 'Утренняя пробка',
    tier: 'tutorial',
    map: ['...gg.', '..C..G', '**CD.G', '..ED..', '..ED..', '...ff.'],
  },
  {
    id: 5,
    name: 'Полная парковка',
    tier: 'tutorial',
    map: ['..BB..', '...A.C', '**.A.C', '...A.C', '..ddd.', 'ee....'],
  },
];

/** Назначение внешнего вида: детерминированно от номера уровня. */
function decorateFactory(levelId: number) {
  const random = mulberry32((0x9e3779b9 ^ Math.imul(levelId, 2654435761)) >>> 0);
  const colorQueue = shuffle(random, CAR_COLOR_KEYS);

  return (shape: CarShape, index: number): Pick<Car, 'kind' | 'color'> => {
    if (shape.target) {
      return { kind: shape.length >= 3 ? 'van' : 'suv', color: 'red' };
    }
    const kinds: CarKind[] =
      shape.length >= 4
        ? ['bus', 'truck', 'van']
        : shape.length === 3
          ? ['bus', 'van', 'truck', 'suv']
          : ['sedan', 'hatch', 'suv', 'sedan'];
    const kind = kinds[Math.floor(random() * kinds.length) % kinds.length];
    const color: CarColorKey = colorQueue[index % colorQueue.length];
    return { kind, color };
  };
}

const PAR_FALLBACK = 12;

let allLevelsCache: Level[] | null = null;

/** Собранные уровни (мемоизированы: сборка 100 уровней не должна повторяться). */
export function getAllLevels(): Level[] {
  if (allLevelsCache) return allLevelsCache;
  allLevelsCache = levelDefs().map((def) => {
    const { level, errors } = buildLevel(def.id, def.name, def.map, decorateFactory(def.id), def.par);
    if (errors.length > 0) {
      console.warn(`Уровень ${def.id} «${def.name}»: ${errors.join('; ')}`);
    }
    return level;
  });
  return allLevelsCache;
}

const levelsById = new Map<number, Level>();

/** Применить ручную правку из админ-панели поверх исходного уровня. */
function withCustomLevel(def: LevelDef): LevelDef {
  const custom = getCustomLevel(def.id);
  if (!custom) return def;
  return {
    ...def,
    name: custom.name || def.name,
    map: custom.map,
    par: custom.par ?? def.par,
  };
}

/**
 * Список описаний уровней: ручные обучающие 1–5 плюс сгенерированные 6–100.
 *
 * Дубликаты отбрасываются: если генератор когда-нибудь снова начнёт нумерацию
 * с единицы, ручные уровни всё равно останутся первыми и не «перезатрутся».
 * Уровни, изменённые в скрытой админ-панели, подменяют исходные.
 */
export function levelDefs(): LevelDef[] {
  const taken = new Set(HAND_LEVELS.map((level) => level.id));
  return [...HAND_LEVELS, ...GENERATED_LEVELS.filter((level) => !taken.has(level.id))].map(
    withCustomLevel,
  );
}

export function getLevel(id: number): Level | undefined {
  if (levelsById.size === 0) {
    for (const level of getAllLevels()) levelsById.set(level.id, level);
  }
  return levelsById.get(id);
}

export function getLevelCount(): number {
  return levelDefs().length;
}

const parCache = new Map<number, number>();

/**
 * Сбросить собранные уровни и пары. Нужно после правки карты в админ-панели:
 * игра должна увидеть новую расстановку, а не закэшированную старую.
 */
export function resetLevelCache(): void {
  allLevelsCache = null;
  levelsById.clear();
  parCache.clear();
}


/**
 * Минимальное количество ходов для уровня. Если пар не задан в карте, считается
 * решателем один раз и кэшируется.
 */
export function getPar(level: Level): number {
  const cached = parCache.get(level.id);
  if (cached !== undefined) return cached;
  if (level.par !== undefined) {
    parCache.set(level.id, level.par);
    return level.par;
  }
  const solution = solve(level.cars, level.cols, level.rows, level.exitRow);
  const par = solution && solution.steps > 0 ? solution.steps : PAR_FALLBACK;
  parCache.set(level.id, par);
  return par;
}

/** Диагностика для тестов и консоли разработчика. */
export function auditLevels(): Array<{
  id: number;
  name: string;
  errors: string[];
  par: number | null;
  cars: number;
}> {
  return getAllLevels().map((level) => {
    const errors = validateArrangement(level);
    const solution = solve(level.cars, level.cols, level.rows, level.exitRow, { maxStates: 120_000 });
    if (!solution) errors.push('Уровень не имеет решения');
    return {
      id: level.id,
      name: level.name,
      errors,
      par: solution ? solution.steps : null,
      cars: level.cars.length,
    };
  });
}
