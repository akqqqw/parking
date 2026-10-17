/**
 * Модель ручного редактора уровней.
 *
 * Здесь нет React и Phaser — только чистые функции над расстановкой машин.
 * Благодаря этому редактор можно тестировать отдельно от интерфейса, а карта
 * (`toMap`) получается ровно в том формате, который читает игра.
 */

import type { Car, CarColorKey, CarKind, Level, Orientation } from '../types';
import { carCross, carPos, validateArrangement } from '../core/rules';
import { solveDetailed } from '../core/solver';
import { CAR_COLOR_KEYS } from '../theme/palettes';
import { parseMap } from './parse';

/** Машина в редакторе: только геометрия, без косметики. */
export interface EditorCar {
  id: string;
  x: number;
  y: number;
  length: number;
  orientation: Orientation;
  target: boolean;
}

export interface EditorState {
  cols: number;
  rows: number;
  cars: EditorCar[];
}

/** Новый автомобиль, который ставит игрок. */
export interface CarDraft {
  x: number;
  y: number;
  length: number;
  orientation: Orientation;
  target?: boolean;
}

/** Инструменты редактора. */
export type EditorTool = 'h' | 'v' | 'target' | 'erase';

export interface EditorCheck {
  errors: string[];
  warnings: string[];
  /** Минимальное число ходов, если решение найдено. */
  par: number | null;
  solvable: boolean;
  /** Поиск завершён полностью (значит, «нет решения» — окончательный вывод). */
  exhaustive: boolean;
  cars: number;
}

export const EDITOR_MIN_SIZE = 5;
export const EDITOR_MAX_SIZE = 9;
export const EDITOR_MAX_CARS_PER_AXIS = 26;
/** Инструменты ставят машины длиной 2–3 клетки; длиннее — только из старых карт. */
export const EDITOR_MIN_LENGTH = 2;
export const EDITOR_MAX_LENGTH = 3;
/** Лимит перебора для проверки: держит интерфейс отзывчивым. */
export const EDITOR_SOLVE_LIMIT = 250_000;

const TARGET_ID = 'target';
const HORIZONTAL_LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const VERTICAL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function emptyEditor(cols = 6, rows = 6): EditorState {
  return { cols, rows, cars: [] };
}

/** Загрузить расстановку из уровня игры. */
export function fromLevel(level: Level): EditorState {
  let index = 0;
  const cars: EditorCar[] = level.cars.map((car) => {
    index += 1;
    return {
      id: car.target ? TARGET_ID : `c${index}`,
      x: car.x,
      y: car.y,
      length: car.length,
      orientation: car.orientation,
      target: Boolean(car.target),
    };
  });
  return { cols: level.cols, rows: level.rows, cars };
}

/** Загрузить расстановку из текстовой карты. `null` — карта не разбирается. */
export function fromMap(map: readonly string[]): EditorState | null {
  const parsed = parseMap(map);
  if (parsed.errors.length > 0 || parsed.cols === 0 || parsed.rows === 0) return null;
  let index = 0;
  const cars: EditorCar[] = parsed.shapes.map((shape) => {
    index += 1;
    return {
      id: shape.target ? TARGET_ID : `c${index}`,
      x: shape.x,
      y: shape.y,
      length: shape.length,
      orientation: shape.orientation,
      target: Boolean(shape.target),
    };
  });
  return { cols: parsed.cols, rows: parsed.rows, cars };
}

/** Геометрия для ядра игры (цвет и тип кузова нужны только отрисовке). */
export function toCars(state: EditorState): Car[] {
  const kinds: CarKind[] = ['sedan', 'hatch', 'suv', 'van', 'bus', 'truck'];
  return state.cars.map((car, index) => ({
    id: car.id,
    kind: car.target ? 'suv' : kinds[index % kinds.length],
    color: (car.target ? 'red' : CAR_COLOR_KEYS[(index + 1) % CAR_COLOR_KEYS.length]) as CarColorKey,
    length: car.length,
    x: car.x,
    y: car.y,
    orientation: car.orientation,
    target: car.target || undefined,
  }));
}

/** Клетки машины. */
export function carCellsOf(car: EditorCar): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < car.length; i += 1) {
    cells.push(
      car.orientation === 'h' ? { x: car.x + i, y: car.y } : { x: car.x, y: car.y + i },
    );
  }
  return cells;
}

export function carAt(state: EditorState, cell: { x: number; y: number }): EditorCar | null {
  return (
    state.cars.find((car) =>
      carCellsOf(car).some((item) => item.x === cell.x && item.y === cell.y),
    ) ?? null
  );
}

function fits(state: EditorState, draft: CarDraft, ignoreId?: string): boolean {
  if (draft.length < 2 || draft.length > 4) return false;
  const cells = draft.orientation === 'h'
    ? Array.from({ length: draft.length }, (_, index) => ({ x: draft.x + index, y: draft.y }))
    : Array.from({ length: draft.length }, (_, index) => ({ x: draft.x, y: draft.y + index }));
  for (const cell of cells) {
    if (cell.x < 0 || cell.y < 0 || cell.x >= state.cols || cell.y >= state.rows) return false;
    const owner = state.cars.find(
      (car) => car.id !== ignoreId && carCellsOf(car).some((item) => item.x === cell.x && item.y === cell.y),
    );
    if (owner) return false;
  }
  return true;
}

function nextId(state: EditorState): string {
  const used = new Set(state.cars.map((car) => car.id));
  let index = 1;
  while (used.has(`c${index}`)) index += 1;
  return `c${index}`;
}

/**
 * Поставить машину. Для цели старая цель убирается — на уровне она одна.
 * Возвращает `null`, если клетки заняты или машина не помещается.
 */
export function addCar(state: EditorState, draft: CarDraft): EditorState | null {
  const target = Boolean(draft.target);
  const draftFixed: CarDraft = target
    ? { ...draft, orientation: 'h', length: Math.min(3, Math.max(2, draft.length)) }
    : draft;
  if (!fits(state, draftFixed)) return null;

  const cars = target ? state.cars.filter((car) => !car.target) : [...state.cars];
  cars.push({
    id: target ? TARGET_ID : nextId(state),
    x: draftFixed.x,
    y: draftFixed.y,
    length: draftFixed.length,
    orientation: draftFixed.orientation,
    target,
  });
  // Цель всегда первая — так удобнее и стабильнее.
  cars.sort((a, b) => Number(b.target) - Number(a.target));
  return { ...state, cars };
}

export function removeCar(state: EditorState, id: string): EditorState {
  return { ...state, cars: state.cars.filter((car) => car.id !== id) };
}

/** Допустимый диапазон вдоль оси с учётом других машин и границ. */
export function slideRangeFor(state: EditorState, id: string): { min: number; max: number } {
  const car = state.cars.find((item) => item.id === id);
  if (!car) return { min: 0, max: 0 };
  const horizontal = car.orientation === 'h';
  const limit = horizontal ? state.cols : state.rows;
  const fixed = horizontal ? car.y : car.x;
  const occupied = new Set<string>();
  for (const other of state.cars) {
    if (other.id === car.id) continue;
    for (const cell of carCellsOf(other)) occupied.add(`${cell.x},${cell.y}`);
  }
  const position = horizontal ? car.x : car.y;
  let min = position;
  let max = position;
  while (min - 1 >= 0) {
    const cell = horizontal ? { x: min - 1, y: fixed } : { x: fixed, y: min - 1 };
    if (occupied.has(`${cell.x},${cell.y}`)) break;
    min -= 1;
  }
  while (max + car.length < limit) {
    const cell = horizontal ? { x: max + car.length, y: fixed } : { x: fixed, y: max + car.length };
    if (occupied.has(`${cell.x},${cell.y}`)) break;
    max += 1;
  }
  return { min, max };
}

/** Передвинуть машину вдоль её оси. Невалидный ход игнорируется. */
export function moveCarTo(state: EditorState, id: string, position: number): EditorState {
  const car = state.cars.find((item) => item.id === id);
  if (!car) return state;
  const range = slideRangeFor(state, id);
  const next = Math.max(range.min, Math.min(range.max, Math.round(position)));
  if (next === carPos(car)) return state;
  return {
    ...state,
    cars: state.cars.map((item) =>
      item.id === id
        ? item.orientation === 'h'
          ? { ...item, x: next }
          : { ...item, y: next }
        : item,
    ),
  };
}

/** Сделать машину целевой. Цель обязана быть горизонтальной. */
export function makeTarget(state: EditorState, id: string): EditorState {
  const car = state.cars.find((item) => item.id === id);
  if (!car || car.orientation !== 'h' || car.target) return state;
  const used = new Set(
    state.cars.filter((item) => item.id !== TARGET_ID && item.id !== id).map((item) => item.id),
  );
  let counter = 1;
  const freshId = (): string => {
    while (used.has(`c${counter}`)) counter += 1;
    const value = `c${counter}`;
    used.add(value);
    counter += 1;
    return value;
  };
  return {
    ...state,
    cars: state.cars.map((item) => {
      if (item.id === id) return { ...item, target: true, id: TARGET_ID };
      if (item.target) return { ...item, target: false, id: freshId() };
      return item;
    }),
  };
}

/** Убрать цель (уровень станет невалидным — это подскажет проверка). */
export function clearTarget(state: EditorState): EditorState {
  return {
    ...state,
    cars: state.cars.map((car) => (car.target ? { ...car, target: false } : car)),
  };
}

/** Изменить размер поля. Машины, не поместившиеся в новые границы, удаляются. */
export function withSize(state: EditorState, cols: number, rows: number): EditorState {
  const width = Math.max(EDITOR_MIN_SIZE, Math.min(EDITOR_MAX_SIZE, Math.round(cols)));
  const height = Math.max(EDITOR_MIN_SIZE, Math.min(EDITOR_MAX_SIZE, Math.round(rows)));
  return {
    cols: width,
    rows: height,
    cars: state.cars.filter((car) => car.x + (car.orientation === 'h' ? car.length : 1) <= width
      && car.y + (car.orientation === 'v' ? car.length : 1) <= height),
  };
}

export function targetCarOf(state: EditorState): EditorCar | null {
  return state.cars.find((car) => car.target) ?? null;
}

/** Собрать текстовую карту в формате игры. */
export function toMap(state: EditorState): string[] {
  const grid: string[][] = Array.from({ length: state.rows }, () =>
    Array.from({ length: state.cols }, () => '.'),
  );
  const write = (car: EditorCar, char: string): void => {
    for (const cell of carCellsOf(car)) {
      if (cell.y >= 0 && cell.y < state.rows && cell.x >= 0 && cell.x < state.cols) {
        grid[cell.y][cell.x] = char;
      }
    }
  };

  const target = state.cars.find((car) => car.target);
  if (target) write(target, '*');

  const horizontal = state.cars
    .filter((car) => !car.target && car.orientation === 'h')
    .sort((a, b) => a.y - b.y || a.x - b.x);
  horizontal.forEach((car, index) => {
    write(car, HORIZONTAL_LETTERS[index] ?? '?');
  });

  const vertical = state.cars
    .filter((car) => !car.target && car.orientation === 'v')
    .sort((a, b) => a.x - b.x || a.y - b.y);
  vertical.forEach((car, index) => {
    write(car, VERTICAL_LETTERS[index] ?? '?');
  });

  return grid.map((row) => row.join(''));
}

/** Минимальная геометрия машины для сравнения расстановок. */
export type LayoutCar = Pick<Car, 'orientation' | 'x' | 'y' | 'length' | 'target'>;

/**
 * Ключ «внешнего вида» расстановки: тип, длина и положение каждой машины
 * относительно цели. Так одинаково устроенные уровни со сдвигом на пару
 * клеток всё равно считаются похожими.
 */
export function layoutSignatureOf(cars: readonly LayoutCar[]): Set<string> {
  const target = cars.find((car) => car.target);
  const baseX = target ? carPos(target) : 0;
  const baseY = target ? carCross(target) : 0;
  const signature = new Set<string>();
  for (const car of cars) {
    const cross = carCross(car);
    const pos = carPos(car);
    signature.add(`${car.orientation}${car.length}:${cross - baseY}:${pos - baseX}`);
  }
  return signature;
}

export function layoutSignature(state: EditorState): Set<string> {
  return layoutSignatureOf(state.cars);
}

/** Коэффициент Жаккара по двум подписям расстановок. */
export function similarityOfSignatures(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared += 1;
  return shared / (a.size + b.size - shared);
}

export function layoutSimilarity(a: EditorState, b: EditorState): number {
  if (a.cols !== b.cols || a.rows !== b.rows) return 0;
  return similarityOfSignatures(layoutSignature(a), layoutSignature(b));
}

export interface SimilarLevel {
  id: number;
  name: string;
  score: number;
}

/** Самые похожие уровни того же размера — чтобы замечать повторы. */
export function findSimilarLevels(
  state: EditorState,
  levels: readonly Level[],
  limit = 3,
): SimilarLevel[] {
  return levels
    .filter((level) => level.cols === state.cols && level.rows === state.rows)
    .map((level) => ({
      id: level.id,
      name: level.name,
      score: layoutSimilarity(state, fromLevel(level)),
    }))
    .filter((item) => item.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export interface SimilarPair {
  a: number;
  b: number;
  score: number;
}

/**
 * Все пары уровней, похожих друг на друга сильнее порога.
 *
 * Нужно для поиска повторов во всём каталоге: одинаково расставленные машины
 * с разными цветами игрок воспринимает как один и тот же уровень.
 */
export function findSimilarPairs(
  levels: readonly Level[],
  threshold = 0.8,
  limit = 20,
): SimilarPair[] {
  const prepared = levels.map((level) => ({
    id: level.id,
    signature: layoutSignature(fromLevel(level)),
  }));
  const pairs: SimilarPair[] = [];
  for (let i = 0; i < prepared.length; i += 1) {
    for (let j = i + 1; j < prepared.length; j += 1) {
      const left = prepared[i];
      const right = prepared[j];
      const score = similarityOfSignatures(left.signature, right.signature);
      if (score >= threshold) pairs.push({ a: left.id, b: right.id, score });
    }
  }
  return pairs.sort((x, y) => y.score - x.score).slice(0, limit);
}

function unique(messages: string[]): string[] {
  return [...new Set(messages)];
}

/**
 * Полная проверка: геометрия, наличие цели, запирание выезда и решаемость.
 * Пар считается точным решателем (для 6×6 это доли секунды).
 */
export function validateEditor(state: EditorState, solveLimit = EDITOR_SOLVE_LIMIT): EditorCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const target = state.cars.find((car) => car.target);

  if (!target) errors.push('Поставьте целевую (красную) машину — по ней определяется выезд');
  if (state.cars.length < 3) errors.push('Слишком пустая парковка: нужно минимум 3 машины');

  const horizontalCount = state.cars.filter((car) => car.orientation === 'h').length;
  const verticalCount = state.cars.filter((car) => car.orientation === 'v').length;
  if (horizontalCount > EDITOR_MAX_CARS_PER_AXIS || verticalCount > EDITOR_MAX_CARS_PER_AXIS) {
    errors.push('Слишком много машин: в карте поддерживается не больше 26 горизонтальных и 26 вертикальных');
  }

  const tooLong = state.cars.filter((car) => car.length > EDITOR_MAX_LENGTH);
  if (tooLong.length > 0) {
    warnings.push(`Машин длиннее ${EDITOR_MAX_LENGTH} клеток: ${tooLong.length} — в игре такие встречаются, но проверьте их`);
  }
  if (target && target.length > 3) {
    errors.push('Целевая машина длиннее трёх клеток не поддерживается');
  }

  const cars = toCars(state);
  const level: Level = {
    id: 0,
    name: 'Редактор',
    cols: state.cols,
    rows: state.rows,
    exitRow: target ? target.y : 0,
    exitSide: 'right',
    cars,
  };

  if (target) {
    errors.push(...validateArrangement(level));
    if (target.orientation === 'h' && target.x + target.length === state.cols) {
      errors.push('Целевая машина уже у выезда — уровень завершится сразу');
    }
  }

  let par: number | null = null;
  let solvable = false;
  let exhaustive = true;
  if (target && errors.length === 0) {
    const result = solveDetailed(cars, state.cols, state.rows, target.y, { maxStates: solveLimit });
    solvable = Boolean(result.solution);
    exhaustive = result.exhaustive;
    par = result.solution?.steps ?? null;
    if (!solvable) {
      errors.push(
        result.exhaustive
          ? 'Уровень нерешаем: цели не выбраться'
          : 'Не удалось проверить решение — попробуйте упростить расстановку',
      );
    }
  }

  return {
    errors: unique(errors),
    warnings: unique(warnings),
    par,
    solvable,
    exhaustive,
    cars: state.cars.length,
  };
}
