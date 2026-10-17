import { describe, expect, it } from 'vitest';
import {
  DAILY_BASE_BONUS,
  DAILY_FIRST_LEVEL,
  DAILY_LAST_LEVEL,
  addDays,
  dailyLevelId,
  dailyReward,
  dateKey,
  isYesterday,
} from '@/game/daily';

describe('задача дня', () => {
  it('выбирает уровень детерминированно и в допустимом диапазоне', () => {
    const keys = Array.from({ length: 60 }, (_, index) => addDays('2026-01-01', index));
    for (const key of keys) {
      const id = dailyLevelId(key, 100);
      expect(id).toBeGreaterThanOrEqual(DAILY_FIRST_LEVEL);
      expect(id).toBeLessThanOrEqual(DAILY_LAST_LEVEL);
      expect(dailyLevelId(key, 100)).toBe(id);
    }
  });

  it('не выдаёт уровни выше пула, даже если каталог длиннее', () => {
    for (let day = 0; day < 40; day += 1) {
      const id = dailyLevelId(addDays('2026-02-01', day), 1000);
      expect(id).toBeLessThanOrEqual(DAILY_LAST_LEVEL);
    }
    // Короткий каталог тоже не ломает выбор.
    const short = dailyLevelId('2026-02-01', 12);
    expect(short).toBeGreaterThanOrEqual(DAILY_FIRST_LEVEL);
    expect(short).toBeLessThanOrEqual(12);
  });

  it('не повторяет уровень два дня подряд и не застревает на одном', () => {
    const keys = Array.from({ length: 120 }, (_, index) => addDays('2026-01-01', index));
    const ids = keys.map((key) => dailyLevelId(key, 100));
    for (let index = 1; index < ids.length; index += 1) {
      expect(ids[index]).not.toBe(ids[index - 1]);
    }
    // Пул — уровни 6…50, за 120 дней должно выпасть большинство из них.
    expect(new Set(ids).size).toBeGreaterThan(35);
  });

  it('шаг даты переживает конец месяца и года', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(isYesterday('2026-10-16', '2026-10-17')).toBe(true);
    expect(isYesterday('2026-10-15', '2026-10-17')).toBe(false);
  });

  it('ключ даты — локальный календарный день', () => {
    expect(dateKey(new Date(2026, 9, 7, 23, 59))).toBe('2026-10-07');
    expect(dateKey(new Date(2026, 0, 1, 0, 1))).toBe('2026-01-01');
  });

  it('награда растёт с серией, но имеет потолок', () => {
    expect(dailyReward(1)).toBe(DAILY_BASE_BONUS);
    expect(dailyReward(2)).toBe(DAILY_BASE_BONUS + 10);
    expect(dailyReward(3)).toBe(DAILY_BASE_BONUS + 20);
    expect(dailyReward(20)).toBe(dailyReward(5));
    expect(dailyReward(0)).toBe(DAILY_BASE_BONUS);
  });
});
