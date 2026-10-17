import { useState } from 'react';
import { Button } from '../components/Button';
import { CoinBadge } from '../components/Badges';
import { BackIcon, LockIcon, StarIcon } from '../components/Icons';
import { getAllLevels, TIERS, type LevelTier } from '@/game/levels/catalog';
import { useProgressStore } from '@/state/progressStore';
import { useUiStore } from '@/state/uiStore';

const TIER_ORDER: LevelTier[] = ['tutorial', 'easy', 'medium', 'hard', 'expert', 'master'];

type LevelFilter = 'all' | 'todo' | 'stars';

const FILTERS: Array<{ id: LevelFilter; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'todo', label: 'Не пройдены' },
  { id: 'stars', label: 'Без 3★' },
];

export function LevelSelectScreen(): JSX.Element {
  const openLevel = useUiStore((state) => state.openLevel);
  const go = useUiStore((state) => state.go);
  const levels = useProgressStore((state) => state.levels);
  const isUnlocked = useProgressStore((state) => state.isLevelUnlocked);
  const coins = useProgressStore((state) => state.coins);
  const allLevels = getAllLevels();
  const [filter, setFilter] = useState<LevelFilter>('all');

  const visibleLevels = allLevels.filter((level) => {
    const stars = levels[String(level.id)]?.stars ?? 0;
    if (filter === 'todo') return stars === 0;
    if (filter === 'stars') return stars < 3;
    return true;
  });

  return (
    <div className="screen screen--levels">
      <header className="screen__header">
        <Button variant="icon" onClick={() => go('menu')} aria-label="Назад">
          <BackIcon />
        </Button>
        <h1 className="screen__title">Уровни</h1>
        <CoinBadge value={coins} size={18} />
      </header>

      <div className="tabs" role="group" aria-label="Фильтр уровней">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={['tab', filter === item.id ? 'tab--active' : ''].filter(Boolean).join(' ')}
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="levels__scroll">
        {visibleLevels.length === 0 ? (
          <p className="levels__empty">В этом фильтре пока нет уровней — самое время сыграть!</p>
        ) : null}
        {TIER_ORDER.map((tier) => {
          const tierLevels = visibleLevels.filter(
            (level) => level.id >= TIERS[tier].from && level.id <= TIERS[tier].to,
          );
          if (tierLevels.length === 0) return null;
          const earnedStars = tierLevels.reduce(
            (sum, level) => sum + (levels[String(level.id)]?.stars ?? 0),
            0,
          );
          return (
            <section key={tier} className="levels__tier">
              <div className="levels__tier-head">
                <h2 className="levels__tier-title">{TIERS[tier].label}</h2>
                <span className="levels__tier-stars" title="Собрано звёзд в ступени">
                  <StarIcon size={12} filled />
                  {earnedStars} / {tierLevels.length * 3}
                </span>
                <span className="levels__tier-range">
                  {tierLevels[0].id}–{tierLevels[tierLevels.length - 1].id}
                </span>
              </div>
              <div className="levels__grid">
                {tierLevels.map((level) => {
                  const progress = levels[String(level.id)];
                  const unlocked = isUnlocked(level.id);
                  return (
                    <button
                      key={level.id}
                      type="button"
                      className={[
                        'level-card',
                        unlocked ? '' : 'level-card--locked',
                        progress?.stars ? 'level-card--done' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      disabled={!unlocked}
                      aria-label={`Уровень ${level.id}: ${level.name}`}
                      title={level.par ? `${level.name} · пар ${level.par}` : level.name}
                      onClick={() => openLevel(level.id)}
                    >
                      <span className="level-card__id">{level.id}</span>
                      {unlocked ? (
                        <span className="level-card__stars">
                          {Array.from({ length: 3 }, (_, index) => (
                            <StarIcon key={index} size={11} filled={index < (progress?.stars ?? 0)} />
                          ))}
                        </span>
                      ) : (
                        <span className="level-card__lock">
                          <LockIcon size={14} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
