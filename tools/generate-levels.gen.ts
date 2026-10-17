/**
 * Генератор уровней (этап 2).
 *
 * Запуск: `npm run gen:levels` (повторный запуск берёт готовые уровни из кэша,
 * полностью перегенерировать — `GEN_FORCE=1 npm run gen:levels`).
 *
 * Как это работает
 * ----------------
 * Игра считает один ход как «сдвинул машину на любое расстояние вдоль её оси».
 * Значит, состояния парковки образуют неориентированный граф: любой ход можно
 * отменить тем же ходом. Поэтому поиск в ширину от *решённого* состояния даёт
 * для каждого найденного состояния точное минимальное число ходов до победы —
 * и, что важнее, гарантирует, что решения вообще существуют.
 *
 * Алгоритм:
 *   1. Собираем «решённую» парковку: целевая машина у выезда, остальные
 *      расставлены случайно (но без тупиков — горизонтальные машины не могут
 *      оказаться на строке выезда правее цели).
 *   2. Обходим граф состояний в ширину до лимита, запоминая для каждого
 *      состояния родителя и ход.
 *   3. Для уровня берём состояние с нужной глубиной D: путь к нему —
 *      проверенное решение ровно из D ходов, а сам уровень решаем по
 *      построению.
 *   4. Решатель дополнительно считает точный пар (если успевает) и нижнюю
 *      оценку сложности.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyMove, buildOccupancy, enumerateMoves, isSolved, slideRange } from '@/game/core/rules';
import { solveDetailed } from '@/game/core/solver';
import { mulberry32 } from '@/game/rng';
import type { Car, Move, Orientation } from '@/game/types';
import type { LevelDef, LevelTier } from '@/game/levels/defs';

const NAMES: Record<LevelTier, string[]> = {
  tutorial: [
    'Разминка',
    'Первая передача',
    'Утренний двор',
    'Два ряда',
    'Парковка у дома',
    'Один лишний',
    'Короткий путь',
    'Учимся ездить',
    'Свободный ряд',
    'Первый выезд',
  ],
  easy: [
    'Тесный двор',
    'Переполненный ряд',
    'Обеденный час',
    'Двойная пробка',
    'Магазин у дороги',
    'Кто дальше?',
    'Сдвиг влево',
    'Узкий проезд',
    'Три ряда',
    'Разъезд',
    'Вечерний поток',
    'Курьер',
    'Парковка у офиса',
    'Маневр',
    'Светофор',
  ],
  medium: [
    'Час пик',
    'Много машин',
    'Фургон в проходе',
    'Тупик',
    'Сдвинь автобус',
    'Двойной блок',
    'Разворотная площадка',
    'Длинный фургон',
    'Парковочный лабиринт',
    'Затор',
    'Перекрёсток',
    'Утренний поток',
    'Тесный карман',
    'Объезд',
    'Маневры',
    'Стройка рядом',
    'Ремонт дороги',
    'Грузовая зона',
    'Автобусная остановка',
    'Полный двор',
  ],
  hard: [
    'Плотная парковка',
    'Без права на ошибку',
    'Лабиринт',
    'Двойная цепочка',
    'Грузовик поперёк',
    'Пробка на выезде',
    'Тонкий расчёт',
    'Многоходовка',
    'Маневр в узком месте',
    'Кольцо',
    'Перестановка',
    'Сложный разъезд',
    'Комбинация',
    'Затор у выезда',
    'Развязка',
    'Логистика',
    'Цепная реакция',
    'Строгий порядок',
    'Парковочный узел',
    'Транспортный коллапс',
  ],
  expert: [
    'Очень тесно',
    'Почти невозможно',
    'Многоходовая',
    'Экспертная пробка',
    'Хитрый лабиринт',
    'Сложнейший разъезд',
    'Пять ходов вперёд',
    'Транспортный узел',
    'Стратегия',
    'Тесный квартал',
    'Всё против тебя',
    'Плотная сетка',
    'Логический тупик',
    'Максимальная загрузка',
    'Комбинация из десяти',
    'Управляемый хаос',
    'Задача со звёздочкой',
    'Мастер маневра',
    'Цепочка сложностей',
    'Предельная плотность',
  ],
  master: [
    'Эксперт',
    'Невозможное возможно',
    'Финальный затор',
    'Парковочный ад',
    'Идеальный маневр',
    'Гроссмейстер',
    'Высшая лига',
    'Последний выезд',
    'Ювелирная работа',
    'Терпение и логика',
    'Тайна парковки',
    'Сверхзадача',
    'Финальная пробка',
    'Абсолютный эксперт',
    'Легенда парковки',
  ],
};


export interface Profile {
  tier: LevelTier;
  from: number;
  to: number;
  cols: number[];
  rows: number[];
  /** Сколько машин на поле (без целевой). */
  cars: [number, number];
  /** Целевой пар на уровне: интерполируется внутри тарифа. */
  par: [number, number];
  /** Лимит состояний в обратном обходе. */
  cap: number;
  /** Вероятность длинных машин. */
  longBias: number;
  /** Сколько уровней берём из одного обхода. */
  perRun: number;
  /** Сколько попыток (обходов) на один уровень, по умолчанию 30. */
  tries?: number;
  /** Минимальный размер компоненты обхода: меньше — расстановка слишком тесная. */
  minStates?: number;
  /** Лимит состояний для точного решателя при отборе. */
  parCap: number;
}

/**
 * Параметры тарифов подобраны замерами на реальных обходах: чем меньше
 * длинных машин, тем больше свободы у поля и тем длиннее цепочки взаимных
 * блокировок — а значит, выше минимальное число ходов.
 */
export const PROFILES: Profile[] = [
  // 100 уровней на поле 6x6. Сложность задаётся не плотностью (плотная доска
  // «запирается» и ходов почти нет), а длиной вынужденной цепочки: глубокие
  // компоненты живут на 9–11 машинах с большим числом длинных кузовов.
  { tier: 'tutorial', from: 6, to: 10, cols: [6], rows: [6], cars: [7, 8], par: [4, 6], cap: 60_000, longBias: 0.45, perRun: 6, tries: 40, minStates: 20, parCap: 40_000 },
  { tier: 'easy', from: 11, to: 25, cols: [6], rows: [6], cars: [8, 9], par: [6, 9], cap: 90_000, longBias: 0.5, perRun: 8, tries: 50, minStates: 40, parCap: 50_000 },
  { tier: 'medium', from: 26, to: 45, cols: [6], rows: [6], cars: [9, 10], par: [9, 13], cap: 120_000, longBias: 0.5, perRun: 12, tries: 60, minStates: 60, parCap: 60_000 },
  { tier: 'hard', from: 46, to: 65, cols: [6], rows: [6], cars: [9, 10], par: [12, 16], cap: 120_000, longBias: 0.5, perRun: 14, tries: 80, minStates: 60, parCap: 60_000 },
  { tier: 'expert', from: 66, to: 85, cols: [6], rows: [6], cars: [9, 11], par: [15, 20], cap: 140_000, longBias: 0.5, perRun: 16, tries: 100, minStates: 60, parCap: 70_000 },
  { tier: 'master', from: 86, to: 100, cols: [6], rows: [6], cars: [9, 11], par: [18, 25], cap: 150_000, longBias: 0.55, perRun: 16, tries: 120, minStates: 60, parCap: 70_000 },
];


const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

export interface Shape {
  length: number;
  orientation: Orientation;
  target?: boolean;
}

interface ExploreNode {
  /** Позиции машин вдоль их осей. */
  positions: Uint8Array;
  depth: number;
  parent: number;
  move: Move | null;
}

export interface ExploreRun {
  id: string;
  cols: number;
  rows: number;
  exitRow: number;
  shapes: Shape[];
  /** Поперечные координаты машин (постоянны в пределах обхода). */
  cross: number[];
  nodes: ExploreNode[];
  /** Ключи просмотренных состояний → индекс узла. */
  index: Map<string, number>;
  maxDepth: number;
  /** Обход упёрся в лимит состояний: компонента связности не исчерпана. */
  capped: boolean;
  /** Точное расстояние до «решённого» множества (заполняется computeGoalDistance). */
  goalDist: Int32Array;
  /** Следующий узел на пути к решению. */
  goalParent: Int32Array;
  /** Ход, который из этого узла ведёт к решению. */
  goalMove: Array<Move | null>;
}

/** Карта занятости состояния: `0` — пусто, иначе номер машины + 1. */
function fillOccupancy(run: ExploreRun, positions: Uint8Array, occupancy: Uint8Array): void {
  occupancy.fill(0);
  for (let i = 0; i < run.shapes.length; i += 1) {
    const shape = run.shapes[i];
    const pos = positions[i];
    for (let k = 0; k < shape.length; k += 1) {
      const cell =
        shape.orientation === 'h'
          ? run.cross[i] * run.cols + pos + k
          : (pos + k) * run.cols + run.cross[i];
      occupancy[cell] = i + 1;
    }
  }
}

/** Перечислить допустимые ходы состояния вместе с получившимися позициями. */
function forEachLegalMove(
  run: ExploreRun,
  positions: Uint8Array,
  occupancy: Uint8Array,
  visit: (move: Move, next: Uint8Array) => void,
): void {
  for (let i = 0; i < run.shapes.length; i += 1) {
    const shape = run.shapes[i];
    const pos = positions[i];
    const limit = shape.orientation === 'h' ? run.cols : run.rows;
    const axis = shape.orientation === 'h' ? 'x' : 'y';

    for (const direction of [-1, 1]) {
      for (let step = 1; step <= limit; step += 1) {
        const next = pos + direction * step;
        if (next < 0 || next + shape.length > limit) break;
        const edgeCell =
          direction < 0
            ? shape.orientation === 'h'
              ? run.cross[i] * run.cols + next
              : next * run.cols + run.cross[i]
            : shape.orientation === 'h'
              ? run.cross[i] * run.cols + next + shape.length - 1
              : (next + shape.length - 1) * run.cols + run.cross[i];
        if (occupancy[edgeCell] !== 0) break;

        const moved = positions.slice();
        moved[i] = next;
        visit({ carId: shape.target ? 'target' : `c${i}`, axis, from: pos, to: next }, moved);
      }
    }
  }
}

/** Достигнута ли победа: целевая машина упёрлась в правый край. */
function solvedPositions(run: ExploreRun, positions: Uint8Array): boolean {
  return positions[0] + run.shapes[0].length === run.cols;
}

export function stateKey(positions: Uint8Array): string {
  let key = '';
  for (let i = 0; i < positions.length; i += 1) key += String.fromCharCode(positions[i]);
  return key;
}

/**
 * Собрать «решённую» расстановку: целевая машина у выезда, остальные случайно.
 * Горизонтальные машины не ставятся на строку выезда правее цели — иначе
 * уровень был бы заперт навсегда.
 */
export function buildRoot(
  ways: Array<{ length: number; orientation: Orientation }>,
  cols: number,
  rows: number,
  exitRow: number,
  random: () => number,
): { ways: Array<{ length: number; orientation: Orientation }>; positions: Uint8Array; cross: number[] } | null {
  const occupied = new Set<number>();
  const cross: number[] = [];
  const fitted: Array<{ length: number; orientation: Orientation }> = [];
  const positionsList: number[] = [];
  const cellIndex = (x: number, y: number): number => y * cols + x;

  const markCar = (x: number, y: number, length: number, orientation: Orientation): boolean => {
    const cells: number[] = [];
    for (let i = 0; i < length; i += 1) {
      const cx = orientation === 'h' ? x + i : x;
      const cy = orientation === 'h' ? y : y + i;
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return false;
      const cell = cellIndex(cx, cy);
      if (occupied.has(cell)) return false;
      cells.push(cell);
    }
    cells.forEach((cell) => occupied.add(cell));
    return true;
  };

  // Корень обхода: целевая машина уже у выезда (уровень «решён»).
  const targetShape = ways[0];
  const targetX = cols - targetShape.length;
  if (!markCar(targetX, exitRow, targetShape.length, 'h')) return null;
  fitted.push(targetShape);
  positionsList.push(targetX);
  cross.push(exitRow);

  let skipped = 0;
  for (let i = 1; i < ways.length; i += 1) {
    const shape = ways[i];
    let placed = false;
    for (let attempt = 0; attempt < 250 && !placed; attempt += 1) {
      const limit = shape.orientation === 'h' ? cols : rows;
      if (shape.length > limit) break;
      const axis = Math.floor(random() * (limit - shape.length + 1));
      const crossCoord = Math.floor(random() * (shape.orientation === 'h' ? rows : cols));
      // Горизонтальная машина на строке выезда правее цели запирает уровень.
      if (shape.orientation === 'h' && crossCoord === exitRow && axis > targetX) continue;
      const x = shape.orientation === 'h' ? axis : crossCoord;
      const y = shape.orientation === 'h' ? crossCoord : axis;
      if (!markCar(x, y, shape.length, shape.orientation)) continue;
      fitted.push(shape);
      positionsList.push(axis);
      cross.push(crossCoord);
      placed = true;
    }
    // Не влезла — пропускаем машину: плотность подбирается под поле.
    if (!placed) skipped += 1;
  }

  if (skipped > 3 || fitted.length < 4) return null;
  return { ways: fitted, positions: Uint8Array.from(positionsList), cross };
}

/**
 * Плотная «решённая» расстановка.
 *
 * Случайное размещение (buildRoot) оставляет много свободных клеток: цель
 * выезжает почти сразу, и уровень получается лёгким. Здесь наоборот — доска
 * забивается машинами под завязку, причём приоритет отдаётся машинам,
 * которые перекрывают строку выезда слева от цели и прилегают к уже
 * поставленным. Чем плотнее доска, тем больше ходов вынуждены и тем глубже
 * получается компонента при обходе.
 */
export function packRoot(
  ways: Array<{ length: number; orientation: Orientation }>,
  cols: number,
  rows: number,
  exitRow: number,
  random: () => number,
): { ways: Array<{ length: number; orientation: Orientation }>; positions: Uint8Array; cross: number[] } | null {
  const occupied = new Set<number>();
  const fitted: Array<{ length: number; orientation: Orientation }> = [];
  const positionsList: number[] = [];
  const cross: number[] = [];
  const cellAt = (x: number, y: number): number => y * cols + x;

  const canPlace = (x: number, y: number, length: number, orientation: Orientation): boolean => {
    for (let i = 0; i < length; i += 1) {
      const cx = orientation === 'h' ? x + i : x;
      const cy = orientation === 'h' ? y : y + i;
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return false;
      if (occupied.has(cellAt(cx, cy))) return false;
    }
    return true;
  };

  const mark = (x: number, y: number, length: number, orientation: Orientation): void => {
    for (let i = 0; i < length; i += 1) {
      const cx = orientation === 'h' ? x + i : x;
      const cy = orientation === 'h' ? y : y + i;
      occupied.add(cellAt(cx, cy));
    }
  };

  const placeAt = (
    shape: { length: number; orientation: Orientation },
    axis: number,
    crossCoord: number,
  ): void => {
    fitted.push(shape);
    positionsList.push(axis);
    cross.push(crossCoord);
    if (shape.orientation === 'h') mark(axis, crossCoord, shape.length, 'h');
    else mark(crossCoord, axis, shape.length, 'v');
  };

  // Цель уже у выезда: уровень «решён».
  const targetShape = ways[0];
  const targetX = cols - targetShape.length;
  if (targetX < 0) return null;
  placeAt(targetShape, targetX, exitRow);

  const rest = ways.slice(1).map((shape, index) => ({ shape, index: index + 1 }));
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = rest[i];
    rest[i] = rest[j];
    rest[j] = tmp;
  }

  let skipped = 0;
  for (const item of rest) {
    const shape = item.shape;
    const limit = shape.orientation === 'h' ? cols : rows;
    if (shape.length > limit) {
      skipped += 1;
      continue;
    }
    let best: { axis: number; crossCoord: number; score: number } | null = null;
    const gridPositions: Array<{ x: number; y: number; axis: number; crossCoord: number }> = [];
    for (let crossCoord = 0; crossCoord < (shape.orientation === 'h' ? rows : cols); crossCoord += 1) {
      for (let axis = 0; axis <= limit - shape.length; axis += 1) {
        const x = shape.orientation === 'h' ? axis : crossCoord;
        const y = shape.orientation === 'h' ? crossCoord : axis;
        if (!canPlace(x, y, shape.length, shape.orientation)) continue;
        gridPositions.push({ x, y, axis, crossCoord });
      }
    }
    for (const spot of gridPositions) {
      let score = random() * 1.5;
      // Машина перекрывает строку выезда слева от цели — цель заперта.
      if (shape.orientation === 'v' && spot.crossCoord < targetX && spot.axis <= exitRow && exitRow < spot.axis + shape.length) {
        score += 4;
      }
      if (shape.orientation === 'h' && spot.crossCoord === exitRow && spot.x + shape.length <= targetX) {
        score += 3;
      }
      // Прилегание к уже стоящим машинам — доска получается плотной, без «карманов».
      const x = spot.x;
      const y = spot.y;
      for (let i = 0; i < shape.length; i += 1) {
        const cx = shape.orientation === 'h' ? x + i : x;
        const cy = shape.orientation === 'h' ? y : y + i;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (occupied.has(cellAt(cx + dx, cy + dy))) score += 0.6;
        }
      }
      // Края доски тоже «якоря»: так не остаётся пустых полос.
      if (x === 0 || y === 0 || x + shape.length === cols || y + shape.length === rows) score += 0.3;
      if (!best || score > best.score) best = { axis: spot.axis, crossCoord: spot.crossCoord, score };
    }
    if (!best) {
      skipped += 1;
      continue;
    }
    placeAt(shape, best.axis, best.crossCoord);
  }

  if (skipped > 1 || fitted.length < 5) return null;
  const filled = occupied.size;
  if (filled / (cols * rows) < 0.62) return null;
  return { ways: fitted, positions: Uint8Array.from(positionsList), cross };
}

/** Развернуть состояние обхода в список машин. */
export function toCars(run: ExploreRun, positions: Uint8Array): Car[] {
  return run.shapes.map((shape, i) => {
    const axis = positions[i];
    return {
      id: shape.target ? 'target' : `c${i}`,
      kind: 'sedan',
      color: 'blue',
      length: shape.length,
      x: shape.orientation === 'h' ? axis : run.cross[i],
      y: shape.orientation === 'h' ? run.cross[i] : axis,
      orientation: shape.orientation,
      target: shape.target,
    } as Car;
  });
}

/**
 * Обход графа состояний в ширину от решённого состояния.
 * Глубина узла = точное минимальное число ходов до победы (граф неориентирован).
 */
export function exploreFromSolved(
  ways: Array<{ length: number; orientation: Orientation }>,
  cols: number,
  rows: number,
  exitRow: number,
  cap: number,
  random: () => number,
  id: string,
  prebuilt?: { ways: Array<{ length: number; orientation: Orientation }>; positions: Uint8Array; cross: number[] } | null,
): ExploreRun | null {
  const root = prebuilt ?? buildRoot(ways, cols, rows, exitRow, random);
  if (!root) return null;
  const cross = root.cross;
  const shapes: Shape[] = root.ways.map((way, i) => ({
    length: way.length,
    orientation: way.orientation,
    target: i === 0 || undefined,
  }));
  const occupancy = new Uint8Array(cols * rows);

  const run: ExploreRun = {
    id,
    cols,
    rows,
    exitRow,
    shapes,
    cross,
    nodes: [{ positions: root.positions, depth: 0, parent: -1, move: null }],
    index: new Map([[stateKey(root.positions), 0]]),
    maxDepth: 0,
    capped: false,
    goalDist: new Int32Array(0),
    goalParent: new Int32Array(0),
    goalMove: [],
  };

  let head = 0;
  while (head < run.nodes.length && run.nodes.length < cap) {
    const node = run.nodes[head];
    head += 1;
    if (node.depth > run.maxDepth) run.maxDepth = node.depth;

    fillOccupancy(run, node.positions, occupancy);
    forEachLegalMove(run, node.positions, occupancy, (move, next) => {
      const key = stateKey(next);
      if (run.index.has(key)) return;
      run.index.set(key, run.nodes.length);
      run.nodes.push({ positions: next, depth: node.depth + 1, parent: head - 1, move });
    });
  }
  run.capped = run.nodes.length >= cap;
  computeGoalDistance(run);
  return run;
}

/**
 * Точное расстояние от каждого состояния до «решённого» множества.
 *
 * Победа в игре — это любое состояние, где целевая машина упёрлась в правый
 * край, поэтому минимальное число ходов (пар) — это расстояние до множества
 * решённых состояний, а не до одного конкретного. Считаем его обходом в
 * ширину сразу от всех решённых узлов компоненты.
 */
export function computeGoalDistance(run: ExploreRun): void {
  const total = run.nodes.length;
  const dist = new Int32Array(total).fill(-1);
  const parent = new Int32Array(total).fill(-1);
  const moves = new Array<Move | null>(total).fill(null);
  const queue: number[] = [];
  for (let i = 0; i < total; i += 1) {
    if (solvedPositions(run, run.nodes[i].positions)) {
      dist[i] = 0;
      queue.push(i);
    }
  }

  const occupancy = new Uint8Array(run.cols * run.rows);
  let head = 0;
  while (head < queue.length) {
    const index = queue[head];
    head += 1;
    const node = run.nodes[index];
    fillOccupancy(run, node.positions, occupancy);
    forEachLegalMove(run, node.positions, occupancy, (move, next) => {
      const neighbor = run.index.get(stateKey(next));
      if (neighbor === undefined || dist[neighbor] !== -1) return;
      dist[neighbor] = dist[index] + 1;
      parent[neighbor] = index;
      // Ход храним «от узла к решению»: он ведёт к уже известному соседу.
      moves[neighbor] = { ...move, from: move.to, to: move.from };
      queue.push(neighbor);
    });
  }

  run.goalDist = dist;
  run.goalParent = parent;
  run.goalMove = moves;
}

/** Оптимальное решение от состояния до победы. */
export function pathToGoal(run: ExploreRun, nodeIndex: number): Move[] {
  const moves: Move[] = [];
  let index = nodeIndex;
  let guard = 0;
  while (index >= 0 && run.goalParent[index] !== -1 && guard < 5000) {
    const move = run.goalMove[index];
    if (move) moves.push(move);
    index = run.goalParent[index];
    guard += 1;
  }
  return moves;
}

export interface GeneratedLevel {
  cars: Car[];
  cols: number;
  rows: number;
  exitRow: number;
  par: number;
  exact: boolean;
  lowerBound?: number;
  /** Оценка «сколько думать»: чем выше, тем интереснее уровень. */
  score?: number;
}

/**
 * Оценка сложности уровня для игрока.
 *
 * Пар сам по себе — не всё: длинная цепочка, где на каждом шаге есть ровно
 * один ход, играется механически, а короткая с двумя-тремя равноправными
 * вариантами заставляет считать. Поэтому к пару добавляем число разных машин
 * в решении и «возвраты» (машина едет туда и обратно — их трудно увидеть),
 * а развилки оцениваем по расстоянию до комфортных 3–4 вариантов.
 */
export function rateCandidate(run: ExploreRun, index: number, cars: Car[], par: number): number {
  const solution = pathToGoal(run, index);
  let state = cars;
  let reversals = 0;
  let branchingSum = 0;
  const distinct = new Set<string>();
  const lastDirection = new Map<string, number>();

  for (const move of solution) {
    branchingSum += enumerateMoves(state, run.cols, run.rows).length;
    distinct.add(move.carId);
    const direction = Math.sign(move.to - move.from);
    const previous = lastDirection.get(move.carId);
    if (previous !== undefined && previous !== direction) reversals += 1;
    lastDirection.set(move.carId, direction);
    state = applyMove(state, move);
  }

  const branching = solution.length > 0 ? branchingSum / solution.length : 0;
  return (
    par * 0.4 +
    distinct.size * 0.9 +
    reversals * 1.1 -
    Math.abs(branching - 3.5) * 0.9
  );
}

function letter(i: number, orientation: Orientation): string {
  const char = LETTERS[i % LETTERS.length];
  return orientation === 'h' ? char : char.toUpperCase();
}

export function toMap(level: GeneratedLevel): string[] {
  const { cars, cols, rows } = level;
  const grid: string[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => '.'),
  );
  cars.forEach((car, index) => {
    const char = car.target ? '*' : letter(index, car.orientation);
    for (let i = 0; i < car.length; i += 1) {
      const x = car.orientation === 'h' ? car.x + i : car.x;
      const y = car.orientation === 'h' ? car.y : car.y + i;
      grid[y][x] = char;
    }
  });
  return grid.map((row) => row.join(''));
}

/** Прогоняем решение по правилам игры: каждый ход должен быть допустим. */
export function verifySolution(
  cars: Car[],
  moves: Move[],
  cols: number,
  rows: number,
  exitRow: number,
): boolean {
  let current = cars;
  for (const move of moves) {
    const car = current.find((item) => item.id === move.carId);
    if (!car) return false;
    const range = slideRange(car, buildOccupancy(current, cols, rows), cols, rows);
    const pos = car.orientation === 'h' ? car.x : car.y;
    if (move.from !== pos) return false;
    if (move.to < range.min || move.to > range.max) return false;
    current = applyMove(current, move);
  }
  return isSolved({ cols, exitRow, exitSide: 'right' }, current);
}

export const REJECT: Record<string, number> = {};
function reject(reason: string): void {
  REJECT[reason] = (REJECT[reason] ?? 0) + 1;
}

/** Собираем «способы» (длина + ориентация) для набора машин тарифа. */
export function buildWays(
  random: () => number,
  cols: number,
  rows: number,
  carCount: number,
  longBias: number,
): Array<{ length: number; orientation: Orientation }> {
  const ways: Array<{ length: number; orientation: Orientation }> = [
    { length: 2, orientation: 'h' }, // целевая машина — короткая и горизонтальная
  ];
  for (let index = 0; index < carCount; index += 1) {
    const orientation: Orientation = random() < 0.5 ? 'h' : 'v';
    const limit = orientation === 'h' ? cols : rows;
    // Длины только 2 и 3 клетки: так требует игровая сетка,
    // «автобус» и «фургон» — это типы кузова, а не длина.
    const length = random() < longBias && limit >= 3 ? 3 : 2;
    ways.push({ length, orientation });
  }
  return ways;
}

/**
 * Собрать обход от решённой расстановки, стараясь получить глубокую компоненту.
 *
 * Один случайный корень редко даёт длинные решения, поэтому перебираем
 * несколько расстановок и оставляем ту, где максимальный пар больше. Как
 * только глубина достигла целевой, обход прекращаем — дальше искать незачем.
 */
export function makeRun(
  profile: Profile,
  random: () => number,
  carCount: number,
  runIndex: number,
  targetDepth = 0,
): ExploreRun | null {
  const cols = profile.cols[Math.floor(random() * profile.cols.length) % profile.cols.length];
  const rows = profile.rows[Math.floor(random() * profile.rows.length) % profile.rows.length];
  let best: ExploreRun | null = null;
  let bestDepth = -1;
  const maxRoots = 16;

  for (let attempt = 0; attempt < maxRoots; attempt += 1) {
    const exitRow = 1 + Math.floor(random() * (rows - 2));
    const ways = buildWays(random, cols, rows, carCount, profile.longBias);
    const root = buildRoot(ways, cols, rows, exitRow, random);
    if (!root) {
      reject('не удалось собрать корневую расстановку');
      continue;
    }
    const run = exploreFromSolved(
      root.ways,
      cols,
      rows,
      exitRow,
      profile.cap,
      random,
      `run-${runIndex}-${attempt}`,
      root,
    );
    if (!run) continue;
    if (run.nodes.length < (profile.minStates ?? 40)) {
      reject('слишком тесная расстановка');
      continue;
    }
    const maxPar = maxParOf(run);
    if (maxPar > bestDepth) {
      bestDepth = maxPar;
      best = run;
    }
    if (bestDepth >= targetDepth) break;
  }

  return best;
}

/** Максимальный пар в обходе (глубина самой дальней от победы позиции). */
export function maxParOf(run: ExploreRun): number {
  let max = 0;
  for (const value of run.goalDist) if (value > max) max = value;
  return max;
}

export function collectLevels(
  run: ExploreRun,
  parRange: [number, number],
  count: number,
  random: () => number,
  parCap: number,
): GeneratedLevel[] {
  const [lowPar, highPar] = parRange;
  const results: GeneratedLevel[] = [];

  // Кандидаты — состояния, чьё точное расстояние до победы попадает в диапазон.
  const candidates: number[] = [];
  for (let index = 0; index < run.nodes.length; index += 1) {
    const dist = run.goalDist[index];
    if (dist < lowPar || dist > highPar) continue;
    candidates.push(index);
  }
  // Перемешиваем, чтобы при равных оценках уровни не были однотипными.
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = candidates[i];
    candidates[i] = candidates[j];
    candidates[j] = tmp;
  }

  let checked = 0;
  const maxChecks = Math.max(60, count * 14);
  for (const index of candidates) {
    if (results.length >= count || checked >= maxChecks) break;
    const node = run.nodes[index];
    const cars = toCars(run, node.positions);
    const solution = pathToGoal(run, index);
    if (solution.length !== run.goalDist[index]) {
      reject('путь не совпал с расстоянием');
      continue;
    }
    if (!verifySolution(cars, solution, run.cols, run.rows, run.exitRow)) {
      reject('построенное решение не проходит проверку');
      continue;
    }
    checked += 1;

    let par = run.goalDist[index];
    let exact = !run.capped;
    if (run.capped) {
      // Обход упёрся в лимит: расстояние могло оказаться завышенным,
      // поэтому уточняем пар точным решателем.
      const analysis = solveDetailed(cars, run.cols, run.rows, run.exitRow, { maxStates: parCap });
      if (!analysis.solution) {
        reject('точное решение не найдено');
        continue;
      }
      par = analysis.solution.steps;
      exact = true;
    }
    if (par < lowPar || par > highPar) {
      reject(`пар вне диапазона ${par}`);
      continue;
    }
    const score = run.capped ? 0 : rateCandidate(run, index, cars, par);
    results.push({ cars, cols: run.cols, rows: run.rows, exitRow: run.exitRow, par, exact, score });
  }

  // Лучшие по «сколько думать» — вперёд.
  results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return results;
}

function assignNames(levels: Array<{ id: number; tier: LevelTier }>): Map<number, string> {
  const counters = new Map<LevelTier, number>();
  const result = new Map<number, string>();
  for (const level of levels) {
    const pool = NAMES[level.tier];
    const used = counters.get(level.tier) ?? 0;
    result.set(level.id, pool[used % pool.length]);
    counters.set(level.tier, used + 1);
  }
  return result;
}

/**
 * Кэш готовых уровней: генерация больших полей занимает минуты, поэтому
 * результаты сохраняются пошагово и переиспользуются при следующих запусках.
 */
const CACHE_PATH = fileURLToPath(new URL('./.cache/levels.json', import.meta.url));

interface CacheEntry {
  level: LevelDef;
  exact: boolean;
  lowerBound?: number;
  cars: number;
  cols: number;
  rows: number;
}

function readCache(): Record<string, CacheEntry> {
  if (!existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as Record<string, CacheEntry>;
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, CacheEntry>): void {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 1), 'utf8');
}

describe('генератор уровней', () => {
  it('создаёт уровни 6..100 и записывает их в файл', () => {
    // GEN_SKIP=1 — модуль подключается только ради утилит (например, замеров).
    if (process.env.GEN_SKIP === '1') return;
    const started = Date.now();
    const cache = readCache();
    const force = process.env.GEN_FORCE === '1';
    const generated: LevelDef[] = [];
    const stats: string[] = [];

    // Первые пять уровней ручные (см. HAND_LEVELS): самый сложный из них
    // требует 6 ходов. Генератор продолжает нумерацию с 6-го уровня, поэтому
    // стартуем не ниже этой планки.
    let prevPar = 6;

    for (const profile of PROFILES) {
      let runIndex = 0;
      let queue: GeneratedLevel[] = [];

      for (let id = profile.from; id <= profile.to; id += 1) {
        const cached = cache[String(id)];
        if (cached && !force) {
          generated.push(cached.level);
          stats.push(
            `#${String(id).padStart(3)} ${profile.tier.padEnd(8)} ${cached.cols}x${cached.rows} par=${String(cached.level.par).padStart(2)}${cached.exact ? '' : '~'} машин=${cached.cars} (из кэша)`,
          );
          continue;
        }

        const indexInTier = id - profile.from;
        const span = Math.max(1, profile.to - profile.from);
        const progress = indexInTier / span;
        const rampPar = Math.round(profile.par[0] + progress * (profile.par[1] - profile.par[0]));
        // Сквозной рост: на стыке ступеней цель не сбрасывается вниз.
        const targetPar = Math.max(rampPar, prevPar);
        const carCount = Math.round(
          profile.cars[0] + progress * (profile.cars[1] - profile.cars[0]),
        );

        // Внутри ступени сложность растёт: ближе к концу тарифа нужно больше
        // ходов. Пол сложности (tierLow) не опускаем — иначе снова появятся
        // уровни «в один ход», из-за которых игра казалась лёгкой.
        const tierLow = Math.max(profile.par[0], prevPar);
        const tierHigh = Math.max(profile.par[1] + 3, prevPar + 4);
        let level: GeneratedLevel | null = null;

        const consider = (candidate: GeneratedLevel | null): void => {
          if (!candidate) return;
          if (candidate.par < 2 || candidate.par > tierHigh) return;
          queue.push(candidate);
        };

        // Выбор из очереди: ближе к целевому пару и «интереснее» по структуре.
        const pickScore = (candidate: GeneratedLevel): number =>
          (candidate.score ?? 0) - 2.2 * Math.abs(candidate.par - targetPar);

        const takeFromQueue = (floor: number): void => {
          let bestIndex = -1;
          let bestScore = -Infinity;
          for (let index = 0; index < queue.length; index += 1) {
            const candidate = queue[index];
            if (candidate.par < floor) continue;
            const value = pickScore(candidate);
            if (value > bestScore) {
              bestScore = value;
              bestIndex = index;
            }
          }
          if (bestIndex >= 0) {
            level = queue[bestIndex];
            queue.splice(bestIndex, 1);
          }
        };

        takeFromQueue(tierLow);

        // Основной бюджет: держим пол сложности строго. Именно здесь раньше
        // уровни «съезжали» в лёгкие — генератор сдавался после десятка попыток.
        const budget = profile.tries ?? 60;
        for (let attempt = 0; attempt < budget && !level; attempt += 1) {
          const random = mulberry32(0x9e3779b9 ^ (id * 2654435761) ^ (attempt * 40503));

          runIndex += 1;
          const run = makeRun(profile, random, carCount, runIndex, Math.max(tierLow, targetPar));
          if (!run) continue;

          const collected = collectLevels(
            run,
            [Math.max(4, targetPar - 7, tierLow), tierHigh],
            profile.perRun,
            random,
            profile.parCap,
          );
          collected.forEach(consider);
          queue = queue.slice(-600);
          takeFromQueue(tierLow);
        }

        // Запасной спуск — только если строгий бюджет исчерпан.
        for (let attempt = 0; attempt < Math.ceil(budget / 3) && !level; attempt += 1) {
          const random = mulberry32(0x51ed270b ^ (id * 2654435761) ^ (attempt * 40503));
          runIndex += 1;
          const run = makeRun(profile, random, carCount, runIndex, tierLow);
          if (!run) continue;
          const collected = collectLevels(
            run,
            [Math.max(4, tierLow - 2), tierHigh],
            profile.perRun,
            random,
            profile.parCap,
          );
          collected.forEach(consider);
          queue = queue.slice(-600);
          takeFromQueue(Math.max(4, tierLow));
        }

        if (!level) {
          // Крайний случай: берём лучший из очереди без ограничения по пару.
          takeFromQueue(2);
        }

        if (!level) {
          console.log('rejections for level', id, JSON.stringify(REJECT));
          throw new Error(`не удалось сгенерировать уровень ${id}`);
        }
        const value: GeneratedLevel = level;
        const def: LevelDef = {
          id,
          name: 'placeholder',
          tier: profile.tier,
          map: toMap(value),
          par: value.par,
        };
        cache[String(id)] = {
          level: def,
          exact: value.exact,
          lowerBound: value.lowerBound,
          cars: value.cars.length,
          cols: value.cols,
          rows: value.rows,
        };
        writeCache(cache);
        prevPar = value.par;
        generated.push(def);
        stats.push(
          `#${String(id).padStart(3)} ${profile.tier.padEnd(8)} ${value.cols}x${value.rows} par=${String(value.par).padStart(2)}${value.exact ? '' : '~'} машин=${value.cars.length}${value.lowerBound !== undefined ? ` (нижняя оценка ${value.lowerBound})` : ''}`,
        );
      }
    }

    const names = assignNames(generated);
    for (const level of generated) level.name = names.get(level.id) ?? level.name;

    const header = `/**
 * АВТОМАТИЧЕСКИ СГЕНЕРИРОВАННЫЙ ФАЙЛ.
 *
 * Не редактируйте вручную: запустите \`npm run gen:levels\`.
 * Каждый уровень проверен: у всех есть гарантированное решение, а \`par\` —
 * минимальное (или близкое к минимальному) количество ходов для трёх звёзд.
 */

import type { LevelDef } from './defs';

export const GENERATED_LEVELS: LevelDef[] = [
`;

    const body = generated
      .map((level) => {
        const mapLines = level.map.map((line) => `      '${line}',`).join('\n');
        return `  {
    id: ${level.id},
    name: '${level.name}',
    tier: '${level.tier}',
    par: ${level.par},
    map: [
${mapLines}
    ],
  },`;
      })
      .join('\n');

    const target = fileURLToPath(new URL('../src/game/levels/generated.ts', import.meta.url));
    writeFileSync(target, header + body + '\n];\n', 'utf8');

    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`\nСгенерировано уровней: ${generated.length} за ${seconds} c\n`);
    console.log(stats.join('\n'));
    expect(generated).toHaveLength(95);
  }, 1_800_000);
});
