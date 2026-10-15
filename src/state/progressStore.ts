/**
 * Прогресс игрока: звёзды, монеты, покупки, настройки.
 *
 * Хранилище zustand-совместимое: любое изменение состояния автоматически
 * сохраняется (с небольшим дебаунсом) в IndexedDB/localStorage.
 */

import { create } from 'zustand';
import {
  defaultProgress,
  loadProgress,
  saveProgress,
  clearProgress,
  type LevelProgress,
  type ProgressSnapshot,
} from '@/services/storage';
import { getLevel, getPar } from '@/game/levels/catalog';
import type { Level } from '@/game/types';

export interface ShopItem {
  id: string;
  title: string;
  description: string;
  price: number;
  kind: 'hint' | 'undo' | 'parking' | 'cars';
  /** Для скинов — идентификатор оформления. */
  value?: string;
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'hint-1', title: 'Подсказка', description: '+1 подсказка в игре', price: 50, kind: 'hint' },
  { id: 'hint-5', title: '5 подсказок', description: 'Набор подсказок со скидкой', price: 200, kind: 'hint' },
  { id: 'undo-1', title: 'Отмена хода', description: '+3 отмены ходов', price: 60, kind: 'undo' },
  { id: 'undo-5', title: 'Куча отмен', description: '+15 отмен ходов', price: 220, kind: 'undo' },
  { id: 'parking-sunset', title: 'Оформление «Закат»', description: 'Тёплый асфальт и закатное небо', price: 300, kind: 'parking', value: 'sunset' },
  { id: 'parking-night', title: 'Оформление «Ночь»', description: 'Ночная парковка с подсветкой', price: 450, kind: 'parking', value: 'night' },
  { id: 'cars-candy', title: 'Цвета «Карамель»', description: 'Яркие сочные кузова', price: 250, kind: 'cars', value: 'candy' },
  { id: 'cars-noir', title: 'Цвета «Ночной город»', description: 'Сдержанные глубокие цвета', price: 400, kind: 'cars', value: 'noir' },
];

export interface ProgressState {
  hydrated: boolean;
  levels: Record<string, LevelProgress>;
  coins: number;
  hints: number;
  undos: number;
  parkingSkin: string;
  carSkin: string;
  soundEnabled: boolean;
  musicEnabled: boolean;
  vibrations: boolean;
  currentLevel: number;
  totalMoves: number;
  levelsCompleted: number;
  ownedSkins: string[];
  /** Действия */
  hydrate: (snapshot?: ProgressSnapshot) => void;
  completeLevel: (
    level: Level,
    moves: number,
  ) => { stars: number; coins: number; isNew: boolean; bestMoves: number };
  addCoins: (amount: number) => void;
  spendCoins: (amount: number) => boolean;
  purchase: (item: ShopItem) => boolean;
  setSkin: (kind: 'parking' | 'cars', value: string) => void;
  useHint: () => boolean;
  useUndo: () => boolean;
  addHints: (count: number) => void;
  addUndos: (count: number) => void;
  setSetting: (key: 'soundEnabled' | 'musicEnabled' | 'vibrations', value: boolean) => void;
  setCurrentLevel: (levelId: number) => void;
  isLevelUnlocked: (levelId: number) => boolean;
  starsFor: (levelId: number) => number;
  totalStars: () => number;
  resetProgress: () => void;
  snapshot: () => ProgressSnapshot;
}

/** Правила звёзд: 3 — по пару, 2 — с небольшим запасом, 1 — уровень пройден. */
export function starsForMoves(par: number, moves: number): number {
  if (moves <= par) return 3;
  if (moves <= Math.ceil(par * 1.4)) return 2;
  return 1;
}

/** Награда монетами за прохождение. */
export function coinsForResult(par: number, moves: number, stars: number, isNew: boolean): number {
  const base = isNew ? 20 : 5;
  const starBonus = stars * 10;
  const efficiency = Math.max(0, par - moves) * 2;
  return base + starBonus + efficiency;
}

function snapshotFromState(state: ProgressState): ProgressSnapshot {
  return {
    levels: state.levels,
    coins: state.coins,
    hints: state.hints,
    undos: state.undos,
    parkingSkin: state.parkingSkin,
    carSkin: state.carSkin,
    soundEnabled: state.soundEnabled,
    musicEnabled: state.musicEnabled,
    vibrations: state.vibrations,
    currentLevel: state.currentLevel,
    totalMoves: state.totalMoves,
    levelsCompleted: state.levelsCompleted,
    version: 1,
  };
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSave(state: ProgressState): void {
  if (!state.hydrated) return;
  const snapshot = snapshotFromState(state);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void saveProgress(snapshot);
  }, 250);
}

export const useProgressStore = create<ProgressState>((set, get) => ({
  hydrated: false,
  levels: {},
  coins: 0,
  hints: 3,
  undos: 3,
  parkingSkin: defaultProgress().parkingSkin,
  carSkin: defaultProgress().carSkin,
  soundEnabled: true,
  musicEnabled: true,
  vibrations: true,
  currentLevel: 1,
  totalMoves: 0,
  levelsCompleted: 0,
  ownedSkins: [],

  hydrate: (snapshot) =>
    set((state) => {
      const data = snapshot ?? defaultProgress();
      return {
        ...state,
        hydrated: true,
        levels: data.levels,
        coins: data.coins,
        hints: data.hints,
        undos: data.undos,
        parkingSkin: data.parkingSkin,
        carSkin: data.carSkin,
        soundEnabled: data.soundEnabled,
        musicEnabled: data.musicEnabled,
        vibrations: data.vibrations,
        currentLevel: data.currentLevel,
        totalMoves: data.totalMoves,
        levelsCompleted: data.levelsCompleted,
      };
    }),

  completeLevel: (level, moves) => {
    const par = getPar(level);
    const stars = starsForMoves(par, moves);
    const key = String(level.id);
    const previous = get().levels[key];
    const isNew = !previous;
    const bestMoves = previous ? Math.min(previous.bestMoves, moves) : moves;
    const bestStars = Math.max(previous?.stars ?? 0, stars);
    const coins = coinsForResult(par, moves, stars, isNew);
    set((state) => ({
      levels: { ...state.levels, [key]: { stars: bestStars, bestMoves } },
      coins: state.coins + coins,
      levelsCompleted: isNew ? state.levelsCompleted + 1 : state.levelsCompleted,
      totalMoves: state.totalMoves + moves,
      currentLevel: Math.max(state.currentLevel, level.id),
    }));
    scheduleSave(get());
    return { stars, coins, isNew, bestMoves };
  },

  addCoins: (amount) => {
    set((state) => ({ coins: Math.max(0, state.coins + amount) }));
    scheduleSave(get());
  },

  spendCoins: (amount) => {
    if (get().coins < amount) return false;
    set((state) => ({ coins: state.coins - amount }));
    scheduleSave(get());
    return true;
  },

  purchase: (item) => {
    if (item.kind === 'parking' || item.kind === 'cars') {
      if (get().ownedSkins.includes(item.id)) {
        get().setSkin(item.kind, item.value ?? '');
        return true;
      }
    }
    if (!get().spendCoins(item.price)) return false;
    set((state) => {
      if (item.kind === 'hint') {
        const count = item.id === 'hint-5' ? 5 : 1;
        return { hints: state.hints + count };
      }
      if (item.kind === 'undo') {
        const count = item.id === 'undo-5' ? 15 : 3;
        return { undos: state.undos + count };
      }
      return {
        ownedSkins: [...state.ownedSkins, item.id],
        ...(item.kind === 'parking'
          ? { parkingSkin: item.value ?? state.parkingSkin }
          : { carSkin: item.value ?? state.carSkin }),
      };
    });
    scheduleSave(get());
    return true;
  },

  setSkin: (kind, value) => {
    set(kind === 'parking' ? { parkingSkin: value } : { carSkin: value });
    scheduleSave(get());
  },

  useHint: () => {
    const { hints } = get();
    if (hints <= 0) return false;
    set({ hints: hints - 1 });
    scheduleSave(get());
    return true;
  },

  useUndo: () => {
    const { undos } = get();
    if (undos <= 0) return false;
    set({ undos: undos - 1 });
    scheduleSave(get());
    return true;
  },

  addHints: (count) => {
    set((state) => ({ hints: state.hints + count }));
    scheduleSave(get());
  },

  addUndos: (count) => {
    set((state) => ({ undos: state.undos + count }));
    scheduleSave(get());
  },

  setSetting: (key, value) => {
    set({ [key]: value } as Pick<ProgressState, typeof key>);
    scheduleSave(get());
  },

  setCurrentLevel: (levelId) => {
    set({ currentLevel: levelId });
    scheduleSave(get());
  },

  isLevelUnlocked: (levelId) => {
    if (levelId <= 1) return true;
    const previous = get().levels[String(levelId - 1)];
    return Boolean(previous && previous.stars > 0);
  },

  starsFor: (levelId) => get().levels[String(levelId)]?.stars ?? 0,

  totalStars: () =>
    Object.values(get().levels).reduce((sum, item) => sum + (item?.stars ?? 0), 0),

  resetProgress: () => {
    void clearProgress();
    set({
      levels: {},
      coins: 0,
      hints: 3,
      undos: 3,
      currentLevel: 1,
      totalMoves: 0,
      levelsCompleted: 0,
      ownedSkins: [],
      parkingSkin: defaultProgress().parkingSkin,
      carSkin: defaultProgress().carSkin,
    });
    scheduleSave(get());
  },

  snapshot: () => snapshotFromState(get()),
}));

/** Загрузить сохранение и наполнить хранилище. */
export async function hydrateProgress(): Promise<void> {
  const snapshot = await loadProgress();
  useProgressStore.getState().hydrate(snapshot);
}

/** Уровень, который нужно открыть по кнопке «Играть». */
export function nextLevelToPlay(): Level | undefined {
  const { currentLevel, levels } = useProgressStore.getState();
  if (!levels[String(currentLevel)]?.stars) return getLevel(currentLevel);
  for (let id = 1; id <= 100; id += 1) {
    if (!levels[String(id)]?.stars) {
      const level = getLevel(id);
      if (level) return level;
    }
  }
  return getLevel(currentLevel);
}

export function isOwned(item: ShopItem): boolean {
  return useProgressStore.getState().ownedSkins.includes(item.id);
}
