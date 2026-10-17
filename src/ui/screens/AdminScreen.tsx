/**
 * Скрытая админ-панель: ручной редактор уровней.
 *
 * Открывается пятью быстрыми нажатиями на подзаголовок меню, сочетанием
 * Ctrl+Shift+A или адресом `?admin` / `#admin`. Панель не видна в обычном
 * интерфейсе и не входит в игровой поток.
 *
 * Всё, что здесь делается, — это правка расстановки машин на сетке.
 * Проверка (пересечения, выезд, решаемость, пар) считается теми же функциями
 * ядра, что и в игре, поэтому сохранённый уровень гарантированно играбелен.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { BackIcon } from '../components/Icons';
import { getAllLevels, getLevel, resetLevelCache, TIERS } from '@/game/levels/catalog';
import {
  addCar,
  carAt,
  emptyEditor,
  findSimilarLevels,
  findSimilarPairs,
  fromLevel,
  makeTarget,
  moveCarTo,
  removeCar,
  slideRangeFor,
  targetCarOf,
  toMap,
  validateEditor,
  withSize,
  type EditorState,
  type EditorTool,
} from '@/game/levels/editor';
import {
  customLevelCount,
  customLevelSnippet,
  exportCustomLevels,
  getCustomLevel,
  hasCustomLevel,
  importCustomLevels,
  removeCustomLevel,
  saveCustomLevel,
  saveCustomLevelsToProject,
  tierForId,
} from '@/game/levels/custom';
import { CAR_COLOR_KEYS, CAR_COLOR_SKINS, toCss } from '@/game/theme/palettes';
import { carPos } from '@/game/core/rules';
import { clearSolutionCache } from '@/state/gameStore';
import { useProgressStore } from '@/state/progressStore';
import { useUiStore } from '@/state/uiStore';
import type { CarKind, Level } from '@/game/types';

const COLOR_KEYS = CAR_COLOR_KEYS;
const PALETTE = CAR_COLOR_SKINS[0].colors;
const KINDS: CarKind[] = ['sedan', 'hatch', 'suv', 'van'];

const SIZES = [5, 6, 7, 8, 9];

interface DragState {
  id: string;
  axis: 'x' | 'y';
  startClient: number;
  origin: number;
  cell: number;
  moved: boolean;
}

interface PreviewState {
  id: string;
  pos: number;
}

type ModalKind = 'none' | 'export' | 'import' | 'code';
type ProjectState = 'idle' | 'saving' | 'ok' | 'error';

interface HistoryState {
  past: EditorState[];
  future: EditorState[];
}

const HISTORY_LIMIT = 50;

const TOOLS: Array<{ id: EditorTool; label: string; hint: string }> = [
  { id: 'h', label: 'Гориз.', hint: 'Поставить горизонтальную машину' },
  { id: 'v', label: 'Верт.', hint: 'Поставить вертикальную машину' },
  { id: 'target', label: 'Цель', hint: 'Красная машина и выезд' },
  { id: 'erase', label: 'Ластик', hint: 'Убрать машину с поля' },
];

function carColor(index: number): string {
  return toCss(PALETTE[COLOR_KEYS[index % COLOR_KEYS.length]]);
}

function kindFor(length: number, index: number): CarKind {
  if (length >= 3) return index % 2 === 0 ? 'van' : 'bus';
  return KINDS[index % KINDS.length];
}

/** Мини-план уровня: машины сеткой, красная — цель, справа проём выезда. */
function LevelThumb({
  level,
  active,
  onClick,
}: {
  level: Level;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  const boardStyle = {
    '--cols': level.cols,
    '--rows': level.rows,
  } as CSSProperties;

  return (
    <button
      type="button"
      className={['admin__thumb', active ? 'admin__thumb--active' : ''].join(' ')}
      aria-label={`Открыть уровень ${level.id}`}
      aria-pressed={active}
      title={`№${level.id} · ${level.name} · пар ${level.par ?? '—'}`}
      onClick={onClick}
    >
      <span className="admin__thumb-frame">
        <span className="admin__thumb-board" style={boardStyle}>
          {level.cars.map((car) => (
            <i
              key={car.id}
              className={['admin__thumb-car', car.target ? 'admin__thumb-car--target' : '']
                .filter(Boolean)
                .join(' ')}
              style={{
                gridColumn: `${car.x + 1} / span ${car.orientation === 'h' ? car.length : 1}`,
                gridRow: `${car.y + 1} / span ${car.orientation === 'v' ? car.length : 1}`,
                background: car.target ? undefined : toCss(PALETTE[car.color]),
              }}
            />
          ))}
        </span>
        <span
          className="admin__thumb-exit"
          style={{ top: `${((level.exitRow + 0.5) / level.rows) * 100}%` }}
        />
      </span>
      <span className="admin__thumb-id">{level.id}</span>
    </button>
  );
}

export function AdminScreen(): JSX.Element {
  const go = useUiStore((state) => state.go);
  const openLevel = useUiStore((state) => state.openLevel);
  const showToast = useUiStore((state) => state.showToast);

  const [catalogVersion, setCatalogVersion] = useState(0);
  const levels = useMemo(() => getAllLevels(), [catalogVersion]);
  const firstLevel = levels[0];

  const [levelId, setLevelId] = useState<number>(() => firstLevel?.id ?? 1);
  const [state, setState] = useState<EditorState>(() =>
    firstLevel ? fromLevel(firstLevel) : emptyEditor(),
  );
  const [name, setName] = useState<string>(() => firstLevel?.name ?? '');
  const [tool, setTool] = useState<EditorTool>('h');
  const [length, setLength] = useState<2 | 3>(2);
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [resetStars, setResetStars] = useState(true);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [modal, setModal] = useState<ModalKind>('none');
  const [importText, setImportText] = useState('');
  const [projectState, setProjectState] = useState<ProjectState>('idle');
  const [showRepeats, setShowRepeats] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [history, setHistory] = useState<HistoryState>({ past: [], future: [] });

  const boardRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const check = useMemo(() => validateEditor(state), [state]);
  const map = useMemo(() => toMap(state), [state]);
  const target = targetCarOf(state);
  const canSave = check.errors.length === 0 && check.par !== null;
  const saved = hasCustomLevel(levelId);

  const similar = useMemo(
    () => findSimilarLevels(state, levels.filter((level) => level.id !== levelId), 3),
    [state, levels, levelId],
  );
  const repeats = useMemo(() => findSimilarPairs(levels, 0.8, 500), [levels]);

  const loadLevel = useCallback((id: number) => {
    const next = getLevel(id);
    if (!next) return;
    setLevelId(id);
    setState(fromLevel(next));
    setName(next.name);
    setSelected(null);
    setDirty(false);
    setPreview(null);
    setProjectState('idle');
    setHistory({ past: [], future: [] });
  }, []);

  function requestLoad(id: number): void {
    if (id === levelId) return;
    if (dirty && typeof window !== 'undefined' && !window.confirm('Несохранённые изменения будут потеряны. Перейти?')) {
      return;
    }
    loadLevel(id);
  }

  const mutate = useCallback((next: EditorState | null) => {
    if (!next) {
      showToast('Сюда не помещается');
      return;
    }
    setHistory((current) => ({
      past: [...current.past.slice(-(HISTORY_LIMIT - 1)), state],
      future: [],
    }));
    setState(next);
    setDirty(true);
    setSelected((current) => (current && next.cars.some((car) => car.id === current) ? current : null));
  }, [showToast, state]);

  const undo = useCallback(() => {
    if (history.past.length === 0) return;
    const previous = history.past[history.past.length - 1];
    setHistory({
      past: history.past.slice(0, -1),
      future: [state, ...history.future].slice(0, HISTORY_LIMIT),
    });
    setState(previous);
    setDirty(true);
    setSelected(null);
    setPreview(null);
  }, [history, state]);

  const redo = useCallback(() => {
    if (history.future.length === 0) return;
    const nextState = history.future[0];
    setHistory({
      past: [...history.past, state].slice(-HISTORY_LIMIT),
      future: history.future.slice(1),
    });
    setState(nextState);
    setDirty(true);
    setSelected(null);
    setPreview(null);
  }, [history, state]);

  // Ctrl+Z / Ctrl+Shift+Z (и Ctrl+Y) — привычные сочетания редактора.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (key === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  function cellFromEvent(event: ReactPointerEvent<HTMLDivElement>): { x: number; y: number } | null {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * state.cols);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * state.rows);
    if (x < 0 || y < 0 || x >= state.cols || y >= state.rows) return null;
    return { x, y };
  }

  function handleBoardPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.target !== event.currentTarget) return;
    const cell = cellFromEvent(event);
    if (!cell) return;

    if (tool === 'erase') {
      const car = carAt(state, cell);
      if (car) mutate(removeCar(state, car.id));
      return;
    }
    if (tool === 'target') {
      mutate(
        addCar(state, {
          x: Math.min(cell.x, state.cols - 2),
          y: cell.y,
          length: 2,
          orientation: 'h',
          target: true,
        }),
      );
      return;
    }
    const size = length;
    const draft = {
      x: tool === 'h' ? Math.min(cell.x, state.cols - size) : cell.x,
      y: tool === 'v' ? Math.min(cell.y, state.rows - size) : cell.y,
      length: size,
      orientation: tool,
    } as const;
    const next = addCar(state, draft);
    if (!next) {
      showToast('Клетки заняты — выберите другое место');
      return;
    }
    mutate(next);
    const placed = next.cars[next.cars.length - 1];
    if (placed) setSelected(placed.id);
  }

  function handleCarPointerDown(event: ReactPointerEvent<HTMLDivElement>, carId: string): void {
    event.stopPropagation();
    if (tool === 'erase') {
      mutate(removeCar(state, carId));
      return;
    }
    setSelected(carId);
    const car = state.cars.find((item) => item.id === carId);
    const board = boardRef.current;
    if (!car || !board) return;
    const rect = board.getBoundingClientRect();
    const cell = car.orientation === 'h' ? rect.width / state.cols : rect.height / state.rows;
    if (!cell) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      id: car.id,
      axis: car.orientation === 'h' ? 'x' : 'y',
      startClient: car.orientation === 'h' ? event.clientX : event.clientY,
      origin: carPos(car),
      cell,
      moved: false,
    };
  }

  function handleCarPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag) return;
    const client = drag.axis === 'x' ? event.clientX : event.clientY;
    const raw = drag.origin + Math.round((client - drag.startClient) / drag.cell);
    const range = slideRangeFor(state, drag.id);
    const pos = Math.max(range.min, Math.min(range.max, raw));
    if (pos !== drag.origin) drag.moved = true;
    setPreview({ id: drag.id, pos });
  }

  function handleCarPointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setPreview(null);
    if (!drag.moved) return;
    const client = drag.axis === 'x' ? event.clientX : event.clientY;
    const raw = drag.origin + Math.round((client - drag.startClient) / drag.cell);
    const range = slideRangeFor(state, drag.id);
    const pos = Math.max(range.min, Math.min(range.max, raw));
    if (pos !== drag.origin) mutate(moveCarTo(state, drag.id, pos));
  }

  function handleCarPointerCancel(): void {
    dragRef.current = null;
    setPreview(null);
  }

  const selectedCar = state.cars.find((car) => car.id === selected) ?? null;
  const range = selectedCar ? slideRangeFor(state, selectedCar.id) : null;

  function persistCurrent(): boolean {
    if (!canSave) {
      showToast(check.errors[0] ?? 'Сначала исправьте ошибки');
      return false;
    }
    const custom = {
      id: levelId,
      name: name.trim() || `Уровень ${levelId}`,
      map,
      par: check.par ?? undefined,
      updatedAt: Date.now(),
    };
    saveCustomLevel(custom);
    resetLevelCache();
    clearSolutionCache();
    if (resetStars) useProgressStore.getState().resetLevelProgress(levelId);
    const updated = getLevel(levelId);
    if (updated) {
      setState(fromLevel(updated));
      setName(updated.name);
    }
    setDirty(false);
    setHistory({ past: [], future: [] });
    setCatalogVersion((value) => value + 1);
    return true;
  }

  function save(play: boolean): void {
    if (!persistCurrent()) return;
    showToast('Уровень сохранён в браузере');
    if (play) openLevel(levelId);
  }

  async function saveToProject(): Promise<void> {
    if (!persistCurrent()) return;
    setProjectState('saving');
    const result = await saveCustomLevelsToProject();
    if (result.ok) {
      setProjectState('ok');
      showToast(`Записано в файл проекта: ${result.count} ур.`);
    } else {
      setProjectState('error');
      showToast('Файл проекта недоступен — правка осталась в браузере');
    }
  }

  function resetToOriginal(): void {
    removeCustomLevel(levelId);
    resetLevelCache();
    clearSolutionCache();
    setCatalogVersion((value) => value + 1);
    loadLevel(levelId);
    showToast('Исходный уровень восстановлен');
  }

  function close(): void {
    go('menu');
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('admin');
      if (url.hash === '#admin') url.hash = '';
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      /* история недоступна — не критично */
    }
  }

  async function copyText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Скопировано');
    } catch {
      showToast('Браузер не дал скопировать');
    }
  }

  function download(): void {
    const blob = new Blob([exportCustomLevels()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'custom-levels.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  function runImport(): void {
    const result = importCustomLevels(importText);
    if (result.error) {
      showToast(result.error);
      return;
    }
    resetLevelCache();
    clearSolutionCache();
    setCatalogVersion((value) => value + 1);
    loadLevel(levelId);
    setModal('none');
    setImportText('');
    showToast(`Импортировано уровней: ${result.added}`);
  }

  const currentCustom = getCustomLevel(levelId);
  const snippet = customLevelSnippet({
    id: levelId,
    name: name.trim() || `Уровень ${levelId}`,
    map,
    par: check.par ?? undefined,
    updatedAt: Date.now(),
  });

  return (
    <div className="screen screen--admin">
      <header className="screen__header">
        <Button variant="icon" onClick={close} aria-label="Закрыть редактор">
          <BackIcon />
        </Button>
        <h1 className="screen__title">Редактор уровней</h1>
        <span className="admin__secret">скрыто</span>
      </header>

      <div className="admin__scroll">
        <div className="admin__levelbar">
          <button
            type="button"
            className="admin__step"
            onClick={() => requestLoad(Math.max(1, levelId - 1))}
            aria-label="Предыдущий уровень"
          >
            ‹
          </button>
          <select
            className="admin__select"
            value={levelId}
            aria-label="Уровень"
            onChange={(event) => requestLoad(Number(event.target.value))}
          >
            {levels.map((item) => (
              <option key={item.id} value={item.id}>
                №{item.id}
                {hasCustomLevel(item.id) ? ' ✎' : ''} · {item.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="admin__step"
            onClick={() => requestLoad(Math.min(levels.length, levelId + 1))}
            aria-label="Следующий уровень"
          >
            ›
          </button>
        </div>

        <div className="admin__meta">
          <span className={`admin__pill admin__pill--tier`}>
            {TIERS[tierForId(levelId)].label}
          </span>
          {saved ? <span className="admin__pill admin__pill--saved">изменён</span> : null}
          {dirty ? <span className="admin__pill admin__pill--dirty">не сохранено</span> : null}
          <span className="admin__hint">Правок: {customLevelCount()}</span>
        </div>

        <div className="admin__main">
          <div className="admin__board-column">
            <div className="admin__board-wrap">
              <div
                ref={boardRef}
                className="editor-board"
                data-testid="editor-board"
                style={{ '--cols': state.cols, '--rows': state.rows } as CSSProperties}
                onPointerDown={handleBoardPointerDown}
              >
                {state.cars.map((car, index) => {
                  const position = preview && preview.id === car.id ? preview.pos : carPos(car);
                  const left = car.orientation === 'h' ? position : car.x;
                  const top = car.orientation === 'v' ? position : car.y;
                  const width = car.orientation === 'h' ? car.length : 1;
                  const height = car.orientation === 'v' ? car.length : 1;
                  const style = {
                    left: `${(left / state.cols) * 100}%`,
                    top: `${(top / state.rows) * 100}%`,
                    width: `${(width / state.cols) * 100}%`,
                    height: `${(height / state.rows) * 100}%`,
                    '--car-color': car.target ? '#e23b3b' : carColor(index),
                  } as CSSProperties;
                  return (
                    <div
                      key={car.id}
                      className={[
                        'editor-car',
                        `editor-car--${car.orientation}`,
                        car.target ? 'editor-car--target' : '',
                        selected === car.id ? 'editor-car--selected' : '',
                        `editor-car--${kindFor(car.length, index)}`,
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={style}
                      role="button"
                      tabIndex={0}
                      aria-label={`${car.target ? 'Целевая машина' : 'Машина'} ${car.length} клетки`}
                      onPointerDown={(event) => handleCarPointerDown(event, car.id)}
                      onPointerMove={handleCarPointerMove}
                      onPointerUp={handleCarPointerUp}
                      onPointerCancel={handleCarPointerCancel}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelected(car.id);
                        }
                      }}
                    >
                      <span className="editor-car__glass" />
                      <span className="editor-car__light editor-car__light--a" />
                      <span className="editor-car__light editor-car__light--b" />
                    </div>
                  );
                })}
              </div>
              {target ? (
                <div
                  className="editor-exit"
                  style={{
                    top: `${(target.y / state.rows) * 100}%`,
                    height: `${(1 / state.rows) * 100}%`,
                  }}
                >
                  <span>ВЫЕЗД</span>
                  <b>→</b>
                </div>
              ) : null}
            </div>

            <div className="admin__history" role="group" aria-label="История правок">
              <button
                type="button"
                className="admin__tool"
                disabled={history.past.length === 0}
                onClick={undo}
                title="Ctrl+Z"
              >
                ↶ Отменить
              </button>
              <button
                type="button"
                className="admin__tool"
                disabled={history.future.length === 0}
                onClick={redo}
                title="Ctrl+Shift+Z"
              >
                ↷ Вернуть
              </button>
              <span className="admin__hint">Ctrl+Z / Ctrl+Shift+Z</span>
            </div>

            <div className="admin__tools" role="group" aria-label="Инструменты">
              {TOOLS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={['admin__tool', tool === item.id ? 'admin__tool--active' : ''].join(' ')}
                  aria-pressed={tool === item.id}
                  title={item.hint}
                  onClick={() => setTool(item.id)}
                >
                  {item.label}
                </button>
              ))}
              <span className="admin__tool-sep" />
              {([2, 3] as const).map((size) => (
                <button
                  key={size}
                  type="button"
                  className={['admin__tool', length === size ? 'admin__tool--active' : ''].join(' ')}
                  aria-pressed={length === size}
                  disabled={tool === 'erase' || tool === 'target'}
                  onClick={() => setLength(size)}
                >
                  {size} кл.
                </button>
              ))}
            </div>

            <div className="admin__row">
              <label className="admin__field">
                <span>Название</span>
                <input
                  value={name}
                  maxLength={60}
                  onChange={(event) => {
                    setName(event.target.value);
                    setDirty(true);
                  }}
                />
              </label>
              <label className="admin__field admin__field--size">
                <span>Поле</span>
                <select
                  value={state.cols}
                  aria-label="Размер поля"
                  onChange={(event) => {
                    const size = Number(event.target.value);
                    mutate(withSize(state, size, size));
                  }}
                >
                  {SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}×{size}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selectedCar ? (
              <div className="admin__inspector">
                <div className="admin__inspector-info">
                  <b>
                    {selectedCar.target ? 'Цель' : 'Машина'} · {selectedCar.length} кл. ·{' '}
                    {selectedCar.orientation === 'h' ? 'гориз.' : 'верт.'}
                  </b>
                  <span>
                    колонка {selectedCar.x + 1}, строка {selectedCar.y + 1}
                  </span>
                </div>
                <div className="admin__inspector-actions">
                  {selectedCar.orientation === 'h' ? (
                    <>
                      <button
                        type="button"
                        className="admin__nudge"
                        disabled={!range || range.min >= carPos(selectedCar)}
                        onClick={() => mutate(moveCarTo(state, selectedCar.id, carPos(selectedCar) - 1))}
                        aria-label="Сдвинуть влево"
                      >
                        ◀
                      </button>
                      <button
                        type="button"
                        className="admin__nudge"
                        disabled={!range || range.max <= carPos(selectedCar)}
                        onClick={() => mutate(moveCarTo(state, selectedCar.id, carPos(selectedCar) + 1))}
                        aria-label="Сдвинуть вправо"
                      >
                        ▶
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="admin__nudge"
                        disabled={!range || range.min >= carPos(selectedCar)}
                        onClick={() => mutate(moveCarTo(state, selectedCar.id, carPos(selectedCar) - 1))}
                        aria-label="Сдвинуть вверх"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="admin__nudge"
                        disabled={!range || range.max <= carPos(selectedCar)}
                        onClick={() => mutate(moveCarTo(state, selectedCar.id, carPos(selectedCar) + 1))}
                        aria-label="Сдвинуть вниз"
                      >
                        ▼
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="admin__tool"
                    disabled={selectedCar.target || selectedCar.orientation !== 'h'}
                    onClick={() => {
                      mutate(makeTarget(state, selectedCar.id));
                      setSelected('target');
                    }}
                  >
                    Сделать целью
                  </button>
                  <button
                    type="button"
                    className="admin__tool admin__tool--danger"
                    onClick={() => mutate(removeCar(state, selectedCar.id))}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ) : (
              <p className="admin__hint admin__hint--block">
                Нажмите на клетку, чтобы поставить машину. Машину можно перетащить вдоль её оси
                или сдвинуть стрелками.
              </p>
            )}
          </div>

          <div className="admin__side">
            <div
              className={[
                'admin__check',
                check.errors.length > 0 ? 'admin__check--bad' : 'admin__check--good',
              ].join(' ')}
            >
              {check.errors.length > 0 ? (
                <>
                  <b>Нужно исправить</b>
                  <ul>
                    {check.errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <b>Уровень готов</b>
                  <span>
                    Пар: {check.par} ходов · машин: {check.cars} · решение проверено
                  </span>
                </>
              )}
              {check.warnings.map((warning) => (
                <p key={warning} className="admin__warn">
                  {warning}
                </p>
              ))}
            </div>

            <div className="admin__preview">
              <span className="admin__preview-label">Карта</span>
              <pre className="admin__map">{map.join('\n')}</pre>
            </div>

            {similar.length > 0 ? (
              <div className="admin__similar">
                <span>Похожие уровни (нажмите, чтобы открыть):</span>
                {similar.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="admin__similar-item"
                    onClick={() => requestLoad(item.id)}
                  >
                    №{item.id} — {Math.round(item.score * 100)}%
                  </button>
                ))}
              </div>
            ) : (
              <p className="admin__hint">Похожих расстановок не найдено — уровень не повторяет другие.</p>
            )}

            <div className="admin__repeats">
              <button
                type="button"
                className="admin__tool"
                aria-expanded={showRepeats}
                onClick={() => setShowRepeats((value) => !value)}
              >
                {showRepeats ? 'Скрыть повторы' : `Найти повторы по каталогу (${repeats.length})`}
              </button>
              {showRepeats ? (
                repeats.length > 0 ? (
                  <div className="admin__similar admin__similar--list">
                    {repeats.map((pair) => (
                      <div key={`${pair.a}-${pair.b}`} className="admin__repeat-row">
                        <button type="button" onClick={() => requestLoad(pair.a)}>
                          №{pair.a}
                        </button>
                        <span>≈</span>
                        <button type="button" onClick={() => requestLoad(pair.b)}>
                          №{pair.b}
                        </button>
                        <b>{Math.round(pair.score * 100)}%</b>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="admin__hint">Повторов не найдено.</p>
                )
              ) : null}
            </div>

            <label className="admin__checkbox">
              <input
                type="checkbox"
                checked={resetStars}
                onChange={(event) => setResetStars(event.target.checked)}
              />
              <span>Сбросить звёзды этого уровня при сохранении</span>
            </label>

            <div className="admin__actions">
              <Button variant="primary" full disabled={!canSave} onClick={() => save(false)}>
                Сохранить
              </Button>
              <Button variant="secondary" full disabled={!canSave} onClick={() => save(true)}>
                Сохранить и играть
              </Button>
              <Button
                variant="ghost"
                full
                disabled={!saved && !currentCustom}
                onClick={resetToOriginal}
              >
                Вернуть исходный
              </Button>
              <div className="admin__actions-row">
                <Button variant="secondary" full onClick={() => setModal('export')}>
                  Экспорт
                </Button>
                <Button variant="secondary" full onClick={() => setModal('import')}>
                  Импорт
                </Button>
              </div>
              <Button
                variant="ghost"
                full
                disabled={!canSave || projectState === 'saving'}
                onClick={() => void saveToProject()}
              >
                {projectState === 'saving' ? 'Записываю файл…' : 'Записать в файл проекта'}
              </Button>
              {projectState === 'ok' ? (
                <span className="admin__hint">Файл проекта обновлён — правку можно коммитить.</span>
              ) : null}
              {projectState === 'error' ? (
                <span className="admin__hint">Файл недоступен: правка сохранена только в браузере.</span>
              ) : null}
              <p className="admin__hint admin__hint--block">
                «Сохранить» хранит правку в браузере. «Записать в файл проекта» сохраняет её в
                <code> src/game/levels/custom-levels.json</code> — так её можно закоммитить.
                Панель открывается пятью нажатиями на подзаголовок меню, Ctrl+Shift+A или адресом
                <code> ?admin</code>.
              </p>
            </div>
          </div>
        </div>
      </div>

      <section className="admin__gallery">
        <button
          type="button"
          className="admin__tool"
          aria-expanded={showGallery}
          onClick={() => setShowGallery((value) => !value)}
        >
          {showGallery ? 'Скрыть галерею' : `Галерея каталога (${levels.length})`}
        </button>
        {showGallery ? (
          <div className="admin__gallery-grid">
            {levels.map((level) => (
              <LevelThumb
                key={level.id}
                level={level}
                active={level.id === levelId}
                onClick={() => requestLoad(level.id)}
              />
            ))}
          </div>
        ) : null}
      </section>

      {modal === 'export' ? (
        <Modal title="Экспорт правок" onClose={() => setModal('none')}>
          <p className="modal__text">
            Это все уровни, изменённые в браузере. Сохраните файл или вставьте содержимое в
            <code> src/game/levels/custom-levels.json</code>.
          </p>
          <textarea className="admin__textarea" readOnly value={exportCustomLevels()} rows={10} />
          <div className="modal__row">
            <Button variant="secondary" full onClick={() => void copyText(exportCustomLevels())}>
              Копировать
            </Button>
            <Button variant="primary" full onClick={download}>
              Скачать
            </Button>
          </div>
          <Button variant="ghost" full onClick={() => setModal('code')}>
            Код для generated.ts
          </Button>
        </Modal>
      ) : null}

      {modal === 'code' ? (
        <Modal title={`Уровень ${levelId} для generated.ts`} onClose={() => setModal('none')}>
          <p className="modal__text">
            Вставьте этот блок в <code>GENERATED_LEVELS</code>, чтобы уровень стал частью сборки.
          </p>
          <textarea className="admin__textarea" readOnly value={snippet} rows={10} />
          <div className="modal__row">
            <Button variant="secondary" full onClick={() => void copyText(snippet)}>
              Копировать
            </Button>
            <Button variant="primary" full onClick={() => setModal('none')}>
              Готово
            </Button>
          </div>
        </Modal>
      ) : null}

      {modal === 'import' ? (
        <Modal title="Импорт правок" onClose={() => setModal('none')}>
          <p className="modal__text">
            Вставьте JSON из экспорта или содержимое <code>custom-levels.json</code>. Уровни с
            теми же номерами будут заменены.
          </p>
          <textarea
            className="admin__textarea"
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            rows={10}
            placeholder='{"version":1,"levels":[...]}'
          />
          <div className="modal__row">
            <Button variant="secondary" full onClick={() => setModal('none')}>
              Отмена
            </Button>
            <Button variant="primary" full onClick={runImport} disabled={!importText.trim()}>
              Импортировать
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

