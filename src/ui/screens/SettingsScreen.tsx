import { useState } from 'react';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { BackIcon } from '../components/Icons';
import { CAR_COLOR_KEYS, CAR_COLOR_SKINS, PARKING_SKINS, toCss } from '@/game/theme/palettes';
import { useProgressStore } from '@/state/progressStore';
import { getLevelCount } from '@/game/levels/catalog';
import { useUiStore } from '@/state/uiStore';

interface ToggleProps {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

function Toggle({ label, description, value, onChange }: ToggleProps): JSX.Element {
  return (
    <button
      type="button"
      className={['toggle', value ? 'toggle--on' : ''].filter(Boolean).join(' ')}
      onClick={() => onChange(!value)}
      aria-pressed={value}
    >
      <span className="toggle__text">
        <span className="toggle__label">{label}</span>
        <span className="toggle__desc">{description}</span>
      </span>
      <span className="toggle__switch">
        <span className="toggle__knob" />
      </span>
    </button>
  );
}

export function SettingsScreen(): JSX.Element {
  const go = useUiStore((state) => state.go);
  const showToast = useUiStore((state) => state.showToast);
  const {
    soundEnabled,
    musicEnabled,
    vibrations,
    parkingSkin,
    carSkin,
    ownedSkins,
    totalMoves,
    levelsCompleted,
    setSetting,
    setSkin,
    resetProgress,
  } = useProgressStore();
  const totalStars = useProgressStore((state) => state.totalStars());
  const levelCount = getLevelCount();
  const starsLimit = levelCount * 3;
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="screen screen--settings">
      <header className="screen__header">
        <Button variant="icon" onClick={() => go('menu')} aria-label="Назад">
          <BackIcon />
        </Button>
        <h1 className="screen__title">Настройки</h1>
        <span className="screen__spacer" />
      </header>

      <div className="settings__scroll">
        <section className="settings__group">
          <h2 className="settings__group-title">Звук</h2>
          <Toggle
            label="Звуковые эффекты"
            description="Перемещение, победа, кнопки"
            value={soundEnabled}
            onChange={(value) => setSetting('soundEnabled', value)}
          />
          <Toggle
            label="Музыка"
            description="Фоновая музыка в меню"
            value={musicEnabled}
            onChange={(value) => setSetting('musicEnabled', value)}
          />
          <Toggle
            label="Вибрация"
            description="Отклик на телефонах"
            value={vibrations}
            onChange={(value) => setSetting('vibrations', value)}
          />
        </section>

        <section className="settings__group">
          <h2 className="settings__group-title">Оформление парковки</h2>
          <div className="skin-list">
            {PARKING_SKINS.map((skin) => {
              const owned = skin.price === 0 || ownedSkins.includes(`parking-${skin.id}`);
              return (
                <button
                  key={skin.id}
                  type="button"
                  className={['skin-chip', parkingSkin === skin.id ? 'skin-chip--active' : ''].join(' ')}
                  disabled={!owned}
                  onClick={() => {
                    setSkin('parking', skin.id);
                    showToast(`Оформление: ${skin.name}`);
                  }}
                >
                  <span className="skin-chip__dots">
                    <i style={{ background: toCss(skin.asphalt) }} />
                    <i style={{ background: toCss(skin.grass) }} />
                  </span>
                  <span className="skin-chip__name">{skin.name}</span>
                  {!owned ? <span className="skin-chip__note">в магазине</span> : null}
                </button>
              );
            })}
          </div>
        </section>

        <section className="settings__group">
          <h2 className="settings__group-title">Цвета машин</h2>
          <div className="skin-list">
            {CAR_COLOR_SKINS.map((skin) => {
              const owned = skin.price === 0 || ownedSkins.includes(`cars-${skin.id}`);
              return (
                <button
                  key={skin.id}
                  type="button"
                  className={['skin-chip', carSkin === skin.id ? 'skin-chip--active' : ''].join(' ')}
                  disabled={!owned}
                  onClick={() => {
                    setSkin('cars', skin.id);
                    showToast(`Цвета: ${skin.name}`);
                  }}
                >
                  <span className="skin-chip__dots">
                    {CAR_COLOR_KEYS.slice(0, 4).map((key) => (
                      <i key={key} style={{ background: toCss(skin.colors[key]) }} />
                    ))}
                  </span>
                  <span className="skin-chip__name">{skin.name}</span>
                  {!owned ? <span className="skin-chip__note">в магазине</span> : null}
                </button>
              );
            })}
          </div>
        </section>

        <section className="settings__group">
          <h2 className="settings__group-title">Статистика</h2>
          <div className="stats-list">
            <div className="stats-row">
              <span>Пройдено уровней</span>
              <b>
                {levelsCompleted} / {levelCount}
              </b>
            </div>
            <div className="stats-row">
              <span>Собрано звёзд</span>
              <b>
                {totalStars} / {starsLimit}
              </b>
            </div>
            <div className="stats-row">
              <span>Всего ходов</span>
              <b>{totalMoves}</b>
            </div>
          </div>
        </section>

        <section className="settings__group">
          <h2 className="settings__group-title">Данные</h2>
          <Button variant="danger" full onClick={() => setConfirmReset(true)}>
            Сбросить прогресс
          </Button>
          <p className="settings__about">
            «Парковочный переполох» — головоломка про парковку. Прогресс сохраняется в браузере.
          </p>
        </section>
      </div>

      {confirmReset ? (
        <Modal title="Сбросить прогресс?" onClose={() => setConfirmReset(false)}>
          <p className="modal__text">
            Все пройденные уровни, звёзды, монеты и покупки будут удалены. Действие нельзя отменить.
          </p>
          <div className="modal__row">
            <Button variant="secondary" full onClick={() => setConfirmReset(false)}>
              Отмена
            </Button>
            <Button
              variant="danger"
              full
              onClick={() => {
                resetProgress();
                setConfirmReset(false);
                showToast('Прогресс сброшен');
              }}
            >
              Сбросить
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
