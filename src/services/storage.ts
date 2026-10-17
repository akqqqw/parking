/**
 * Сохранение прогресса.
 *
 * Основное хранилище — IndexedDB (через `idb`), резервное — localStorage.
 * Данные пишутся в оба места, поэтому прогресс переживает и приватный режим
 * браузера, и очистку одной из баз.
 *
 * Если игра запущена на Яндекс Играх и SDK проинициализирован, прогресс
 * дополнительно уезжает в облако (`cloudSave`), а при загрузке облачная копия
 * подмешивается к локальной — см. `src/services/yandex.ts`.
 */

export interface LevelProgress {
  stars: number;
  bestMoves: number;
}

export interface ProgressSnapshot {
  /** Прогресс по уровням: `id` → звёзды и лучший результат. */
  levels: Record<string, LevelProgress>;
  coins: number;
  hints: number;
  undos: number;
  parkingSkin: string;
  carSkin: string;
  soundEnabled: boolean;
  musicEnabled: boolean;
  vibrations: boolean;
  /** Показан ли новичку короткий урок на первом уровне. */
  tutorialSeen: boolean;
  currentLevel: number;
  totalMoves: number;
  levelsCompleted: number;
  version: number;
}

const DB_NAME = 'parking-jam-puzzle';
const DB_VERSION = 1;
const STORE_NAME = 'save';
const RECORD_KEY = 'progress';
const LS_KEY = 'parking-jam:progress';
export const SAVE_VERSION = 1;

import { cloudLoad, cloudSave } from './yandex';

export function defaultProgress(): ProgressSnapshot {
  return {
    levels: {},
    coins: 0,
    hints: 3,
    undos: 3,
    parkingSkin: 'day',
    carSkin: 'classic',
    soundEnabled: true,
    musicEnabled: true,
    vibrations: true,
    tutorialSeen: false,
    currentLevel: 1,
    totalMoves: 0,
    levelsCompleted: 0,
    version: SAVE_VERSION,
  };
}

function mergeProgress(raw: unknown): ProgressSnapshot {
  const base = defaultProgress();
  if (!raw || typeof raw !== 'object') return base;
  const data = raw as Partial<ProgressSnapshot>;
  return {
    ...base,
    ...data,
    levels: { ...(data.levels ?? {}) },
    coins: Number.isFinite(data.coins) ? Math.max(0, Math.round(data.coins as number)) : base.coins,
    hints: Number.isFinite(data.hints) ? Math.max(0, Math.round(data.hints as number)) : base.hints,
    undos: Number.isFinite(data.undos) ? Math.max(0, Math.round(data.undos as number)) : base.undos,
    version: SAVE_VERSION,
  };
}

/**
 * Минимальный структурный тип обёртки idb: библиотека подгружается динамически,
 * поэтому статически её типы не импортируются.
 */
interface IdbLike {
  get(store: string, key: string): Promise<unknown>;
  put(store: string, value: unknown, key: string): Promise<unknown>;
  delete(store: string, key: string): Promise<void>;
}

async function openDatabase(): Promise<IdbLike | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const { openDB } = await import('idb');
    const db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME);
        }
      },
    });
    return db as unknown as IdbLike;
  } catch {
    return null;
  }
}

function readLocalStorage(): ProgressSnapshot | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return mergeProgress(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function writeLocalStorage(snapshot: ProgressSnapshot): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(snapshot));
  } catch {
    /* приватный режим — игнорируем */
  }
}

/** Прогресс «больше» — сравниваем по звёздам и пройденным уровням. */
function progressWeight(snapshot: ProgressSnapshot): number {
  const stars = Object.values(snapshot.levels).reduce((sum, item) => sum + (item?.stars ?? 0), 0);
  return stars * 1000 + snapshot.levelsCompleted;
}

/** Загрузить прогресс: локальные базы, затем облако (если доступно). */
export async function loadProgress(): Promise<ProgressSnapshot> {
  let local: ProgressSnapshot | null = readLocalStorage();
  const db = await openDatabase();
  if (db) {
    try {
      const stored = await db.get(STORE_NAME, RECORD_KEY);
      if (stored) {
        local = mergeProgress(stored);
        writeLocalStorage(local);
      }
    } catch {
      /* игнорируем и пробуем резерв */
    }
  }

  const cloud = await cloudLoad();
  if (cloud) {
    const remote = mergeProgress(cloud);
    if (!local || progressWeight(remote) > progressWeight(local)) {
      await saveProgress(remote, false);
      return remote;
    }
  }

  if (local) {
    if (!db) await saveProgress(local);
    return local;
  }
  return defaultProgress();
}

/** Сохранить прогресс (IndexedDB + localStorage + облако, если оно есть). */
export async function saveProgress(snapshot: ProgressSnapshot, toCloud = true): Promise<void> {
  writeLocalStorage(snapshot);
  if (toCloud) void cloudSave(snapshot);
  const db = await openDatabase();
  if (!db) return;
  try {
    await db.put(STORE_NAME, snapshot, RECORD_KEY);
  } catch {
    /* остаётся резервная копия в localStorage */
  }
}

/** Полностью сбросить прогресс (кнопка в настройках). */
export async function clearProgress(): Promise<void> {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ничего */
  }
  const db = await openDatabase();
  if (!db) return;
  try {
    await db.delete(STORE_NAME, RECORD_KEY);
  } catch {
    /* ничего */
  }
}
