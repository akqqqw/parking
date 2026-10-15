/**
 * Разбор текстовых карт уровней.
 *
 * Формат (легенда):
 *   `.` — свободная клетка;
 *   `*` — целевой автомобиль (только горизонтальный, на строке выезда);
 *   `a`..`z` — горизонтальный автомобиль (одна буква = одна машина);
 *   `A`..`Z` — вертикальный автомобиль.
 *
 * Карта задаёт геометрию; внешний вид (тип кузова и цвет) назначается
 * детерминированно в `catalog.ts`, чтобы уровни выглядели одинаково у всех.
 */

import type { Car, Cell, Level, Orientation } from '../types';
import { orientationOf } from '../core/rules';

/** Геометрия машины без «косметики». */
export type CarShape = Omit<Car, 'kind' | 'color'>;

export interface ParseResult {
  cols: number;
  rows: number;
  exitRow: number;
  shapes: CarShape[];
  errors: string[];
}

const HORIZONTAL = /^[a-z]$/;
const VERTICAL = /^[A-Z]$/;

function bounds(cells: Cell[]): { x: number; y: number; length: number } {
  const xs = cells.map((cell) => cell.x);
  const ys = cells.map((cell) => cell.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, length: Math.max(maxX - minX, maxY - minY) + 1 };
}

function isValidRun(cells: Cell[], orientation: Orientation): boolean {
  const sorted = [...cells].sort((a, b) =>
    orientation === 'h' ? a.x - b.x : a.y - b.y,
  );
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const current = sorted[i];
    if (orientation === 'h' && (current.x !== prev.x + 1 || current.y !== prev.y)) return false;
    if (orientation === 'v' && (current.y !== prev.y + 1 || current.x !== prev.x)) return false;
  }
  return true;
}

/** Разобрать карту уровня. Никогда не бросает исключение — ошибки возвращаются списком. */
export function parseMap(map: readonly string[]): ParseResult {
  const errors: string[] = [];
  const lines = map.map((line) => line.replace(/\s+$/, '')).filter((line, index, arr) => {
    // Убираем пустые строки только в конце карты.
    if (line.length > 0) return true;
    return arr.slice(index).some((item) => item.trim().length > 0);
  });

  const rows = lines.length;
  const cols = lines.reduce((max, line) => Math.max(max, line.length), 0);
  if (rows === 0 || cols === 0) {
    return { cols: 0, rows: 0, exitRow: 0, shapes: [], errors: ['Пустая карта уровня'] };
  }

  const groups = new Map<string, Cell[]>();
  for (let y = 0; y < rows; y += 1) {
    const line = lines[y].padEnd(cols, '.');
    for (let x = 0; x < cols; x += 1) {
      const char = line[x];
      if (char === '.' || char === ' ' || char === undefined) continue;
      if (char === '*') {
        const list = groups.get('*') ?? [];
        list.push({ x, y });
        groups.set('*', list);
        continue;
      }
      if (!HORIZONTAL.test(char) && !VERTICAL.test(char)) {
        errors.push(`Неизвестный символ «${char}» в строке ${y}`);
        continue;
      }
      const list = groups.get(char) ?? [];
      list.push({ x, y });
      groups.set(char, list);
    }
  }

  const shapes: CarShape[] = [];
  let exitRow = -1;

  for (const [key, cells] of groups) {
    const orientation = key === '*' ? 'h' : orientationOf(cells);
    if (!orientation) {
      errors.push(`Машина «${key}» должна быть одной прямой линией`);
      continue;
    }
    if (!isValidRun(cells, orientation)) {
      errors.push(`Машина «${key}» должна состоять из соседних клеток без разрывов`);
      continue;
    }
    const box = bounds(cells);
    if (box.length < 2) {
      errors.push(`Машина «${key}» короче двух клеток`);
      continue;
    }
    if (box.length > 4) {
      errors.push(`Машина «${key}» длиннее четырёх клеток`);
      continue;
    }
    const isTarget = key === '*';
    if (isTarget) {
      if (orientation !== 'h') {
        errors.push('Целевая машина должна быть горизонтальной');
        continue;
      }
      if (exitRow !== -1 && exitRow !== box.y) {
        errors.push('На карте может быть только одна целевая машина');
        continue;
      }
      exitRow = box.y;
    }
    shapes.push({
      id: isTarget ? 'target' : key,
      x: box.x,
      y: box.y,
      length: box.length,
      orientation,
      target: isTarget || undefined,
    });
  }

  if (exitRow === -1) errors.push('На карте нет целевой машины (символ «*»)');

  // Стабильный порядок: целевая машина первой, дальше по алфавиту.
  shapes.sort((a, b) => {
    if (a.target) return -1;
    if (b.target) return 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return { cols, rows, exitRow: Math.max(exitRow, 0), shapes, errors };
}

/** Собрать объект уровня из карты и «косметики». */
export function buildLevel(
  id: number,
  name: string,
  map: readonly string[],
  decorate: (shape: CarShape, index: number) => Pick<Car, 'kind' | 'color'>,
  par?: number,
): { level: Level; errors: string[] } {
  const parsed = parseMap(map);
  const cars: Car[] = parsed.shapes.map((shape, index) => ({
    ...shape,
    ...decorate(shape, index),
  }));
  const level: Level = {
    id,
    name,
    cols: parsed.cols,
    rows: parsed.rows,
    exitRow: parsed.exitRow,
    exitSide: 'right',
    cars,
    par,
  };
  return { level, errors: parsed.errors };
}
