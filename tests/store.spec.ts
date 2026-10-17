import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore, applyMoves } from '@/state/gameStore';
import { enumerateMoves } from '@/game/core/rules';
import { coinsForResult, starsForMoves } from '@/state/progressStore';
import { getLevel } from '@/game/levels/catalog';
import { isSolved, solve } from '@/game/core';

const level = getLevel(1)!;
/** Первый ход оптимального решения — тесты не зависят от конкретной карты. */
const solution = solve(level.cars, level.cols, level.rows, level.exitRow)!;
const firstMove = solution.moves[0];

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
    useGameStore.getState().registerMove(firstMove);
    const state = useGameStore.getState();
    expect(state.moves).toHaveLength(1);
    expect(state.moves[0]).toEqual(firstMove);
  });

  it('отмена возвращает машину на место', () => {
    const store = useGameStore.getState();
    store.registerMove(firstMove);
    useGameStore.getState().undo();
    const state = useGameStore.getState();
    expect(state.moves).toHaveLength(0);
    expect(state.cars).toEqual(level.cars);
  });

  it('прохождение уровня переводит сессию в статус «победа»', () => {
    for (const move of solution.moves) useGameStore.getState().registerMove(move);
    const state = useGameStore.getState();
    expect(state.status).toBe('won');
    expect(isSolved(level, state.cars)).toBe(true);
    expect(state.moves).toHaveLength(solution.steps);
  });

  it('после победы ходы не принимаются, а отмена недоступна', () => {
    for (const move of solution.moves) useGameStore.getState().registerMove(move);
    expect(useGameStore.getState().canUndo()).toBe(false);
    const extra = enumerateMoves(useGameStore.getState().cars, level.cols, level.rows)[0];
    if (extra) useGameStore.getState().registerMove(extra);
    expect(useGameStore.getState().moves).toHaveLength(solution.steps);
  });

  it('перезапуск возвращает уровень в исходное состояние', () => {
    useGameStore.getState().registerMove(firstMove);
    useGameStore.getState().restart();
    const state = useGameStore.getState();
    expect(state.moves).toHaveLength(0);
    expect(state.cars).toEqual(level.cars);
    expect(state.status).toBe('playing');
  });

  it('подсказка возвращает первый ход решения', () => {
    const payload = useGameStore.getState().showHint();
    expect(payload?.carId).toBe(firstMove.carId);
    expect(payload?.to).toBe(firstMove.to);
  });

  it('applyMoves воспроизводит расстановку из ходов', () => {
    const cars = applyMoves(level, solution.moves);
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
