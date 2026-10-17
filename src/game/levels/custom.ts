/**
 * Ручные (админские) уровни.
 *
 * Уровень из редактора заменяет одноимённый сгенерированный: карта, название
 * и пар берутся из сохранения. Хранилище двухуровневое:
 *
 * 1. `localStorage` — мгновенно и без сервера, работает и в собранной игре;
 * 2. файл `src/game/levels/custom-levels.json` — записывается кнопкой
 *    «В проект» через dev-сервер (см. `vite.config.ts`), чтобы правки можно
 *    было закоммитить и они пережили очистку браузера.
 *
 * Файл подмешивается как начальные значения, localStorage имеет приоритет.
 */

import customLevelsSeed from './custom-levels.json';
import { TIERS, type LevelTier } from './defs';

export interface CustomLevel {
  id: number;
  name: string;
  map: string[];
  par?: number;
  updatedAt: number;
}

export interface CustomLevelsFile {
  version: number;
  levels: CustomLevel[];
  /**
   * Уровни, удалённые из файла проекта. Без этого «Вернуть исходный» для
   * закоммиченного уровня оживал бы после перезагрузки страницы.
   */
  removed?: number[];
}

const STORAGE_KEY = 'parking-jam:custom-levels';
const MIN_ID = 1;
const MAX_ID = 100;
const MIN_SIZE = 5;
const MAX_SIZE = 9;
const MAX_NAME = 60;

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Карта должна быть прямоугольной и состоять из допустимых символов. */
export function isValidCustomMap(map: unknown): map is string[] {
  if (!Array.isArray(map) || map.length < MIN_SIZE || map.length > MAX_SIZE) return false;
  if (!map.every((row) => typeof row === 'string')) return false;
  const rows = map as string[];
  const width = rows[0].length;
  if (width < MIN_SIZE || width > MAX_SIZE) return false;
  return rows.every((row) => row.length === width && /^[.a-zA-Z*]+$/.test(row));
}

export function sanitizeCustomLevel(raw: unknown): CustomLevel | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Partial<CustomLevel>;
  if (!Number.isInteger(data.id) || (data.id as number) < MIN_ID || (data.id as number) > MAX_ID) {
    return null;
  }
  if (!isValidCustomMap(data.map)) return null;
  const name = typeof data.name === 'string' && data.name.trim().length > 0
    ? data.name.trim().slice(0, MAX_NAME)
    : `Уровень ${data.id}`;
  const par = Number.isFinite(data.par) ? Math.max(1, Math.round(data.par as number)) : undefined;
  return {
    id: data.id as number,
    name,
    map: [...data.map],
    par,
    updatedAt: Number.isFinite(data.updatedAt) ? Number(data.updatedAt) : 0,
  };
}

function readList(raw: unknown): CustomLevel[] {
  if (!raw || typeof raw !== 'object') return [];
  const list = (raw as { levels?: unknown }).levels;
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => sanitizeCustomLevel(item))
    .filter((item): item is CustomLevel => item !== null);
}

interface StoredPayload {
  levels: CustomLevel[];
  removed: number[];
}

function readStorage(): StoredPayload {
  const box = storage();
  if (!box) return { levels: [], removed: [] };
  try {
    const raw = box.getItem(STORAGE_KEY);
    if (!raw) return { levels: [], removed: [] };
    const parsed = JSON.parse(raw) as { removed?: unknown };
    const removed = Array.isArray(parsed.removed)
      ? parsed.removed.filter((id): id is number => Number.isInteger(id))
      : [];
    return { levels: readList(parsed as unknown), removed };
  } catch {
    return { levels: [], removed: [] };
  }
}

let cache: Record<number, CustomLevel> | null = null;
let tombstones: number[] = [];

function buildCache(): Record<number, CustomLevel> {
  const result: Record<number, CustomLevel> = {};
  const stored = readStorage();
  tombstones = stored.removed;
  // Сначала файл проекта, поверх — сохранения браузера.
  for (const level of readList(customLevelsSeed as unknown)) {
    if (!tombstones.includes(level.id)) result[level.id] = level;
  }
  for (const level of stored.levels) result[level.id] = level;
  return result;
}

function table(): Record<number, CustomLevel> {
  if (!cache) cache = buildCache();
  return cache;
}

/** Сбросить кэш (после импорта, очистки или внешнего изменения файла). */
export function reloadCustomLevels(): void {
  cache = null;
}

export function getCustomLevel(id: number): CustomLevel | undefined {
  return table()[id];
}

export function hasCustomLevel(id: number): boolean {
  return Boolean(table()[id]);
}

export function customLevelCount(): number {
  return Object.keys(table()).length;
}

/** Эффективный список: файл проекта + правки браузера. */
export function listCustomLevels(): CustomLevel[] {
  return Object.values(table()).sort((a, b) => a.id - b.id);
}

function persist(levels: CustomLevel[]): void {
  const box = storage();
  if (!box) return;
  try {
    const payload: CustomLevelsFile = { version: 1, levels, removed: tombstones };
    box.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* приватный режим или переполнение — данные останутся в памяти */
  }
}

function writeTable(next: Record<number, CustomLevel>): void {
  cache = next;
  persist(listCustomLevels());
}

export function saveCustomLevel(level: CustomLevel): void {
  const clean = sanitizeCustomLevel({ ...level, updatedAt: level.updatedAt || Date.now() });
  if (!clean) return;
  tombstones = tombstones.filter((item) => item !== clean.id);
  writeTable({ ...table(), [clean.id]: clean });
}

export function removeCustomLevel(id: number): void {
  const next = { ...table() };
  delete next[id];
  if (!tombstones.includes(id)) tombstones = [...tombstones, id];
  writeTable(next);
}

export function clearCustomLevels(): void {
  cache = {};
  tombstones = [];
  persist([]);
}

export function exportCustomLevels(): string {
  const payload: CustomLevelsFile = { version: 1, levels: listCustomLevels() };
  return JSON.stringify(payload, null, 2);
}

export interface ImportResult {
  added: number;
  skipped: number;
  error?: string;
}

/** Импорт JSON: уровни с известными id заменяются, новые добавляются. */
export function importCustomLevels(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { added: 0, skipped: 0, error: 'Это не JSON' };
  }
  const list = readList(parsed);
  if (list.length === 0) {
    return { added: 0, skipped: 0, error: 'В файле нет ни одного корректного уровня' };
  }
  const next = { ...table() };
  for (const level of list) next[level.id] = { ...level, updatedAt: Date.now() };
  tombstones = tombstones.filter((id) => !list.some((level) => level.id === id));
  writeTable(next);
  return { added: list.length, skipped: 0 };
}

/** Записать все правки в файл проекта (только на dev-сервере). */
export async function saveCustomLevelsToProject(): Promise<{ ok: boolean; count: number; error?: string }> {
  if (typeof fetch !== 'function') return { ok: false, count: 0, error: 'fetch недоступен' };
  try {
    const response = await fetch('/__admin/levels', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: exportCustomLevels(),
    });
    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      count?: number;
      error?: string;
    };
    if (!response.ok || !data.ok) {
      return { ok: false, count: 0, error: data.error ?? `HTTP ${response.status}` };
    }
    return { ok: true, count: data.count ?? 0 };
  } catch (error) {
    return { ok: false, count: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

const TIER_KEYS = Object.keys(TIERS) as LevelTier[];

export function tierForId(id: number): LevelTier {
  for (const tier of TIER_KEYS) {
    const range = TIERS[tier];
    if (id >= range.from && id <= range.to) return tier;
  }
  return 'master';
}

/** Готовый фрагмент для `src/game/levels/generated.ts` (на случай ручной вставки). */
export function customLevelSnippet(level: CustomLevel): string {
  const map = level.map.map((row) => `      '${row}',`).join('\n');
  return `  {
    id: ${level.id},
    name: '${level.name.replace(/'/g, "\\'")}',
    tier: '${tierForId(level.id)}',
    par: ${level.par ?? 1},
    map: [
${map}
    ],
  },`;
}
