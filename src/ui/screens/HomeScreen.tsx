import { useRef } from 'react';
import { Button } from '../components/Button';
import { CoinBadge } from '../components/Badges';
import { CarIllustration } from '../components/CarIllustration';
import { CartIcon, FlameIcon, PlayIcon, SettingsIcon, StarIcon } from '../components/Icons';
import { nextLevelToPlay, useProgressStore } from '@/state/progressStore';
import { useUiStore } from '@/state/uiStore';
import { getLevel, getLevelCount } from '@/game/levels/catalog';
import { dailyLevelId, dailyReward, dateKey, isYesterday } from '@/game/daily';

export function HomeScreen(): JSX.Element {
  const go = useUiStore((state) => state.go);
  const showToast = useUiStore((state) => state.showToast);
  // Скрытый вход в админ-панель: пять быстрых нажатий на подзаголовок.
  const secret = useRef({ count: 0, last: 0 });

  function handleSecretTap(): void {
    const now = Date.now();
    if (now - secret.current.last > 1200) secret.current.count = 0;
    secret.current.last = now;
    secret.current.count += 1;
    if (secret.current.count >= 5) {
      secret.current.count = 0;
      showToast('Режим редактора');
      go('admin');
    }
  }

  const openLevel = useUiStore((state) => state.openLevel);
  const coins = useProgressStore((state) => state.coins);
  const levels = useProgressStore((state) => state.levels);
  const totalStars = useProgressStore((state) => state.totalStars());

  const levelCount = getLevelCount();
  const maxStars = levelCount * 3;

  // Задача дня: уровень выбирается от локальной даты, бонус платится один раз.
  const today = dateKey();
  const dailyId = dailyLevelId(today, levelCount);
  const dailyLevel = getLevel(dailyId);
  const daily = useProgressStore((state) => state.daily);
  const dailyStreak = useProgressStore((state) => state.dailyStreak);
  const dailyDone = daily?.date === today && daily.levelId === dailyId;
  const nextStreak = daily && isYesterday(daily.date, today) ? dailyStreak + 1 : 1;

  return (
    <div className="screen screen--home">
      <header className="home__top">
        <CoinBadge value={coins} />
        <div className="home__stars">
          <StarIcon size={20} />
          <span>
            {totalStars} / {maxStars}
          </span>
        </div>
      </header>

      <div className="home__hero">
        <div className="home__title">
          <span className="home__title-line">Парковочный</span>
          <span className="home__title-line home__title-line--accent">переполох</span>
        </div>
        <p
          className="home__subtitle"
          onPointerDown={handleSecretTap}
          title="Освободите выезд и выведите красную машину с парковки"
        >
          Освободите выезд и выведите красную машину с парковки
        </p>
        <div className="home__illustration">
          <CarIllustration width={220} height={110} />
        </div>
      </div>

      <div className="home__daily">
        <div className="home__daily-icon" aria-hidden="true">
          <FlameIcon size={26} />
        </div>
        <div className="home__daily-text">
          <span className="home__daily-label">Задача дня</span>
          <span className="home__daily-name">
            Уровень {dailyId}
            {dailyLevel ? ` · ${dailyLevel.name}` : ''}
          </span>
          <span className="home__daily-meta">
            {dailyDone ? (
              <>
                Пройдено сегодня · {daily.stars}
                <StarIcon size={12} filled /> · серия {dailyStreak}
              </>
            ) : (
              <>
                +{dailyReward(nextStreak)} монет · серия {nextStreak}
              </>
            )}
          </span>
        </div>
        <Button
          variant={dailyDone ? 'ghost' : 'primary'}
          size="sm"
          aria-label={`Задача дня: открыть уровень ${dailyId}`}
          onClick={() => openLevel(dailyId)}
        >
          {dailyDone ? 'Ещё раз' : 'Открыть'}
        </Button>
      </div>

      <div className="home__actions">
        <Button
          variant="primary"
          size="lg"
          full
          icon={<PlayIcon size={26} />}
          onClick={() => {
            const level = nextLevelToPlay();
            if (level) openLevel(level.id);
          }}
        >
          Играть
        </Button>
        <div className="home__actions-row">
          <Button variant="secondary" onClick={() => go('levels')} full>
            Уровни
          </Button>
          <Button
            variant="secondary"
            onClick={() => go('shop')}
            full
            icon={<CartIcon size={20} />}
          >
            Магазин
          </Button>
        </div>
        <Button variant="ghost" onClick={() => go('settings')} full icon={<SettingsIcon size={20} />}>
          Настройки
        </Button>
      </div>

      <div className="home__progress">
        Пройдено уровней: {Object.values(levels).filter((item) => item.stars > 0).length} из {levelCount}
      </div>
    </div>
  );
}
