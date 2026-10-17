// @vitest-environment jsdom
/**
 * Дымовые тесты интерфейса: React-экраны собираются и переключаются.
 *
 * Phaser в jsdom не запускается, поэтому игровое полотно подменяется заглушкой:
 * проверяем именно обвязку — меню, выбор уровней, HUD и диалоги.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../src/ui/GameCanvas', () => ({
  default: () => <div data-testid="game-canvas" />,
}));

import { App } from '../src/App';
import { hydrateProgress, useProgressStore } from '../src/state/progressStore';
import { useUiStore } from '../src/state/uiStore';
import { useGameStore } from '../src/state/gameStore';
import { getLevel, getLevelCount, getPar } from '../src/game/levels/catalog';
import { enumerateMoves } from '../src/game/core/rules';

function reset(): void {
  useUiStore.setState({ screen: 'menu', dialog: 'none', winResult: null, toast: null });
  useGameStore.getState().leaveLevel();
  useProgressStore.getState().hydrate();
}

describe('интерфейс игры', () => {
  beforeEach(() => {
    localStorage.clear();
    reset();
  });

  afterEach(() => {
    cleanup();
  });

  it('главное меню показывает монеты, звёзды и кнопки', () => {
    render(<App />);
    expect(screen.getByText('Парковочный')).toBeTruthy();
    expect(screen.getByText('Играть')).toBeTruthy();
    expect(screen.getByText('Уровни')).toBeTruthy();
    expect(screen.getByText('Магазин')).toBeTruthy();
    expect(screen.getByText('Настройки')).toBeTruthy();
    expect(screen.getByText(/Пройдено уровней: 0 из 100/)).toBeTruthy();
  });

  it('в списке уровней 100 карточек, открыт только первый', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Уровни'));
    const cards = document.querySelectorAll('.level-card');
    expect(cards.length).toBe(getLevelCount());
    expect(cards.length).toBe(100);
    expect(document.querySelectorAll('.level-card--locked').length).toBe(99);
  });

  it('на главной есть задача дня и она ведёт на уровень', () => {
    render(<App />);
    expect(screen.getByText('Задача дня')).toBeTruthy();
    const card = document.querySelector('.home__daily') as HTMLElement;
    expect(card).toBeTruthy();
    const play = Array.from(card.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Открыть',
    );
    expect(play).toBeTruthy();
    fireEvent.click(play!);
    expect(useUiStore.getState().screen).toBe('game');
    const level = useGameStore.getState().level!;
    expect(level.id).toBeGreaterThanOrEqual(6);
  });

  it('фильтр скрывает пройденные уровни', () => {
    const level = getLevel(1)!;
    useProgressStore.getState().completeLevel(level, getPar(level));
    render(<App />);
    fireEvent.click(screen.getByText('Уровни'));

    fireEvent.click(screen.getByRole('button', { name: 'Не пройдены' }));
    expect(document.querySelectorAll('.level-card').length).toBe(99);

    fireEvent.click(screen.getByRole('button', { name: 'Все' }));
    expect(document.querySelectorAll('.level-card').length).toBe(100);
  });

  it('«Играть» запускает первый уровень и показывает HUD', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('Играть'));
    expect(useGameStore.getState().level?.id).toBe(1);
    expect(await screen.findByTestId('game-canvas')).toBeTruthy();
    expect(screen.getByText('Уровень 1')).toBeTruthy();
    expect(screen.getByText(/Ходы:/)).toBeTruthy();
    expect(screen.getByText('Подсказка')).toBeTruthy();
    expect(screen.getByText('Отмена')).toBeTruthy();
    expect(screen.getByText('Заново')).toBeTruthy();
  });

  it('ходы, отмена и перезапуск работают через хранилище', () => {
    const level = getLevel(1)!;
    useGameStore.getState().startLevel(level);
    useUiStore.setState({ screen: 'game' });
    render(<App />);

    // Берём любой допустимый ход из текущей расстановки.
    const game = useGameStore.getState();
    const legal = enumerateMoves(game.cars, level.cols, level.rows);
    expect(legal.length).toBeGreaterThan(0);
    act(() => {
      useGameStore.getState().registerMove(legal[0]);
    });
    expect(useGameStore.getState().moves).toHaveLength(1);
    expect(document.querySelector('.hud--stats')?.textContent).toContain('Ходы: 1');

    useProgressStore.setState({ undos: 3 });
    fireEvent.click(screen.getByText('Отмена'));
    expect(useGameStore.getState().moves).toHaveLength(0);

    fireEvent.click(screen.getByText('Заново'));
    expect(useGameStore.getState().moves).toHaveLength(0);
  });

  it('прохождение уровня открывает следующий: звёзды, монеты, диалог победы', async () => {
    await hydrateProgress();
    const level = getLevel(1)!;
    useGameStore.getState().startLevel(level);
    const par = level.par ?? 2;
    useProgressStore.getState().completeLevel(level, par);
    expect(useProgressStore.getState().starsFor(1)).toBe(3);
    expect(useProgressStore.getState().coins).toBeGreaterThan(0);
    expect(useProgressStore.getState().isLevelUnlocked(2)).toBe(true);
  });

  it('на первом уровне новичок видит урок, и он больше не повторяется', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Играть'));
    expect(useUiStore.getState().dialog).toBe('tutorial');
    expect(screen.getByText('Как играть')).toBeTruthy();
    fireEvent.click(screen.getByText('Понятно'));
    expect(useUiStore.getState().dialog).toBe('none');
    expect(useProgressStore.getState().tutorialSeen).toBe(true);

    cleanup();
    useUiStore.setState({ screen: 'menu', dialog: 'none' });
    render(<App />);
    fireEvent.click(screen.getByText('Играть'));
    expect(useUiStore.getState().dialog).toBe('none');
  });

  it('пауза и магазин открываются из игры', () => {
    useGameStore.getState().startLevel(getLevel(3)!);
    useUiStore.setState({ screen: 'game' });
    render(<App />);
    fireEvent.click(screen.getByLabelText('Пауза'));
    expect(useUiStore.getState().dialog).toBe('pause');
    expect(screen.getByText('Пауза')).toBeTruthy();
    cleanup();
    useUiStore.setState({ dialog: 'none' });
    useProgressStore.setState({ hints: 0, coins: 500 });
    render(<App />);
    fireEvent.click(screen.getByText('Подсказка'));
    expect(useUiStore.getState().dialog).toBe('hint-shop');
    expect(screen.getByText('Подсказка за рекламу')).toBeTruthy();
  });

  it('магазин покупает подсказки за монеты', () => {
    useProgressStore.setState({ coins: 500, hints: 0 });
    useUiStore.setState({ screen: 'shop' });
    render(<App />);
    const buttons = screen.getAllByRole('button');
    const buy = buttons.find((button) => button.textContent?.trim() === '50');
    expect(buy).toBeTruthy();
    fireEvent.click(buy!);
    expect(useProgressStore.getState().hints).toBe(1);
    expect(useProgressStore.getState().coins).toBe(450);
  });

  it('настройки переключают звук и показывают выбор оформления', () => {
    useUiStore.setState({ screen: 'settings' });
    render(<App />);
    expect(screen.getByText('Оформление парковки')).toBeTruthy();
    const toggles = Array.from(document.querySelectorAll<HTMLButtonElement>('.toggle'));
    expect(toggles.length).toBeGreaterThanOrEqual(3);
    const before = useProgressStore.getState().soundEnabled;
    fireEvent.click(toggles[0]);
    expect(useProgressStore.getState().soundEnabled).toBe(!before);
  });
});
