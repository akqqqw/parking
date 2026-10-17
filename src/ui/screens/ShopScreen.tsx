import { useState } from 'react';
import { Button } from '../components/Button';
import { CoinBadge } from '../components/Badges';
import { BackIcon } from '../components/Icons';
import { CAR_COLOR_KEYS, CAR_COLOR_SKINS, PARKING_SKINS, toCss } from '@/game/theme/palettes';
import { SHOP_ITEMS, useProgressStore, type ShopItem } from '@/state/progressStore';
import { useUiStore } from '@/state/uiStore';

type Tab = 'help' | 'parking' | 'cars';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'help', label: 'Помощь' },
  { id: 'parking', label: 'Парковка' },
  { id: 'cars', label: 'Машины' },
];

function skinPreview(item: ShopItem): JSX.Element | null {
  if (item.kind === 'parking') {
    const skin = PARKING_SKINS.find((entry) => entry.id === item.value);
    if (!skin) return null;
    return (
      <div className="skin-preview skin-preview--parking">
        <span style={{ background: toCss(skin.asphalt) }} />
        <span style={{ background: toCss(skin.grass) }} />
        <span style={{ background: toCss(skin.curb) }} />
      </div>
    );
  }
  if (item.kind === 'cars') {
    const skin = CAR_COLOR_SKINS.find((entry) => entry.id === item.value);
    if (!skin) return null;
    return (
      <div className="skin-preview">
        {CAR_COLOR_KEYS.slice(0, 6).map((key) => (
          <span key={key} style={{ background: toCss(skin.colors[key]) }} />
        ))}
      </div>
    );
  }
  return null;
}

export function ShopScreen(): JSX.Element {
  const go = useUiStore((state) => state.go);
  const showToast = useUiStore((state) => state.showToast);
  const [tab, setTab] = useState<Tab>('help');
  const coins = useProgressStore((state) => state.coins);
  const hints = useProgressStore((state) => state.hints);
  const undos = useProgressStore((state) => state.undos);
  const owned = useProgressStore((state) => state.ownedSkins);
  const parkingSkin = useProgressStore((state) => state.parkingSkin);
  const carSkin = useProgressStore((state) => state.carSkin);
  const purchase = useProgressStore((state) => state.purchase);
  const setSkin = useProgressStore((state) => state.setSkin);

  const items = SHOP_ITEMS.filter((item) =>
    tab === 'help' ? item.kind === 'hint' || item.kind === 'undo' : item.kind === tab,
  );

  return (
    <div className="screen screen--shop">
      <header className="screen__header">
        <Button variant="icon" onClick={() => go('menu')} aria-label="Назад">
          <BackIcon />
        </Button>
        <h1 className="screen__title">Магазин</h1>
        <CoinBadge value={coins} size={18} />
      </header>

      <div className="tabs">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={['tab', entry.id === tab ? 'tab--active' : ''].filter(Boolean).join(' ')}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="shop__balance" role="status">
        <span className="shop__inventory">
          Сейчас у вас: подсказки — <b>{hints}</b>, отмены — <b>{undos}</b>
        </span>
        <CoinBadge value={coins} size={16} />
      </div>

      <div className="shop__scroll">
        {items.map((item) => {
          const isOwned = owned.includes(item.id);
          const isActive =
            (item.kind === 'parking' && parkingSkin === item.value) ||
            (item.kind === 'cars' && carSkin === item.value);
          return (
            <div key={item.id} className="shop-card">
              {skinPreview(item)}
              <div className="shop-card__info">
                <span className="shop-card__title">{item.title}</span>
                <span className="shop-card__desc">{item.description}</span>
              </div>
              {isOwned ? (
                <Button
                  variant={isActive ? 'ghost' : 'secondary'}
                  size="sm"
                  disabled={isActive}
                  onClick={() => {
                    setSkin(item.kind === 'parking' ? 'parking' : 'cars', item.value ?? '');
                    showToast(isActive ? 'Уже выбрано' : `Выбрано: ${item.title}`);
                  }}
                >
                  {isActive ? 'Выбрано' : 'Выбрать'}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={coins < item.price}
                  onClick={() => {
                    const ok = purchase(item);
                    showToast(ok ? `Куплено: ${item.title}` : 'Недостаточно монет');
                  }}
                >
                  {item.price}
                </Button>
              )}
            </div>
          );
        })}
        <p className="shop__hint">
          Монеты начисляются за пройденные уровни: чем меньше ходов, тем больше награда.
        </p>
      </div>
    </div>
  );
}
