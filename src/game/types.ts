/**
 * Базовые типы игры «Парковочный переполох».
 *
 * Модуль не зависит ни от Phaser, ни от React — это чистые данные,
 * которыми пользуются и логика, и интерфейс, и (в будущем) сервер.
 */

/** Ориентация автомобиля на парковке: `h` — по горизонтали, `v` — по вертикали. */
export type Orientation = 'h' | 'v';

/** Тип кузова. Влияет только на отрисовку и подбор габаритов. */
export type CarKind = 'hatch' | 'sedan' | 'suv' | 'van' | 'bus' | 'truck';

/** Ключ цвета из палитры (см. `theme/palettes.ts`). Позволяет менять наборы цветов в магазине. */
export type CarColorKey =
  | 'red'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'orange'
  | 'purple'
  | 'teal'
  | 'pink'
  | 'silver'
  | 'graphite'
  | 'lime'
  | 'bronze';

/** Автомобиль на парковке. Координаты — в клетках сетки. */
export interface Car {
  /** Уникальный идентификатор внутри уровня. */
  id: string;
  kind: CarKind;
  color: CarColorKey;
  /** Длина вдоль оси движения в клетках (2, 3 или 4). */
  length: number;
  /** Колонка левой клетки (для горизонтальных — начало, для вертикальных — единственная колонка). */
  x: number;
  /** Строка верхней клетки. */
  y: number;
  orientation: Orientation;
  /** Целевой автомобиль, который нужно вывести через выезд. */
  target?: boolean;
}

/** Клетка сетки. */
export interface Cell {
  x: number;
  y: number;
}

/** Описание уровня. */
export interface Level {
  id: number;
  name: string;
  cols: number;
  rows: number;
  /** Строка, в которой находится выезд с парковки. */
  exitRow: number;
  /** Сторона выезда. В первой версии — только справа. */
  exitSide: 'right';
  cars: Car[];
  /** Минимально возможное число ходов (пара). Считается решателем. */
  par?: number;
}

/** Совершённый ход: сдвиг автомобиля вдоль своей оси. */
export interface Move {
  carId: string;
  /** Координата вдоль оси: `x` для горизонтальных, `y` для вертикальных. */
  axis: 'x' | 'y';
  from: number;
  to: number;
}

/** Диапазон допустимых координат автомобиля вдоль его оси (включительно). */
export interface SlideRange {
  min: number;
  max: number;
}

/** Состояние игровой сессии. */
export type GameStatus = 'playing' | 'won';
