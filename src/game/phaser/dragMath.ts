/**
 * Математика перетаскивания машин.
 *
 * Вынесена из сцены в чистые функции: так поведение «палец → клетка»
 * проверяется тестами без браузера и Phaser.
 */

import type { Car, Move, SlideRange } from '../types';
import type { Metrics } from './layout';

export interface DragSession {
  /** Снимок машины на момент начала перетаскивания. */
  car: Car;
  /** Координата машины вдоль оси в момент начала. */
  startAxisPos: number;
  pointerStartX: number;
  pointerStartY: number;
  /** Куда машина может уехать (границы поля и соседние машины). */
  range: SlideRange;
}

export function createDragSession(
  car: Car,
  pointerX: number,
  pointerY: number,
  range: SlideRange,
): DragSession {
  return {
    car,
    startAxisPos: car.orientation === 'h' ? car.x : car.y,
    pointerStartX: pointerX,
    pointerStartY: pointerY,
    range,
  };
}

export function clampAxisPos(value: number, range: SlideRange): number {
  return Math.max(range.min, Math.min(range.max, value));
}

/** Смещение пальца/курсора вдоль оси машины, в клетках. */
export function dragDeltaCells(
  session: DragSession,
  metrics: Metrics,
  pointerX: number,
  pointerY: number,
): number {
  const deltaPx =
    session.car.orientation === 'h'
      ? pointerX - session.pointerStartX
      : pointerY - session.pointerStartY;
  return deltaPx / metrics.cell;
}

/** Дробная координата машины вдоль оси во время перетаскивания. */
export function visualAxisPos(
  session: DragSession,
  metrics: Metrics,
  pointerX: number,
  pointerY: number,
): number {
  return clampAxisPos(
    session.startAxisPos + dragDeltaCells(session, metrics, pointerX, pointerY),
    session.range,
  );
}

/** Клетка, на которую встанет машина после отпускания. */
export function snappedAxisPos(
  session: DragSession,
  metrics: Metrics,
  pointerX: number,
  pointerY: number,
): number {
  return clampAxisPos(
    Math.round(visualAxisPos(session, metrics, pointerX, pointerY)),
    session.range,
  );
}

/** Ход, который нужно записать в состояние (или `null`, если машина вернулась на место). */
export function moveForDrag(
  session: DragSession,
  metrics: Metrics,
  pointerX: number,
  pointerY: number,
): Move | null {
  const to = snappedAxisPos(session, metrics, pointerX, pointerY);
  if (to === session.startAxisPos) return null;
  return {
    carId: session.car.id,
    axis: session.car.orientation === 'h' ? 'x' : 'y',
    from: session.startAxisPos,
    to,
  };
}

/**
 * Ближайшая клетка вдоль оси — используется, чтобы подсветить «магнит»
 * во время перетаскивания.
 */
export function snapHint(session: DragSession, metrics: Metrics, value: number): number {
  void metrics;
  return clampAxisPos(Math.round(value), session.range);
}
