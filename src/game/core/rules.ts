/**
 * Правила игры: сетка, столкновения, допустимые перемещения.
 *
 * Всё в этом модуле — чистые функции без побочных эффектов: они принимают
 * массив машин и возвращают новый. Именно эти функции являются единственным
 * источником истины о том, что в игре разрешено, а что нет (визуал их только
 * отображает).
 */

import type { Car, Cell, Level, Move, Orientation, SlideRange } from '../types';

/** Ось движения автомобиля в координатах сетки. */
export function carAxis(car: Car): 'x' | 'y' {
  return car.orientation === 'h' ? 'x' : 'y';
}

/** Позиция автомобиля вдоль его оси. */
export function carPos(car: Car): number {
  return car.orientation === 'h' ? car.x : car.y;
}

/** Позиция автомобиля поперёк его оси (строка для горизонтальных, колонка для вертикальных). */
export function carCross(car: Car): number {
  return car.orientation === 'h' ? car.y : car.x;
}

/** Клетки, которые занимает автомобиль. */
export function carCells(car: Car): Cell[] {
  const cells: Cell[] = [];
  for (let i = 0; i < car.length; i += 1) {
    cells.push(
      car.orientation === 'h' ? { x: car.x + i, y: car.y } : { x: car.x, y: car.y + i },
    );
  }
  return cells;
}

/** Копия автомобиля со сдвигом вдоль оси. */
export function withPos(car: Car, axisPos: number): Car {
  return car.orientation === 'h' ? { ...car, x: axisPos } : { ...car, y: axisPos };
}

/** Копия списка машин с заменённым автомобилем. */
export function replaceCar(cars: Car[], next: Car): Car[] {
  return cars.map((car) => (car.id === next.id ? next : car));
}

/**
 * Карта занятости клеток: `grid[y * cols + x]` — id автомобиля или `null`.
 */
export type Occupancy = (string | null)[];

export function buildOccupancy(cars: Car[], cols: number, rows: number): Occupancy {
  const grid: Occupancy = new Array<string | null>(cols * rows).fill(null);
  for (const car of cars) {
    for (const cell of carCells(car)) {
      if (cell.x < 0 || cell.y < 0 || cell.x >= cols || cell.y >= rows) {
        throw new Error(`Автомобиль ${car.id} выходит за пределы поля ${cols}x${rows}`);
      }
      const index = cell.y * cols + cell.x;
      if (grid[index]) {
        throw new Error(`Клетка (${cell.x}, ${cell.y}) занята двумя автомобилями`);
      }
      grid[index] = car.id;
    }
  }
  return grid;
}

export function isFree(occupancy: Occupancy, cols: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= cols) return false;
  return occupancy[y * cols + x] === null;
}

/**
 * Диапазон, в котором может находиться автомобиль вдоль своей оси
 * с учётом границ парковки и других машин.
 */
export function slideRange(
  car: Car,
  occupancy: Occupancy,
  cols: number,
  rows: number,
): SlideRange {
  const horizontal = car.orientation === 'h';
  const limit = horizontal ? cols : rows;
  const fixed = carCross(car);
  let min = carPos(car);
  let max = carPos(car);

  // Влево / вверх: проверяем только ту клетку, которую «освобождает» передний край.
  while (
    min - 1 >= 0 &&
    isFree(occupancy, cols, horizontal ? min - 1 : fixed, horizontal ? fixed : min - 1)
  ) {
    min -= 1;
  }
  // Вправо / вниз: проверяем клетку за задним краем.
  while (
    max + car.length < limit &&
    isFree(occupancy, cols, horizontal ? max + car.length : fixed, horizontal ? fixed : max + car.length)
  ) {
    max += 1;
  }
  return { min, max };
}

/** Диапазоны перемещения для всех машин уровня (удобно для подсказок и решателя). */
export function allSlideRanges(
  cars: Car[],
  cols: number,
  rows: number,
): Map<string, SlideRange> {
  const occupancy = buildOccupancy(cars, cols, rows);
  const result = new Map<string, SlideRange>();
  for (const car of cars) {
    result.set(car.id, slideRange(car, occupancy, cols, rows));
  }
  return result;
}

/** Список всех возможных ходов из текущей позиции (каждый — сдвиг одной машины). */
export function enumerateMoves(cars: Car[], cols: number, rows: number): Move[] {
  const moves: Move[] = [];
  for (const [carId, range] of allSlideRanges(cars, cols, rows)) {
    const car = cars.find((item) => item.id === carId);
    if (!car) continue;
    const axis = carAxis(car);
    const pos = carPos(car);
    for (let to = range.min; to <= range.max; to += 1) {
      if (to !== pos) moves.push({ carId, axis, from: pos, to });
    }
  }
  return moves;
}

/** Применить ход. Возвращает новый список машин (без мутации исходного). */
export function applyMove(cars: Car[], move: Move): Car[] {
  const car = cars.find((item) => item.id === move.carId);
  if (!car) return cars;
  return replaceCar(cars, withPos(car, move.to));
}

/** Проверка корректности хода по текущему состоянию. */
export function isValidMove(cars: Car[], move: Move, cols: number, rows: number): boolean {
  const car = cars.find((item) => item.id === move.carId);
  if (!car) return false;
  if (carAxis(car) !== move.axis) return false;
  if (move.to === carPos(car)) return false;
  const range = slideRange(car, buildOccupancy(cars, cols, rows), cols, rows);
  return move.to >= range.min && move.to <= range.max;
}

/** Целевой автомобиль уровня. */
export function targetCar(cars: Car[]): Car | undefined {
  return cars.find((car) => car.target);
}

/** Достигнут ли выезд: целевая машина упирается в правый край на строке выезда. */
export function isSolved(level: Pick<Level, 'cols' | 'exitRow' | 'exitSide'>, cars: Car[]): boolean {
  const target = targetCar(cars);
  if (!target) return false;
  if (target.orientation !== 'h') return false;
  if (target.y !== level.exitRow) return false;
  return target.x + target.length === level.cols;
}

/** Ключ состояния — используется решателем и для сравнения позиций. */
export function stateKey(cars: Car[]): string {
  return [...cars]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((car) => `${car.id}:${carPos(car)}`)
    .join('|');
}

/** Простая проверка валидности расстановки (используется тестами и парсером уровней). */
export function validateArrangement(level: Level): string[] {
  const errors: string[] = [];
  const target = targetCar(level.cars);
  if (!target) errors.push('Отсутствует целевой автомобиль');
  if (target && target.orientation !== 'h') {
    errors.push('Целевой автомобиль должен стоять горизонтально');
  }
  if (target && target.y !== level.exitRow) {
    errors.push('Целевой автомобиль должен находиться на строке выезда');
  }
  // Машина, стоящая горизонтально перед целевой на строке выезда, запирает
  // уровень навсегда: она тоже не может покинуть поле.
  if (target) {
    for (const car of level.cars) {
      if (car.target) continue;
      if (car.orientation === 'h' && car.y === level.exitRow && car.x > target.x) {
        errors.push(`Автомобиль ${car.id} запирает выезд (горизонтальный на строке выезда)`);
      }
    }
  }
  try {
    buildOccupancy(level.cars, level.cols, level.rows);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  for (const car of level.cars) {
    const axis = carAxis(car);
    const pos = carPos(car);
    const limit = axis === 'x' ? level.cols : level.rows;
    if (pos < 0 || pos + car.length > limit) {
      errors.push(`Автомобиль ${car.id} выходит за границы поля`);
    }
    if (car.length < 2) errors.push(`Автомобиль ${car.id} короче двух клеток`);
  }
  return errors;
}

/** Сколько клеток свободно справа от машины до выезда (для подсветки пути). */
export function pathToExit(level: Pick<Level, 'cols' | 'exitRow'>, cars: Car[]): Cell[] {
  const target = targetCar(cars);
  const cells: Cell[] = [];
  if (!target || target.orientation !== 'h') return cells;
  const startX = target.x + target.length;
  for (let x = startX; x < level.cols; x += 1) {
    cells.push({ x, y: level.exitRow });
  }
  return cells;
}

/** Ориентация по геометрии (используется парсером уровней). */
export function orientationOf(cells: Cell[]): Orientation | null {
  if (cells.length < 2) return null;
  const sameRow = cells.every((cell) => cell.y === cells[0].y);
  const sameCol = cells.every((cell) => cell.x === cells[0].x);
  if (sameRow) return 'h';
  if (sameCol) return 'v';
  return null;
}
