/**
 * Решатель головоломки (BFS по состояниям).
 *
 * Каждый ход — сдвиг одной машины на любое расстояние вдоль её оси.
 * Алгоритм возвращает кратчайшую последовательность ходов, поэтому:
 *  - любые уровни можно проверять на решаемость (тесты);
 *  - из него берётся минимальное число ходов (пар) для системы звёзд;
 *  - из него же берутся подсказки.
 *
 * Реализация итеративная (очередь вместо рекурсии) и работает на компактном
 * представлении состояния, чтобы быстро перебирать десятки тысяч позиций.
 */

import type { Car, Move, Orientation } from '../types';

interface SolverCar {
  id: string;
  length: number;
  orientation: Orientation;
  /** Координата поперёк оси (строка для горизонтальных, колонка для вертикальных). */
  fixed: number;
  /** Стартовая координата вдоль оси. */
  start: number;
  target: boolean;
}

export interface Solution {
  /** Последовательность ходов от начальной позиции до победы. */
  moves: Move[];
  /** Минимальное число ходов (длина последовательности). */
  steps: number;
}

export interface SolveOptions {
  /** Ограничение на число просмотренных состояний (защита от «взрыва»). */
  maxStates?: number;
}

export interface SolveResult {
  solution: Solution | null;
  /**
   * `true` — поиск завершён полностью. Если при этом решения нет, уровень
   * гарантированно нерешаемый (используется тестами и генератором уровней).
   * `false` — сработал лимит состояний, вывод о нерешаемости делать нельзя.
   */
  exhaustive: boolean;
  /**
   * Глубина, до которой дошёл перебор. Поскольку обход идёт по возрастанию
   * числа ходов, это гарантированная нижняя оценка: решения короче
   * `lowerBound + 1` ходов не существует. Для завершённого поиска равна
   * длине решения (или максимуму по достижимым состояниям).
   */
  lowerBound: number;
}

interface SearchNode {
  positions: Uint8Array;
  key: string;
  parent: string | null;
  move: Move | null;
  /** Число ходов от начальной позиции. */
  depth: number;
}

function encode(positions: Uint8Array): string {
  let key = '';
  for (let i = 0; i < positions.length; i += 1) key += String.fromCharCode(positions[i]);
  return key;
}

/**
 * Поиск кратчайшего решения.
 * Возвращает `null`, если решения нет (или превышен лимит состояний).
 */
export function solve(
  cars: Car[],
  cols: number,
  rows: number,
  exitRow: number,
  options: SolveOptions = {},
): Solution | null {
  return solveDetailed(cars, cols, rows, exitRow, options).solution;
}

/** Полный результат поиска: решение и признак завершённости перебора. */
export function solveDetailed(
  cars: Car[],
  cols: number,
  rows: number,
  exitRow: number,
  options: SolveOptions = {},
): SolveResult {
  const maxStates = options.maxStates ?? 400_000;
  const targetIndex = cars.findIndex((car) => car.target);
  if (targetIndex < 0) return { solution: null, exhaustive: true, lowerBound: 0 };

  const solverCars: SolverCar[] = cars.map((car) => ({
    id: car.id,
    length: car.length,
    orientation: car.orientation,
    fixed: car.orientation === 'h' ? car.y : car.x,
    start: car.orientation === 'h' ? car.x : car.y,
    target: Boolean(car.target),
  }));

  const start = new Uint8Array(solverCars.map((car) => car.start));
  const startNode: SearchNode = {
    positions: start,
    key: encode(start),
    parent: null,
    move: null,
    depth: 0,
  };

  const visited = new Map<string, SearchNode>();
  visited.set(startNode.key, startNode);
  const queue: SearchNode[] = [startNode];
  let head = 0;

  const occupancy = new Uint8Array(cols * rows);
  let deepest = 0;

  const isSolvedState = (positions: Uint8Array): boolean => {
    const car = solverCars[targetIndex];
    return car.fixed === exitRow && positions[targetIndex] + car.length === cols;
  };

  while (head < queue.length) {
    const node = queue[head];
    head += 1;

    if (isSolvedState(node.positions)) {
      const moves = reconstruct(node);
      return {
        solution: { moves, steps: moves.length },
        exhaustive: true,
        lowerBound: moves.length,
      };
    }
    if (node.depth > deepest) deepest = node.depth;
    if (visited.size > maxStates) {
      return { solution: null, exhaustive: false, lowerBound: deepest };
    }

    // Карта занятости для текущего состояния.
    occupancy.fill(0);
    for (let i = 0; i < solverCars.length; i += 1) {
      const car = solverCars[i];
      const pos = node.positions[i];
      for (let k = 0; k < car.length; k += 1) {
        const index =
          car.orientation === 'h' ? car.fixed * cols + pos + k : (pos + k) * cols + car.fixed;
        occupancy[index] = i + 1;
      }
    }

    for (let i = 0; i < solverCars.length; i += 1) {
      const car = solverCars[i];
      const pos = node.positions[i];
      const limit = car.orientation === 'h' ? cols : rows;

      // Назад (влево / вверх).
      for (let next = pos - 1; next >= 0; next -= 1) {
        const index =
          car.orientation === 'h' ? car.fixed * cols + next : next * cols + car.fixed;
        if (occupancy[index] !== 0) break;
        pushIfNew(node, i, next);
      }
      // Вперёд (вправо / вниз).
      for (let next = pos + 1; next + car.length <= limit; next += 1) {
        const tail = car.orientation === 'h' ? car.fixed * cols + next + car.length - 1 : (next + car.length - 1) * cols + car.fixed;
        if (occupancy[tail] !== 0) break;
        pushIfNew(node, i, next);
      }
    }
  }

  return { solution: null, exhaustive: true, lowerBound: deepest };

  function pushIfNew(node: SearchNode, carIndex: number, nextPos: number): void {
    const positions = node.positions.slice();
    positions[carIndex] = nextPos;
    const key = encode(positions);
    if (visited.has(key)) return;
    const car = solverCars[carIndex];
    const child: SearchNode = {
      positions,
      key,
      parent: node.key,
      depth: node.depth + 1,
      move: {
        carId: car.id,
        axis: car.orientation === 'h' ? 'x' : 'y',
        from: node.positions[carIndex],
        to: nextPos,
      },
    };
    visited.set(key, child);
    queue.push(child);
  }

  function reconstruct(node: SearchNode): Move[] {
    const moves: Move[] = [];
    let current: SearchNode | undefined = node;
    while (current && current.move) {
      moves.push(current.move);
      current = current.parent ? visited.get(current.parent) : undefined;
    }
    return moves.reverse();
  }
}

/** Только минимальное количество ходов (удобно для тестов и расчёта звёзд). */
export function minimumMoves(
  cars: Car[],
  cols: number,
  rows: number,
  exitRow: number,
  options?: SolveOptions,
): number | null {
  const solution = solve(cars, cols, rows, exitRow, options);
  return solution ? solution.steps : null;
}

/**
 * Количество «независимых» машин, которые обязаны сдвинуться, — нижняя оценка
 * сложности. Используется генератором уровней (этап 2) для отбора интересных карт.
 */
export function targetPathBlockers(cars: Car[], cols: number, exitRow: number): string[] {
  const target = cars.find((car) => car.target);
  if (!target) return [];
  const blocked = new Set<string>();
  for (const car of cars) {
    if (car.id === target.id) continue;
    if (car.orientation === 'v' && car.y <= exitRow && car.y + car.length > exitRow) {
      if (car.x >= target.x + target.length && car.x < cols) blocked.add(car.id);
    }
    if (car.orientation === 'h' && car.y === exitRow && car.x > target.x) {
      blocked.add(car.id);
    }
  }
  return [...blocked];
}
