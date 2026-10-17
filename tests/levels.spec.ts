import { describe, expect, it } from 'vitest';
import { auditLevels, getAllLevels, getPar } from '@/game/levels/catalog';
import { solve } from '@/game/core/solver';
import { findSimilarPairs } from '@/game/levels/editor';

describe('каталог уровней', () => {
  const audit = auditLevels();
  const all = getAllLevels();

  it('все уровни разбираются без ошибок', () => {
    const broken = audit.filter((item) => item.errors.length > 0);
    expect(broken, JSON.stringify(broken, null, 2)).toEqual([]);
  });

  it('в каталоге 100 уровней с уникальными номерами', () => {
    const ids = all.map((level) => level.id);
    expect(ids).toHaveLength(100);
    expect(new Set(ids).size).toBe(100);
    expect(ids).toEqual(Array.from({ length: 100 }, (_, index) => index + 1));
  });

  it('у каждого уровня есть решение и пар', () => {
    for (const item of audit) {
      expect(item.par, `уровень ${item.id}`).not.toBeNull();
      expect(item.par!, `уровень ${item.id}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('минимальное решение действительно решает уровень', () => {
    for (const level of getAllLevels()) {
      const solution = solve(level.cars, level.cols, level.rows, level.exitRow);
      expect(solution, `уровень ${level.id}`).not.toBeNull();
      expect(solution!.steps).toBe(getPar(level));
    }
  });

  it('сложность не проваливается от уровня к уровню', () => {
    const pars = all.map((level) => getPar(level));
    for (let index = 1; index < pars.length; index += 1) {
      // Небольшой «отскок» допустим, заметный провал — нет: игрок не должен
      // после тяжёлого уровня получать заметно более лёгкий.
      expect(
        pars[index],
        `уровень ${index + 1} легче предыдущего (${pars[index - 1]} → ${pars[index]})`,
      ).toBeGreaterThanOrEqual(pars[index - 1] - 2);
    }
  });

  it('в каталоге нет почти одинаковых уровней', () => {
    // Порог 85 %: такие пары игрок воспринимает как один и тот же уровень.
    const pairs = findSimilarPairs(all, 0.85, 100);
    expect(pairs, JSON.stringify(pairs)).toEqual([]);
  });

  it('сложность растёт (пар последних уровней выше первых)', () => {
    // Проверка имеет смысл на полном наборе из 100 уровней (этап 2).
    if (all.length < 10) return;
    const pars = audit.map((item) => item.par ?? 0);
    const head = pars.slice(0, Math.max(1, Math.floor(pars.length / 3)));
    const tail = pars.slice(-Math.max(1, Math.floor(pars.length / 3)));
    const avg = (list: number[]): number => list.reduce((sum, value) => sum + value, 0) / list.length;
    expect(avg(tail)).toBeGreaterThan(avg(head));
  });
});
