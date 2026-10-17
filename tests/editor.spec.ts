import { beforeEach, describe, expect, it } from 'vitest';
import {
  addCar,
  emptyEditor,
  findSimilarLevels,
  findSimilarPairs,
  fromLevel,
  fromMap,
  makeTarget,
  moveCarTo,
  removeCar,
  slideRangeFor,
  targetCarOf,
  toMap,
  validateEditor,
  withSize,
  type EditorState,
} from '@/game/levels/editor';
import { getAllLevels, getLevel, getLevelCount, resetLevelCache } from '@/game/levels/catalog';
import {
  clearCustomLevels,
  exportCustomLevels,
  importCustomLevels,
  listCustomLevels,
  removeCustomLevel,
  saveCustomLevel,
} from '@/game/levels/custom';

function geometry(state: EditorState): string {
  return state.cars
    .map((car) => `${car.orientation}:${car.length}:${car.x}:${car.y}:${car.target ? 'T' : ''}`)
    .sort()
    .join('|');
}

beforeEach(() => {
  clearCustomLevels();
  resetLevelCache();
});

describe('редактор уровней', () => {
  it('разбирает карту и собирает её обратно без потери геометрии', () => {
    for (const id of [1, 6, 42, 100]) {
      const level = getLevel(id);
      expect(level, `уровень ${id}`).toBeTruthy();
      const state = fromLevel(level!);
      const map = toMap(state);
      expect(map).toHaveLength(level!.rows);
      const restored = fromMap(map);
      expect(restored, `уровень ${id}`).not.toBeNull();
      expect(geometry(restored!)).toBe(geometry(state));
      expect(restored!.cols).toBe(level!.cols);
      expect(restored!.rows).toBe(level!.rows);
      expect(targetCarOf(restored!)?.y).toBe(level!.exitRow);
    }
  });

  it('не даёт поставить машину на занятые клетки или за границу', () => {
    let state = emptyEditor(6, 6);
    state = addCar(state, { x: 0, y: 5, length: 2, orientation: 'h' })!;
    expect(state.cars).toHaveLength(1);
    expect(addCar(state, { x: 1, y: 5, length: 2, orientation: 'h' })).toBeNull();
    expect(addCar(state, { x: 5, y: 0, length: 2, orientation: 'h' })).toBeNull();
    expect(addCar(state, { x: 0, y: 0, length: 3, orientation: 'v' })).not.toBeNull();
  });

  it('двигает машину только вдоль оси и упирается в соседей', () => {
    let state = emptyEditor(6, 6);
    state = addCar(state, { x: 2, y: 2, length: 2, orientation: 'h' })!;
    const id = state.cars[0].id;
    expect(slideRangeFor(state, id)).toEqual({ min: 0, max: 4 });
    expect(moveCarTo(state, id, 99).cars[0].x).toBe(4);
    expect(moveCarTo(state, id, -5).cars[0].x).toBe(0);

    state = addCar(state, { x: 0, y: 2, length: 2, orientation: 'h' })!;
    const moving = state.cars.find((car) => car.id === id)!;
    const range = slideRangeFor(state, id);
    expect(range.min).toBe(moving.x);
    expect(moveCarTo(state, id, 0).cars.find((car) => car.id === id)!.x).toBe(moving.x);
  });

  it('делает машину целью, оставляя ровно одну красную', () => {
    let state = emptyEditor(6, 6);
    state = addCar(state, { x: 1, y: 2, length: 2, orientation: 'h', target: true })!;
    state = addCar(state, { x: 0, y: 0, length: 2, orientation: 'h' })!;
    const next = state.cars.find((car) => !car.target && car.x === 0)!;
    state = makeTarget(state, next.id);
    expect(state.cars.filter((car) => car.target)).toHaveLength(1);
    expect(targetCarOf(state)!.x).toBe(0);
    expect(new Set(state.cars.map((car) => car.id)).size).toBe(state.cars.length);
  });

  it('удаляет машину и обрезает поле, выбрасывая не поместившиеся', () => {
    let state = emptyEditor(6, 6);
    state = addCar(state, { x: 4, y: 5, length: 2, orientation: 'h' })!;
    state = addCar(state, { x: 0, y: 0, length: 2, orientation: 'h' })!;
    const removed = removeCar(state, state.cars[0].id);
    expect(removed.cars).toHaveLength(1);
    const shrunk = withSize(removed, 5, 5);
    expect(shrunk.cols).toBe(5);
    expect(shrunk.cars.every((car) => car.x + car.length <= 5 && car.y + 1 <= 5)).toBe(true);
  });

  it('принимает решаемый уровень и считает точный пар', () => {
    let state = emptyEditor(6, 6);
    state = addCar(state, { x: 1, y: 2, length: 2, orientation: 'h', target: true })!;
    state = addCar(state, { x: 3, y: 0, length: 3, orientation: 'v' })!;
    state = addCar(state, { x: 0, y: 5, length: 2, orientation: 'h' })!;
    const check = validateEditor(state);
    expect(check.errors, check.errors.join('; ')).toEqual([]);
    expect(check.solvable).toBe(true);
    expect(check.par).toBe(2);
  });

  it('находит запирание выезда и цепочку без решения', () => {
    let state = emptyEditor(6, 6);
    state = addCar(state, { x: 0, y: 2, length: 2, orientation: 'h', target: true })!;
    state = addCar(state, { x: 3, y: 2, length: 2, orientation: 'h' })!;
    state = addCar(state, { x: 0, y: 5, length: 2, orientation: 'h' })!;
    const locked = validateEditor(state);
    expect(locked.errors.join(' ')).toContain('запирает выезд');

    let solvedByDefault = emptyEditor(6, 6);
    solvedByDefault = addCar(solvedByDefault, {
      x: 4,
      y: 1,
      length: 2,
      orientation: 'h',
      target: true,
    })!;
    solvedByDefault = addCar(solvedByDefault, { x: 0, y: 5, length: 2, orientation: 'h' })!;
    solvedByDefault = addCar(solvedByDefault, { x: 0, y: 0, length: 2, orientation: 'v' })!;
    const done = validateEditor(solvedByDefault);
    expect(done.errors.join(' ')).toContain('уже у выезда');
  });

  it('находит похожие расстановки, но не считает похожими разные поля', () => {
    const level = getLevel(30)!;
    const state = fromLevel(level);
    const similar = findSimilarLevels(state, getAllLevels().filter((item) => item.id !== 30), 5);
    expect(similar.length).toBeGreaterThan(0);
    expect(similar.every((item) => item.score > 0 && item.score <= 1)).toBe(true);

    const same = findSimilarLevels(state, [{ ...level, id: 999 }], 1)[0];
    expect(same.score).toBe(1);

    const otherSize = findSimilarLevels(emptyEditor(8, 8), [level], 1);
    expect(otherSize).toEqual([]);
  });

  it('находит повторы по всему каталогу', () => {
    const pairs = findSimilarPairs(getAllLevels(), 0.8, 100);
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.every((pair) => pair.score >= 0.8 && pair.score <= 1)).toBe(true);
    expect(pairs.every((pair) => pair.a !== pair.b)).toBe(true);
    expect(pairs.some((pair) => (pair.a === 82 && pair.b === 83) || (pair.a === 83 && pair.b === 82))).toBe(
      true,
    );
  });
});

describe('ручные уровни в каталоге', () => {
  it('подменяет карту, имя и пар, не меняя количество уровней', () => {
    const base = getLevel(1)!;
    let state = fromLevel(base);
    state = addCar(state, { x: 0, y: 5, length: 2, orientation: 'h' })!;
    const map = toMap(state);
    const check = validateEditor(state);
    expect(check.errors, check.errors.join('; ')).toEqual([]);

    saveCustomLevel({
      id: 1,
      name: 'Мой уровень',
      map,
      par: check.par ?? undefined,
      updatedAt: 1,
    });
    resetLevelCache();

    const custom = getLevel(1)!;
    expect(custom.name).toBe('Мой уровень');
    expect(custom.cars.some((car) => car.x === 0 && car.y === 5 && car.length === 2)).toBe(true);
    expect(getLevelCount()).toBe(100);
    expect(listCustomLevels()).toHaveLength(1);
  });

  it('возвращает исходный уровень после удаления правки', () => {
    const base = getLevel(2)!;
    const map = toMap(fromLevel(base));
    saveCustomLevel({ id: 2, name: 'Копия', map, par: 3, updatedAt: 2 });
    resetLevelCache();
    expect(getLevel(2)!.name).toBe('Копия');

    removeCustomLevel(2);
    resetLevelCache();
    expect(getLevel(2)!.name).toBe(base.name);
    expect(getLevel(2)!.par).toBe(base.par);
  });

  it('экспортирует и импортирует правки', () => {
    const map = toMap(fromLevel(getLevel(3)!));
    saveCustomLevel({ id: 3, name: 'Экспорт', map, par: 4, updatedAt: 3 });
    const json = exportCustomLevels();
    expect(JSON.parse(json)).toMatchObject({ version: 1 });

    clearCustomLevels();
    expect(listCustomLevels()).toEqual([]);

    const result = importCustomLevels(json);
    expect(result.error).toBeUndefined();
    expect(result.added).toBe(1);
    expect(listCustomLevels()[0]).toMatchObject({ id: 3, name: 'Экспорт' });

    const broken = importCustomLevels('не json');
    expect(broken.error).toBeTruthy();
  });
});
