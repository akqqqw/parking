/**
 * Проверки генератора уровней.
 *
 * Главное свойство, на котором держится вся сложность: расстановка из обхода
 * должна иметь такой же пар, как у честного решателя (`solveDetailed`).
 * Раньше здесь была ошибка — обход стартовал из одной «решённой» позиции и
 * мерил расстояние до неё, а победа в игре засчитывается в любой позиции, где
 * целевая машина упёрлась в правый край, поэтому пары получались заниженными.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { solveDetailed } from '@/game/core/solver';
import { mulberry32 } from '@/game/rng';
import type { ExploreRun, Profile } from '../tools/generate-levels.gen';

type GeneratorModule = typeof import('../tools/generate-levels.gen');

let gen: GeneratorModule;

beforeAll(async () => {
  // Основной тест генератора (запись файла уровней) здесь не нужен.
  process.env.GEN_SKIP = '1';
  gen = await import('../tools/generate-levels.gen');
});

function hardProfile(): Profile {
  const profile = gen.PROFILES.find((item) => item.tier === 'hard');
  if (!profile) throw new Error('Профиль hard не найден');
  return profile;
}

describe('генератор уровней: расстояния и решения', () => {
  let runs: ExploreRun[] = [];

  beforeAll(() => {
    const profile = hardProfile();
    for (let seed = 0; seed < 3; seed += 1) {
      const random = mulberry32(0x51ed ^ (seed * 7919));
      const run = gen.makeRun(profile, random, 12, seed + 1);
      if (run) runs.push(run);
    }
  }, 120_000);

  it('расстановки из обхода решаются ровно за посчитанный пар', () => {
    expect(runs.length).toBe(3);
    const random = mulberry32(0x1234);
    let checked = 0;
    for (const run of runs) {
      for (let step = 0; step < 8; step += 1) {
        const index = Math.floor(random() * run.nodes.length);
        const node = run.nodes[index];
        const cars = gen.toCars(run, node.positions);
        const analysis = solveDetailed(cars, run.cols, run.rows, run.exitRow, { maxStates: 400_000 });
        if (!analysis.solution) continue;
        expect(run.goalDist[index], `узел ${index} прогона ${run.id}`).toBe(analysis.solution.steps);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(10);
  }, 300_000);

  it('путь из обхода допустим по правилам и приводит к победе', () => {
    let checked = 0;
    for (const run of runs) {
      const candidates: number[] = [];
      for (let index = 0; index < run.nodes.length; index += 1) {
        if (run.goalDist[index] >= 4 && run.goalDist[index] <= 18) candidates.push(index);
      }
      const sample = candidates.slice(0, 6);
      for (const index of sample) {
        const cars = gen.toCars(run, run.nodes[index].positions);
        const solution = gen.pathToGoal(run, index);
        expect(solution.length, `узел ${index}`).toBe(run.goalDist[index]);
        expect(gen.verifySolution(cars, solution, run.cols, run.rows, run.exitRow)).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  }, 300_000);

  it('карта уровня соответствует машинам обхода', () => {
    const run = runs[0];
    expect(run).toBeDefined();
    let index = -1;
    for (let i = 0; i < run.nodes.length; i += 1) {
      if (run.goalDist[i] >= 6) {
        index = i;
        break;
      }
    }
    if (index < 0) return;
    const cars = gen.toCars(run, run.nodes[index].positions);
    const level = { cars, cols: run.cols, rows: run.rows, exitRow: run.exitRow, par: run.goalDist[index], exact: true };
    const map = gen.toMap(level);
    expect(map).toHaveLength(run.rows);
    expect(map.every((row) => row.length === run.cols)).toBe(true);
    // Целевая машина помечена звёздочками на строке выезда.
    expect(map[run.exitRow]).toContain('*');
  });
});
