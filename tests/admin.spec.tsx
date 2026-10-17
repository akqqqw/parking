// @vitest-environment jsdom
/**
 * Скрытая админ-панель: вход, ручная правка и сохранение уровня.
 *
 * Phaser не нужен — редактор работает на обычном DOM, а проверка расстановки
 * идёт через ядро игры.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../src/ui/GameCanvas', () => ({
  default: () => <div data-testid="game-canvas" />,
}));

import { App } from '../src/App';
import { useUiStore } from '../src/state/uiStore';
import { useProgressStore } from '../src/state/progressStore';
import { useGameStore } from '../src/state/gameStore';
import { getLevel, resetLevelCache, getLevelCount } from '../src/game/levels/catalog';
import {
  clearCustomLevels,
  getCustomLevel,
  hasCustomLevel,
  reloadCustomLevels,
  removeCustomLevel,
  saveCustomLevel,
} from '../src/game/levels/custom';
import { fromLevel, toMap } from '../src/game/levels/editor';

let rectSpy: ReturnType<typeof vi.spyOn> | null = null;

function mockBoardRect(): void {
  rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: 600,
    height: 600,
    top: 0,
    left: 0,
    right: 600,
    bottom: 600,
    toJSON: () => ({}),
  } as DOMRect);
}

function reset(): void {
  useUiStore.setState({ screen: 'menu', dialog: 'none', winResult: null, toast: null });
  useProgressStore.getState().hydrate();
}

beforeEach(() => {
  localStorage.clear();
  clearCustomLevels();
  resetLevelCache();
  reset();
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  cleanup();
  rectSpy?.mockRestore();
  rectSpy = null;
  window.history.pushState({}, '', '/');
});

describe('скрытая админ-панель', () => {
  it('открывается пятью нажатиями на подзаголовок меню', () => {
    render(<App />);
    const subtitle = screen.getByText(/Освободите выезд/);
    for (let index = 0; index < 5; index += 1) {
      fireEvent.pointerDown(subtitle);
    }
    expect(useUiStore.getState().screen).toBe('admin');
    expect(screen.getByText('Редактор уровней')).toBeTruthy();
    expect(screen.getByLabelText('Уровень')).toBeTruthy();
  });

  it('открывается по адресу ?admin и по Ctrl+Shift+A', () => {
    window.history.pushState({}, '', '/?admin');
    render(<App />);
    expect(useUiStore.getState().screen).toBe('admin');

    act(() => useUiStore.setState({ screen: 'menu' }));
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true, shiftKey: true });
    expect(useUiStore.getState().screen).toBe('admin');
  });

  it('в списке редактора все 100 уровней, на поле есть цель', () => {
    act(() => useUiStore.getState().go('admin'));
    render(<App />);
    const select = screen.getByLabelText('Уровень') as HTMLSelectElement;
    expect(select.options.length).toBe(getLevelCount());
    expect(screen.getByLabelText('Целевая машина 2 клетки')).toBeTruthy();
  });

  it('показывает повторы по каталогу', () => {
    act(() => useUiStore.getState().go('admin'));
    render(<App />);
    const find = screen.getByRole('button', { name: /Найти повторы по каталогу/ });
    fireEvent.click(find);
    expect(screen.getByRole('button', { name: 'Скрыть повторы' })).toBeTruthy();
    expect(document.querySelectorAll('.admin__repeat-row').length).toBeGreaterThan(0);
  });

  it('отменяет и возвращает правку', () => {
    mockBoardRect();
    act(() => useUiStore.getState().go('admin'));
    render(<App />);
    const board = screen.getByTestId('editor-board');
    const before = board.querySelectorAll('.editor-car').length;

    fireEvent.pointerDown(board, { clientX: 50, clientY: 550 });
    expect(board.querySelectorAll('.editor-car').length).toBe(before + 1);

    fireEvent.click(screen.getByRole('button', { name: /Отменить/ }));
    expect(board.querySelectorAll('.editor-car').length).toBe(before);

    fireEvent.click(screen.getByRole('button', { name: '↷ Вернуть' }));
    expect(board.querySelectorAll('.editor-car').length).toBe(before + 1);
  });

  it('ставит машину на сетку и сохраняет уровень в браузере', () => {
    mockBoardRect();
    act(() => useUiStore.getState().go('admin'));
    render(<App />);

    const board = screen.getByTestId('editor-board');
    const before = screen.queryAllByLabelText('Машина 2 клетки').length;
    fireEvent.pointerDown(board, { clientX: 50, clientY: 550 });

    // Клетка (0,5) была свободна: появилась ещё одна двухклеточная машина.
    expect(screen.getAllByLabelText('Машина 2 клетки').length).toBe(before + 1);
    expect(screen.getByText(/Машина · 2 кл./)).toBeTruthy();

    const save = screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    expect(hasCustomLevel(1)).toBe(true);
    const custom = getLevel(1)!;
    expect(custom.cars.some((car) => car.x === 0 && car.y === 5 && car.length === 2)).toBe(true);
    expect(localStorage.getItem('parking-jam:custom-levels')).toContain('"id":1');
    expect(getLevelCount()).toBe(100);
  });

  it('запускает игру уже с сохранённой расстановкой', () => {
    mockBoardRect();
    act(() => useUiStore.getState().go('admin'));
    render(<App />);

    const board = screen.getByTestId('editor-board');
    fireEvent.pointerDown(board, { clientX: 50, clientY: 550 });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить и играть' }));

    expect(useUiStore.getState().screen).toBe('game');
    const level = useGameStore.getState().level;
    expect(level?.id).toBe(1);
    expect(level?.cars.some((car) => car.x === 0 && car.y === 5 && car.length === 2)).toBe(true);
  });

  it('правка переживает перечитывание сохранения, а удаление — окончательное', () => {
    const level = getLevel(5)!;
    saveCustomLevel({
      id: 5,
      name: 'Ручной',
      map: toMap(fromLevel(level)),
      par: 4,
      updatedAt: 5,
    });
    reloadCustomLevels();
    expect(getCustomLevel(5)?.name).toBe('Ручной');

    removeCustomLevel(5);
    reloadCustomLevels();
    expect(getCustomLevel(5)).toBeUndefined();
    resetLevelCache();
    expect(getLevel(5)!.name).not.toBe('Ручной');
  });

  it('возвращает исходный уровень кнопкой «Вернуть исходный»', () => {
    mockBoardRect();
    const original = getLevel(4)!;
    act(() => useUiStore.getState().go('admin'));
    render(<App />);

    fireEvent.change(screen.getByLabelText('Уровень'), { target: { value: '4' } });

    // Свободные клетки (0,0) и (1,0) в четвёртом уровне — ставим туда машину.
    const board = screen.getByTestId('editor-board');
    fireEvent.pointerDown(board, { clientX: 50, clientY: 50 });

    const save = screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(hasCustomLevel(4)).toBe(true);
    expect(getLevel(4)!.cars.some((car) => car.x === 0 && car.y === 0 && car.orientation === 'h')).toBe(
      true,
    );

    const resetButton = screen.getByRole('button', { name: 'Вернуть исходный' });
    fireEvent.click(resetButton);
    expect(hasCustomLevel(4)).toBe(false);
    expect(getLevel(4)!.name).toBe(original.name);
    expect(getLevel(4)!.cars.some((car) => car.x === 0 && car.y === 0)).toBe(false);
  });
});
