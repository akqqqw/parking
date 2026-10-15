import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { audio } from '@/services/audio';
import { useGameStore } from '@/state/gameStore';
import { useUiStore } from '@/state/uiStore';

export function PauseDialog(): JSX.Element {
  const closeDialog = useUiStore((state) => state.closeDialog);
  const openDialog = useUiStore((state) => state.openDialog);
  const go = useUiStore((state) => state.go);
  const restart = useGameStore((state) => state.restart);

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
