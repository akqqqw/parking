import { describe, expect, it } from 'vitest';
import {
  applyMove,
  buildOccupancy,
  carCells,
  enumerateMoves,
  isSolved,
  isValidMove,
  minimumMoves,
  slideRange,
  solve,
  validateArrangement,
} from '@/game/core';
import { parseMap } from '@/game/levels/parse';
import type { Car, Level } from '@/game/types';

function car(partial: Partial<Car> & Pick<Car, 'id' | 'x' | 'y' | 'length' | 'orientation'>): Car {
  return { kind: 'sedan', color: 'blue', ...partial } as Car;
}

const baseLevel: Pick<Level, 'cols' | 'rows' | 'exitRow' | 'exitSide'> = {
  cols: 6,
  rows: 6,
  exitRow: 2,
  exitSide: 'right',
};

describe('правила: клетки и занятость', () => {
  it('горизонтальная машина занимает клетки вправо', () => {
    const car4 = car({ id: 'a', x: 1, y: 2, length: 3, orientation: 'h' });
    expect(carCells(car4)).toEqual([
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
    ]);
  });

  it('вертикальная машина занимает клетки вниз', () => {
    const car4 = car({ id: 'a', x: 4, y: 0, length: 2, orientation: 'v' });
    expect(carCells(car4)).toEqual([
      { x: 4, y: 0 },
      { x: 4, y: 1 },
    ]);
  });

  it('пересечение машин — ошибка расстановки', () => {
    expect(() =>
      buildOccupancy(
        [
          car({ id: 'a', x: 0, y: 0, length: 2, orientation: 'h' }),
          car({ id: 'b', x: 1, y: 0, length: 2, orientation: 'h' }),
        ],
        6,
        6,
      ),
    ).toThrow();
  });
});

describe('правила: перемещение', () => {
  const cars: Car[] = [
    car({ id: 'target', x: 0, y: 2, length: 2, orientation: 'h', target: true, color: 'red' }),
    car({ id: 'a', x: 3, y: 0, length: 3, orientation: 'v' }),
  ];

  it('диапазон ограничен границей поля', () => {
    const occupancy = buildOccupancy(cars, 6, 6);
    const target = cars[0];
    expect(slideRange(target, occupancy, 6, 6)).toEqual({ min: 0, max: 1 });
  });

  it('после сдвига вертикальной машины цель может проехать к выезду', () => {
    expect(isSolved(baseLevel, cars)).toBe(false);
    const moved = applyMove(cars, { carId: 'a', axis: 'y', from: 0, to: 3 });
    const occupancy = buildOccupancy(moved, 6, 6);
    expect(slideRange(moved[0], occupancy, 6, 6)).toEqual({ min: 0, max: 4 });
    const solved = applyMove(moved, { carId: 'target', axis: 'x', from: 0, to: 4 });
    expect(isSolved(baseLevel, solved)).toBe(true);
  });

  it('ход на занятую клетку отклоняется', () => {
    expect(isValidMove(cars, { carId: 'target', axis: 'x', from: 0, to: 2 }, 6, 6)).toBe(false);
  });

  it('машина не может двигаться поперёк своей оси', () => {
    expect(isValidMove(cars, { carId: 'a', axis: 'x', from: 0, to: 1 }, 6, 6)).toBe(false);
  });

  it('enumerateMoves возвращает только допустимые сдвиги', () => {
    const moves = enumerateMoves(cars, 6, 6);
    expect(moves.every((move) => isValidMove(cars, move, 6, 6))).toBe(true);
    expect(moves.some((move) => move.carId === 'a' && move.to === 3)).toBe(true);
    expect(moves.some((move) => move.carId === 'target' && move.to === 2)).toBe(false);
  });
});

describe('решатель', () => {
  it('находит минимальное решение для простого уровня', () => {
    const cars: Car[] = [
      car({ id: 'target', x: 0, y: 2, length: 2, orientation: 'h', target: true, color: 'red' }),
      car({ id: 'a', x: 3, y: 0, length: 3, orientation: 'v' }),
    ];
    const solution = solve(cars, 6, 6, 2);
    expect(solution?.steps).toBe(2);
    expect(minimumMoves(cars, 6, 6, 2)).toBe(2);
  });

  it('уровень без решения возвращает null', () => {
    const cars: Car[] = [
      car({ id: 'target', x: 0, y: 2, length: 2, orientation: 'h', target: true, color: 'red' }),
      // Вертикальная «стена» через строку выезда, которой некуда деться.
      car({ id: 'wall', x: 2, y: 0, length: 2, orientation: 'v' }),
      car({ id: 'block', x: 2, y: 2, length: 2, orientation: 'v' }),
      car({ id: 'block2', x: 2, y: 4, length: 2, orientation: 'v' }),
      car({ id: 'block3', x: 4, y: 0, length: 2, orientation: 'v' }),
      car({ id: 'block4', x: 4, y: 2, length: 2, orientation: 'v' }),
      car({ id: 'block5', x: 4, y: 4, length: 2, orientation: 'v' }),
    ];
    expect(solve(cars, 6, 6, 2)).toBeNull();
  });

  it('предложенное решение действительно приводит к победе', () => {
    const { level } = buildTestLevel();
    const solution = solve(level.cars, level.cols, level.rows, level.exitRow);
    expect(solution).not.toBeNull();
    let cars = level.cars;
    for (const move of solution!.moves) {
      expect(isValidMove(cars, move, level.cols, level.rows)).toBe(true);
      cars = applyMove(cars, move);
    }
    expect(isSolved(level, cars)).toBe(true);
  });
});

describe('парсер карт', () => {
  it('разбирает карту и находит целевую машину', () => {
    const result = parseMap(['...a..', '...a..', '.**a..', '......', 'bb....', '....ee']);
    expect(result.errors).toEqual([]);
    expect(result.cols).toBe(6);
    expect(result.rows).toBe(6);
    expect(result.exitRow).toBe(2);
    const target = result.shapes.find((shape) => shape.target);
    expect(target).toMatchObject({ x: 1, y: 2, length: 2, orientation: 'h' });
  });

  it('сообщает об ошибках в карте', () => {
    expect(parseMap(['..a..', '..a..', '......']).errors.join(' ')).toContain('целевой');
    expect(parseMap(['a.a.a', '......', '**....']).errors.length).toBeGreaterThan(0);
  });
});

describe('валидация расстановки', () => {
  it('ловит машину, запирающую выезд', () => {
    const { level } = buildTestLevel();
    const broken: Level = {
      ...level,
      cars: [...level.cars, car({ id: 'lock', x: 4, y: 2, length: 2, orientation: 'h' })],
    };
    expect(validateArrangement(broken).join(' ')).toContain('запирает выезд');
  });

  it('находит проблему отсутствия решения', () => {
    const { level } = buildTestLevel();
    const broken: Level = { ...level, cars: [{ ...level.cars[0], y: 0 }] };
    expect(validateArrangement(broken).length).toBeGreaterThan(0);
  });
});

function buildTestLevel(): { level: Level } {
  const result = parseMap(['...a..', '...a..', '.**a..', '......', 'bb....', '....ee']);
  const cars: Car[] = result.shapes.map((shape) => ({
    ...shape,
    kind: 'sedan',
    color: shape.target ? 'red' : 'blue',
  }));
  return {
    level: {
      id: 999,
      name: 'test',
      cols: result.cols,
      rows: result.rows,
      exitRow: result.exitRow,
      exitSide: 'right',
      cars,
    },
  };
}
