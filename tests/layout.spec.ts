import { describe, expect, it } from 'vitest';
import {
  carPixelPos,
  computeMetrics,
  isInsideBoard,
  pointToCell,
} from '@/game/phaser/layout';
import {
  createDragSession,
  moveForDrag,
  snappedAxisPos,
  visualAxisPos,
} from '@/game/phaser/dragMath';
import type { Car } from '@/game/types';

const car = (partial: Partial<Car> & Pick<Car, 'id' | 'x' | 'y' | 'length' | 'orientation'>): Car =>
  ({ kind: 'sedan', color: 'blue', ...partial }) as Car;

describe('геометрия поля', () => {
  it('клетка не выходит за границы экрана на телефоне', () => {
    const metrics = computeMetrics(390, 780, 6, 6);
    const boardW = metrics.cols * metrics.cell;
    expect(metrics.originX).toBeGreaterThanOrEqual(0);
    expect(metrics.originX + boardW).toBeLessThanOrEqual(390);
    const boardH = metrics.rows * metrics.cell;
    expect(metrics.originY + boardH).toBeLessThanOrEqual(780);
  });

  it('на планшете клетка крупнее, но ограничена сверху', () => {
    const phone = computeMetrics(390, 780, 6, 6);
    const tablet = computeMetrics(1024, 1366, 6, 6);
    expect(tablet.cell).toBeGreaterThan(phone.cell);
    expect(tablet.cell).toBeLessThanOrEqual(104);
  });

  it('поле в 8x8 помещается на маленьком экране', () => {
    const metrics = computeMetrics(360, 640, 8, 8);
    expect(metrics.cell * 8 + metrics.margin * 2).toBeLessThanOrEqual(640);
  });

  it('координаты клетки переводятся в пиксели и обратно', () => {
    const metrics = computeMetrics(390, 780, 6, 6);
    const pos = carPixelPos(metrics, car({ id: 'a', x: 2, y: 3, length: 2, orientation: 'h' }), 2);
    const cell = pointToCell(metrics, pos.x, pos.y);
    expect(cell).toEqual({ x: 3, y: 3 });
    expect(isInsideBoard(metrics, cell.x, cell.y)).toBe(true);
    expect(isInsideBoard(metrics, -1, 3)).toBe(false);
  });
});

describe('перетаскивание', () => {
  const metrics = computeMetrics(390, 780, 6, 6);
  const horizontal = car({ id: 'h', x: 1, y: 2, length: 2, orientation: 'h' });
  const vertical = car({ id: 'v', x: 4, y: 0, length: 3, orientation: 'v' });

  it('горизонтальная машина едет только по X', () => {
    const session = createDragSession(horizontal, 100, 100, { min: 0, max: 4 });
    const moved = visualAxisPos(session, metrics, 100 + metrics.cell * 2, 100 + metrics.cell * 5);
    expect(moved).toBeCloseTo(3, 5);
  });

  it('вертикальная машина едет только по Y', () => {
    const session = createDragSession(vertical, 100, 100, { min: 0, max: 3 });
    const moved = visualAxisPos(session, metrics, 100 + metrics.cell * 5, 100 + metrics.cell);
    expect(moved).toBeCloseTo(1, 5);
  });

  it('машина не выезжает за пределы допустимого диапазона', () => {
    const session = createDragSession(vertical, 100, 100, { min: 0, max: 1 });
    expect(visualAxisPos(session, metrics, 100, 100 + metrics.cell * 6)).toBeCloseTo(1, 5);
    expect(visualAxisPos(session, metrics, 100, 100 - metrics.cell * 6)).toBeCloseTo(0, 5);
  });

  it('после отпускания машина встаёт на ближайшую клетку', () => {
    const session = createDragSession(horizontal, 100, 100, { min: 0, max: 4 });
    const near2 = snappedAxisPos(session, metrics, 100 + metrics.cell * 1.6, 100);
    expect(near2).toBe(3);
    const near1 = snappedAxisPos(session, metrics, 100 + metrics.cell * 1.4, 100);
    expect(near1).toBe(2);
  });

  it('микро-сдвиг не считается ходом', () => {
    const session = createDragSession(horizontal, 100, 100, { min: 0, max: 4 });
    expect(moveForDrag(session, metrics, 100 + metrics.cell * 0.3, 100)).toBeNull();
  });

  it('ход формируется с правильными координатами', () => {
    const session = createDragSession(horizontal, 100, 100, { min: 0, max: 4 });
    const move = moveForDrag(session, metrics, 100 + metrics.cell * 2.2, 100);
    expect(move).toEqual({ carId: 'h', axis: 'x', from: 1, to: 3 });
  });
});
