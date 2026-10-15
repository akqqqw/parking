/**
 * Общие описания уровней.
 *
 * Отдельный модуль нужен, чтобы сгенерированный файл уровней
 * (`generated.ts`) мог импортировать типы, не создавая циклическую зависимость
 * с `catalog.ts`.
 */

export type LevelTier = 'tutorial' | 'easy' | 'medium' | 'hard' | 'expert' | 'master';

export interface LevelDef {
  id: number;
  name: string;
  tier: LevelTier;
  /** Карта парковки в текстовом виде (см. `parse.ts`). */
  map: string[];
  /**
   * Минимальное количество ходов. Считается решателем при генерации;
   * если не указано — вычисляется на лету.
   */
  par?: number;
}

export const TIERS: Record<LevelTier, { label: string; from: number; to: number }> = {
  tutorial: { label: 'Обучение', from: 1, to: 10 },
  easy: { label: 'Легко', from: 11, to: 25 },
  medium: { label: 'Средне', from: 26, to: 45 },
  hard: { label: 'Сложно', from: 46, to: 65 },
  expert: { label: 'Очень сложно', from: 66, to: 85 },
  master: { label: 'Эксперт', from: 86, to: 100 },
};

export const TIER_ORDER: LevelTier[] = ['tutorial', 'easy', 'medium', 'hard', 'expert', 'master'];
