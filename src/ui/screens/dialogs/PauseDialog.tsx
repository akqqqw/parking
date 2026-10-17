import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { audio } from '@/services/audio';
import { useGameStore } from '@/state/gameStore';
import { useUiStore } from '@/state/uiStore';
import { useProgressStore } from '@/state/progressStore';

export function PauseDialog(): JSX.Element {
  const closeDialog = useUiStore((state) => state.closeDialog);
  const openDialog = useUiStore((state) => state.openDialog);
  const go = useUiStore((state) => state.go);
  const restart = useGameStore((state) => state.restart);
  const soundEnabled = useProgressStore((state) => state.soundEnabled);
  const musicEnabled = useProgressStore((state) => state.musicEnabled);
  const setSetting = useProgressStore((state) => state.setSetting);

  return (
    <Modal className="modal--pause" title="Пауза">
      <div className="pause__actions">
        <Button variant="primary" size="lg" full onClick={closeDialog}>
          Продолжить
        </Button>
        <Button
          variant="secondary"
          full
          onClick={() => {
            restart();
            closeDialog();
          }}
        >
          Начать уровень заново
        </Button>
        <div className="pause__toggles">
          <Button
            variant="secondary"
            full
            aria-pressed={soundEnabled}
            onClick={() => setSetting('soundEnabled', !soundEnabled)}
          >
            {soundEnabled ? 'Звук вкл.' : 'Звук выкл.'}
          </Button>
          <Button
            variant="secondary"
            full
            aria-pressed={musicEnabled}
            onClick={() => setSetting('musicEnabled', !musicEnabled)}
          >
            {musicEnabled ? 'Музыка вкл.' : 'Музыка выкл.'}
          </Button>
        </div>
        <Button variant="secondary" full onClick={() => openDialog('tutorial')}>
          Как играть
        </Button>
        <Button variant="secondary" full onClick={() => openDialog('hint-shop')}>
          Магазин подсказок
        </Button>
        <Button
          variant="ghost"
          full
          onClick={() => {
            audio.click();
            go('menu');
          }}
        >
          Выйти в меню
        </Button>
      </div>
    </Modal>
  );
}
