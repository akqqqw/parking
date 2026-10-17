/**
 * Состояние текущей игровой сессии.
 *
 * Здесь хранится список совершённых ходов — это единственный источник истины
 * для положения машин. Позиции вычисляются чистыми функциями ядра
 * (`applyMoves`), поэтому отмена хода и перезапуск не требуют никакой
 * синхронизации с видео-слоем: сцена Phaser просто отображает это состояние.
 */

import { create } from 'zustand';
import { isSolved, replaceCar, withPos, solve } from '@/game/core';
import { stateKey } from '@/game/core/rules';
import type { Car, CarColorKey, GameStatus, Level, Move } from '@/game/types';
import type { Solution } from '@/game/core/solver';

/** Восстановить расстановку по списку ходов. */
export function applyMoves(level: Level, moves: readonly Move[]): Car[] {
  let cars = level.cars;
  for (const move of moves) {
    const car = cars.find((item) => item.id === move.carId);
    if (!car) continue;
    cars = replaceCar(cars, withPos(car, move.to));
  }
  return cars;
}

/**
 * Кэш решений: поиск оптимального хода — самый тяжёлый расчёт в игре
 * (на самых плотных уровнях до ~0.8 с), поэтому результат для конкретной
 * расстановки запоминается: повторная подсказка на том же состоянии мгновенна.
 */
const solutionCache = new Map<string, Solution | null>();
const SOLUTION_CACHE_LIMIT = 60;

/** Сбросить кэш решений (после правки карты в админ-панели). */
export function clearSolutionCache(): void {
  solutionCache.clear();
}

/** Оптимальное решение для расстановки (с кэшированием по состоянию). */
export function findSolution(level: Level, cars: Car[]): Solution | null {
  const key = `${level.id}|${stateKey(cars)}`;
  const cached = solutionCache.get(key);
  if (cached !== undefined) return cached;
  const solution = solve(cars, level.cols, level.rows, level.exitRow, { maxStates: 200_000 });
  if (solutionCache.size >= SOLUTION_CACHE_LIMIT) {
    const oldest = solutionCache.keys().next().value;
    if (oldest !== undefined) solutionCache.delete(oldest);
  }
  solutionCache.set(key, solution);
  return solution;
}

export interface HintPayload {
  carId: string;
  token: number;
  /** Направление подсказанного хода — для стрелки на экране. */
  to: number;
  axis: 'x' | 'y';
}

export interface GameStoreState {
  level: Level | null;
  moves: Move[];
  /** Производное состояние: расстановка после применённых ходов. */
  cars: Car[];
  status: GameStatus;
  /** Счётчик перезапусков: сцена по нему понимает, что нужно пересобрать уровень. */
  resetToken: number;
  hint: HintPayload | null;
  hintsUsed: number;
  /** Награда за текущий заход уже начислена (защита от двойного начисления). */
  rewardGranted: boolean;
  startLevel: (level: Level) => void;
  restart: () => void;
  registerMove: (move: Move) => void;
  undo: () => void;
  canUndo: () => boolean;
  showHint: () => HintPayload | null;
  clearHint: () => void;
  markRewardGranted: () => void;
  leaveLevel: () => void;
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  level: null,
  moves: [],
  cars: [],
  status: 'playing',
  resetToken: 0,
  hint: null,
  hintsUsed: 0,
  rewardGranted: false,

  startLevel: (level) =>
    set((state) => ({
      level,
      moves: [],
      cars: level.cars,
      status: 'playing',
      hint: null,
      hintsUsed: 0,
      rewardGranted: false,
      resetToken: state.resetToken + 1,
    })),

  restart: () =>
    set((state) => {
      if (!state.level) return state;
      return {
        moves: [],
        cars: state.level.cars,
        status: 'playing',
        hint: null,
        hintsUsed: 0,
        rewardGranted: false,
        resetToken: state.resetToken + 1,
      };
    }),

  registerMove: (move) =>
    set((state) => {
      if (!state.level || state.status === 'won') return state;
      const car = state.cars.find((item) => item.id === move.carId);
      if (!car) return state;
      const from = car.orientation === 'h' ? car.x : car.y;
      if (from === move.to) return state;
      const normalized: Move = {
        carId: move.carId,
        axis: car.orientation === 'h' ? 'x' : 'y',
        from,
        to: move.to,
      };
      const moves = [...state.moves, normalized];
      const cars = replaceCar(state.cars, withPos(car, normalized.to));
      return {
        moves,
        cars,
        status: isSolved(state.level, cars) ? 'won' : 'playing',
        hint: null,
      };
    }),

  undo: () =>
    set((state) => {
      if (!state.level || state.moves.length === 0 || state.status === 'won') return state;
      const moves = state.moves.slice(0, -1);
      let cars = state.level.cars;
      for (const move of moves) {
        const car = cars.find((item) => item.id === move.carId);
        if (car) cars = replaceCar(cars, withPos(car, move.to));
      }
      return { moves, cars, status: 'playing', hint: null };
    }),

  canUndo: () => {
    const { moves, status } = get();
    return moves.length > 0 && status !== 'won';
  },

  showHint: () => {
    const { level, cars } = get();
    if (!level) return null;
    const solution = findSolution(level, cars);
    if (!solution || solution.moves.length === 0) return null;
    const first = solution.moves[0];
    const payload: HintPayload = {
      carId: first.carId,
      token: Date.now(),
      to: first.to,
      axis: first.axis,
    };
    set((state) => ({ hint: payload, hintsUsed: state.hintsUsed + 1 }));
    return payload;
  },

  clearHint: () => set({ hint: null }),

  markRewardGranted: () => set({ rewardGranted: true }),

  leaveLevel: () =>
    set({
      level: null,
      moves: [],
      cars: [],
      status: 'playing',
      hint: null,
      rewardGranted: false,
    }),
}));

/** Утилита для тестов и отладки: расстановка по уровню и ходам. */
export function carColor(cars: Car[], id: string): CarColorKey | undefined {
  return cars.find((car) => car.id === id)?.color;
}
