import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore, applyMoves } from '@/state/gameStore';
import { coinsForResult, starsForMoves } from '@/state/progressStore';
import { getLevel } from '@/game/levels/catalog';
import { isSolved, solve } from '@/game/core';

const level = getLevel(1)!;

describe('игровая сессия', () => {
  beforeEach(() => {
    useGameStore.getState().startLevel(level);
  });

  it('стартует с исходной расстановкой и без ходов', () => {
    const state = useGameStore.getState();
    expect(state.moves).toHaveLength(0);
    expect(state.status).toBe('playing');
    expect(state.cars).toEqual(level.cars);
  });

  it('ход применяется и увеличивает счётчик', () => {
    useGameStore.getState().registerMove({ carId: 'a', axis: 'y', from: 0, to: 3 });
    const state = useGameStore.getState();
    expect(state.moves).toHaveLength(1);
    expect(state.cars.find((car) => car.id === 'a')?.y).toBe(3);
  });

  it('отмена возвращает машину на место', () => {
    const store = useGameStore.getState();
    store.registerMove({ carId: 'a', axis: 'y', from: 0, to: 3 });
    useGameStore.getState().undo();
    const state = useGameStore.getState();
    expect(state.moves).toHaveLength(0);
    expect(state.cars.find((car) => car.id === 'a')?.y).toBe(0);
    expect(state.cars).toEqual(level.cars);
  });

  it('прохождение уровня переводит сессию в статус «победа»', () => {
    const store = useGameStore.getState();
    store.registerMove({ carId: 'a', axis: 'y', from: 0, to: 3 });
    useGameStore.getState().registerMove({ carId: 'target', axis: 'x', from: 1, to: 4 });
    const state = useGameStore.getState();
    expect(state.status).toBe('won');
    expect(isSolved(level, state.cars)).toBe(true);
    expect(state.moves).toHaveLength(2);
  });

  it('после победы ходы не принимаются, а отмена недоступна', () => {
    const store = useGameStore.getState();
    store.registerMove({ carId: 'a', axis: 'y', from: 0, to: 3 });
    useGameStore.getState().registerMove({ carId: 'target', axis: 'x', from: 1, to: 4 });
    expect(useGameStore.getState().canUndo()).toBe(false);
    useGameStore.getState().registerMove({ carId: 'target', axis: 'x', from: 4, to: 3 });
    expect(useGameStore.getState().moves).toHaveLength(2);
  });

  it('перезапуск возвращает уровень в исходное состояние', () => {
    useGameStore.getState().registerMove({ carId: 'a', axis: 'y', from: 0, to: 3 });
    useGameStore.getState().restart();
    const state = useGameStore.getState();
    expect(state.moves).toHaveLength(0);
    expect(state.cars).toEqual(level.cars);
    expect(state.status).toBe('playing');
  });

  it('подсказка возвращает первый ход решения', () => {
    const payload = useGameStore.getState().showHint();
    const solution = solve(level.cars, level.cols, level.rows, level.exitRow)!;
    expect(payload?.carId).toBe(solution.moves[0].carId);
    expect(payload?.to).toBe(solution.moves[0].to);
  });

  it('applyMoves воспроизводит расстановку из ходов', () => {
    const moves = [
      { carId: 'a', axis: 'y' as const, from: 0, to: 3 },
      { carId: 'target', axis: 'x' as const, from: 1, to: 4 },
    ];
    const cars = applyMoves(level, moves);
    expect(isSolved(level, cars)).toBe(true);
  });
});

describe('звёзды и монеты', () => {
  it('три звезды за пар и меньше', () => {
    expect(starsForMoves(5, 5)).toBe(3);
    expect(starsForMoves(5, 3)).toBe(3);
  });

  it('две звезды за небольшой запас ходов', () => {
    expect(starsForMoves(5, 6)).toBe(2);
    expect(starsForMoves(5, 7)).toBe(2);
  });

  it('одна звезда за длинное прохождение', () => {
    expect(starsForMoves(5, 12)).toBe(1);
  });

  it('монет больше за меньшее число ходов', () => {
    const perfect = coinsForResult(5, 5, 3, true);
    const slow = coinsForResult(5, 14, 1, true);
    expect(perfect).toBeGreaterThan(slow);
    expect(slow).toBeGreaterThan(0);
  });
});
