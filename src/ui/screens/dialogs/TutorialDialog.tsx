import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { useProgressStore } from '@/state/progressStore';
import { useUiStore } from '@/state/uiStore';

/** Короткий урок при первом запуске первого уровня. */
export function TutorialDialog(): JSX.Element {
  const closeDialog = useUiStore((state) => state.closeDialog);
  const dismissTutorial = useProgressStore((state) => state.dismissTutorial);

  const done = (): void => {
    dismissTutorial();
    closeDialog();
  };

  return (
    <Modal className="modal--tutorial" title="Как играть" onClose={done}>
      <div className="tutorial">
        <div className="tutorial__scheme" aria-hidden="true">
          <span className="tutorial__car tutorial__car--h" />
          <span className="tutorial__car tutorial__car--v" />
          <span className="tutorial__car tutorial__car--target" />
          <span className="tutorial__exit">Выезд</span>
        </div>
        <ul className="tutorial__list">
          <li>Тяните машину вдоль её полосы: горизонтальную — влево-вправо, вертикальную — вверх-вниз.</li>
          <li>Красная машина должна доехать до правого края и выехать с парковки.</li>
          <li>Один завершённый жест — один ход. Чем ближе к пару, тем больше звёзд.</li>
          <li>Застряли? «Подсказка» покажет следующий ход из настоящего решения.</li>
        </ul>
      </div>
      <Button variant="primary" size="lg" full onClick={done}>
        Понятно
      </Button>
    </Modal>
  );
}
