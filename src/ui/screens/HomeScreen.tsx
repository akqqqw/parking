import { Button } from '../components/Button';
import { CoinBadge } from '../components/Badges';
import { CarIllustration } from '../components/CarIllustration';
import { CartIcon, PlayIcon, SettingsIcon, StarIcon } from '../components/Icons';
import { nextLevelToPlay, useProgressStore } from '@/state/progressStore';
import { useUiStore } from '@/state/uiStore';
import { getLevelCount } from '@/game/levels/catalog';

export function HomeScreen(): JSX.Element {
  const go = useUiStore((state) => state.go);
  const openLevel = useUiStore((state) => state.openLevel);
  const coins = useProgressStore((state) => state.coins);
  const levels = useProgressStore((state) => state.levels);
  const totalStars = useProgressStore((state) => state.totalStars());

  const levelCount = getLevelCount();
  const maxStars = levelCount * 3;

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
        <p className="home__subtitle">Освободите выезд и выведите красную машину с парковки</p>
        <div className="home__illustration">
          <CarIllustration width={220} height={110} />
        </div>
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
