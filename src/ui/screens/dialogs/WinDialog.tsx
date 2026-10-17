import { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { FlameIcon, StarIcon } from '../../components/Icons';
import { CoinsIcon } from '../../components/Icons';
import { audio } from '@/services/audio';
import { getLevel, getLevelCount } from '@/game/levels/catalog';
import { useGameStore } from '@/state/gameStore';
import { useUiStore } from '@/state/uiStore';

export function WinDialog(): JSX.Element {
  const result = useUiStore((state) => state.winResult);
  const startNextLevel = useUiStore((state) => state.startNextLevel);
  const replayLevel = useUiStore((state) => state.replayLevel);
  const go = useUiStore((state) => state.go);
  const level = useGameStore((state) => state.level);
  const [shownStars, setShownStars] = useState(0);

  const stars = result?.stars ?? 0;

  // Звёзды появляются по одной — с соответствующей нотой.
  useEffect(() => {
    setShownStars(0);
    if (stars <= 0) return undefined;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let index = 0; index < stars; index += 1) {
      timers.push(
        setTimeout(() => {
          setShownStars(index + 1);
          audio.star(index);
        }, 260 + index * 320),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [stars, result?.levelId]);

  if (!result || !level) return <></>;

  const isLastLevel = level.id >= getLevelCount();
  const nextLevel = getLevel(level.id + 1);
  const better = result.moves <= result.par;

  return (
    <Modal className="modal--win" title={isLastLevel ? 'Все уровни пройдены!' : 'Уровень пройден!'}>
      <div className="win__stars">
        {Array.from({ length: 3 }, (_, index) => (
          <span
            key={index}
            className={[
              'win__star',
              index < shownStars ? 'win__star--on' : '',
              index === 1 ? 'win__star--mid' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <StarIcon size={index === 1 ? 62 : 52} filled={index < shownStars} />
          </span>
        ))}
      </div>

      <div className="win__rows">
        <div className="win__row">
          <span>Ходов сделано</span>
          <b>
            {result.moves}
            <span className="win__par"> (пар {result.par})</span>
          </b>
        </div>
        <div className="win__row">
          <span>
            Лучший результат
            {result.isRecord ? <span className="win__record">рекорд</span> : null}
          </span>
          <b>{result.bestMoves}</b>
        </div>
        <div className="win__row win__row--coins">
          <span>Награда</span>
          <b>
            <CoinsIcon size={18} /> +{result.coins}
          </b>
        </div>
        {result.dailyBonus > 0 ? (
          <div className="win__row win__row--daily">
            <span>
              <FlameIcon size={16} /> Задача дня
            </span>
            <b>
              +{result.dailyBonus}
              <span className="win__par"> · серия {result.dailyStreak}</span>
            </b>
          </div>
        ) : null}
      </div>

      {better && shownStars === stars ? (
        <p className="win__note">Идеальное прохождение — минимум ходов!</p>
      ) : null}

      <div className="win__actions">
        {!isLastLevel && nextLevel ? (
          <Button variant="primary" size="lg" full onClick={startNextLevel}>
            Следующий уровень
          </Button>
        ) : (
          <Button variant="primary" size="lg" full onClick={() => go('levels')}>
            К списку уровней
          </Button>
        )}
        <div className="win__actions-row">
          <Button variant="secondary" full onClick={replayLevel}>
            Повторить
          </Button>
          <Button variant="ghost" full onClick={() => go('menu')}>
            В меню
          </Button>
        </div>
      </div>
    </Modal>
  );
}
