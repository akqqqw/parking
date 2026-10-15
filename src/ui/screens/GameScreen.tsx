import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { BackIcon, BulbIcon, PauseIcon, RestartIcon, UndoIcon } from '../components/Icons';
import { audio } from '@/services/audio';
import { bridge } from '@/game/bridge';
import { getPar } from '@/game/levels/catalog';
import { useGameStore } from '@/state/gameStore';
import { useProgressStore } from '@/state/progressStore';
import { useUiStore } from '@/state/uiStore';
import { submitLeaderboardScore } from '@/services/yandex';
import { WinDialog } from './dialogs/WinDialog';
import { PauseDialog } from './dialogs/PauseDialog';
import { ShopDialog } from './dialogs/ShopDialog';

const GameCanvas = lazy(() => import('../GameCanvas'));

export function GameScreen(): JSX.Element {
  const level = useGameStore((state) => state.level);
  const moves = useGameStore((state) => state.moves);
  const status = useGameStore((state) => state.status);
  const hint = useGameStore((state) => state.hint);
  const hints = useProgressStore((state) => state.hints);
  const undos = useProgressStore((state) => state.undos);
  const dialog = useUiStore((state) => state.dialog);
  const go = useUiStore((state) => state.go);
  const openDialog = useUiStore((state) => state.openDialog);
  const showToast = useUiStore((state) => state.showToast);
  const setWinResult = useUiStore((state) => state.setWinResult);

  // Пока решатель ищет ход, кнопка подсказки показывает «думаю…»:
  // на самых плотных уровнях поиск занимает до ~0.8 с.
  const [thinking, setThinking] = useState(false);
  const paused = dialog === 'pause';
  const par = useMemo(() => (level ? getPar(level) : 0), [level]);
  const best = useProgressStore((state) =>
    level ? state.levels[String(level.id)]?.bestMoves : undefined,
  );

  // Пауза сцены и звука.
  useEffect(() => {
    bridge.emit('game:paused', { paused: paused || status === 'won' });
  }, [paused, status]);

  // Победа: начисляем награду и показываем диалог.
  useEffect(() => {
    const off = bridge.on('level:cleared', ({ moves: moveCount }) => {
      const game = useGameStore.getState();
      const currentLevel = game.level;
      if (!currentLevel || game.rewardGranted) return;
      game.markRewardGranted();
      const result = useProgressStore.getState().completeLevel(currentLevel, moveCount);
      audio.coin();
      // Лидерборд платформы: суммарные звёзды (без SDK — тихий no-op).
      void submitLeaderboardScore(useProgressStore.getState().totalStars());
      setWinResult({
        levelId: currentLevel.id,
        moves: moveCount,
        par: getPar(currentLevel),
        stars: result.stars,
        coins: result.coins,
        isNew: result.isNew,
        bestMoves: result.bestMoves,
      });
    });
    return off;
  }, [setWinResult]);

  if (!level) {
    return (
      <div className="screen screen--game">
        <div className="game__empty">Уровень не выбран</div>
      </div>
    );
  }

  const requestHint = (): void => {
    const game = useGameStore.getState();
    if (!game.level || game.status === 'won') {
      showToast('Уровень уже решён!');
      return;
    }
    const progress = useProgressStore.getState();
    if (progress.hints <= 0) {
      showToast('Подсказки закончились — возьмите ещё в магазине');
      openDialog('hint-shop');
      return;
    }
    setThinking(true);
    // Даём интерфейсу перерисоваться, затем считаем ход.
    setTimeout(() => {
      const payload = useGameStore.getState().showHint();
      setThinking(false);
      if (!payload) {
        showToast('Подсказка не нужна: путь свободен');
        return;
      }
      useProgressStore.getState().useHint();
      audio.pick();
    }, 40);
  };

  const requestUndo = (): void => {
    const game = useGameStore.getState();
    if (!game.canUndo()) return;
    const progress = useProgressStore.getState();
    if (progress.undos <= 0) {
      showToast('Отмены закончились — загляните в магазин');
      openDialog('hint-shop');
      return;
    }
    progress.useUndo();
    game.undo();
    // Сброс подсказки, если она была связана с отменённым ходом.
    useGameStore.getState().clearHint();
    audio.snap();
  };

  return (
    <div className="screen screen--game">
      <Suspense fallback={<div className="game__loading">Загрузка парковки…</div>}>
        <GameCanvas />
      </Suspense>

      <div className="hud hud--top">
        <Button variant="icon" onClick={() => go('menu')} aria-label="В меню">
          <BackIcon />
        </Button>
        <div className="hud__level">
          <span className="hud__level-id">Уровень {level.id}</span>
          <span className="hud__level-name">{level.name}</span>
        </div>
        <Button variant="icon" onClick={() => openDialog('pause')} aria-label="Пауза">
          <PauseIcon />
        </Button>
      </div>

      <div className="hud hud--stats">
        <span className="stat">
          Ходы: <b>{moves.length}</b>
        </span>
        <span className="stat stat--muted">Пар: {par}</span>
        {best !== undefined ? <span className="stat stat--muted">Рекорд: {best}</span> : null}
      </div>

      <div className="hud hud--bottom">
        <Button
          variant="secondary"
          onClick={requestHint}
          disabled={status === 'won' || thinking}
          className={thinking ? 'btn--thinking' : undefined}
        >
          <BulbIcon size={20} />
          <span className="hud__btn-label">{thinking ? 'Ищу ход…' : 'Подсказка'}</span>
          <span className="hud__counter">{hints}</span>
        </Button>
        <Button
          variant="secondary"
          onClick={requestUndo}
          disabled={moves.length === 0 || status === 'won'}
          className={hint ? 'btn--pulse' : undefined}
        >
          <UndoIcon size={20} />
          <span className="hud__btn-label">Отмена</span>
          <span className="hud__counter">{undos}</span>
        </Button>
        <Button variant="secondary" onClick={() => useGameStore.getState().restart()}>
          <RestartIcon size={20} />
          <span className="hud__btn-label">Заново</span>
        </Button>
      </div>

      {dialog === 'win' ? <WinDialog /> : null}
      {dialog === 'pause' ? <PauseDialog /> : null}
      {dialog === 'hint-shop' ? <ShopDialog /> : null}
    </div>
  );
}
