import { useState } from 'react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { CoinBadge } from '../../components/Badges';
import { SHOP_ITEMS, useProgressStore } from '@/state/progressStore';
import { useUiStore } from '@/state/uiStore';
import { rewardedAvailable, showRewardedVideo } from '@/services/yandex';

/** Быстрый магазин прямо из игры: подсказки и отмены. */
export function ShopDialog(): JSX.Element {
  const closeDialog = useUiStore((state) => state.closeDialog);
  const showToast = useUiStore((state) => state.showToast);
  const coins = useProgressStore((state) => state.coins);
  const hints = useProgressStore((state) => state.hints);
  const undos = useProgressStore((state) => state.undos);
  const purchase = useProgressStore((state) => state.purchase);
  const addHints = useProgressStore((state) => state.addHints);
  const [watching, setWatching] = useState(false);
  const canWatchAd = rewardedAvailable();

  const items = SHOP_ITEMS.filter((item) => item.kind === 'hint' || item.kind === 'undo');

  return (
    <Modal className="modal--shop" title="Помощь на парковке">
      <div className="shop__balance">
        <CoinBadge value={coins} />
        <span className="shop__inventory">
          Подсказок: <b>{hints}</b> · Отмен: <b>{undos}</b>
        </span>
      </div>
      <div className="shop__list">
        <div className="shop__item shop__item--ad">
          <div className="shop__item-info">
            <span className="shop__item-title">Подсказка за рекламу</span>
            <span className="shop__item-desc">
              {canWatchAd
                ? 'Посмотрите короткий ролик и получите +1 подсказку'
                : 'Доступно в Яндекс Играх: Rewarded Video подключится вместе с SDK'}
            </span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={!canWatchAd || watching}
            onClick={() => {
              setWatching(true);
              void showRewardedVideo().then((rewarded) => {
                setWatching(false);
                if (!rewarded) {
                  showToast('Реклама недоступна — попробуйте позже');
                  return;
                }
                addHints(1);
                showToast('Награда получена: +1 подсказка');
              });
            }}
          >
            {watching ? 'Ролик идёт…' : 'Смотреть'}
          </Button>
        </div>
        {items.map((item) => (
          <div key={item.id} className="shop__item">
            <div className="shop__item-info">
              <span className="shop__item-title">{item.title}</span>
              <span className="shop__item-desc">{item.description}</span>
            </div>
            <Button
              variant="primary"
              size="sm"
              disabled={coins < item.price}
              onClick={() => {
                const ok = purchase(item);
                showToast(ok ? `Куплено: ${item.title}` : 'Недостаточно монет');
              }}
            >
              {item.price} монет
            </Button>
          </div>
        ))}
      </div>
      <Button variant="ghost" full onClick={closeDialog}>
        Закрыть
      </Button>
    </Modal>
  );
}
