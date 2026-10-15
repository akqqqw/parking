/**
 * Геометрия игрового поля: перевод клеток в пиксели.
 *
 * Чистые функции — благодаря этому компоновку можно тестировать без Phaser.
 */

export interface Metrics {
  /** Размер клетки в пикселях. */
  cell: number;
  cols: number;
  rows: number;
  /** Левый верхний угол сетки в пикселях сцены. */
  originX: number;
  originY: number;
  /** Ширина газона вокруг сетки. */
  margin: number;
  /** Ширина полосы выезда справа. */
  exitLane: number;
  viewW: number;
  viewH: number;
  /** Отступ сверху под интерфейс (HUD накладывается поверх сцены). */
  hudSafeTop: number;
  hudSafeBottom: number;
}

export interface LayoutOptions {
  /** Минимальный и максимальный размер клетки. */
  minCell?: number;
  maxCell?: number;
}

/**
 * Подобрать размер клетки так, чтобы парковка целиком помещалась на экране
 * любого размера (телефон в портрете, планшет, десктоп).
 */
export function computeMetrics(
  viewW: number,
  viewH: number,
  cols: number,
  rows: number,
  options: LayoutOptions = {},
): Metrics {
  const minCell = options.minCell ?? 26;
  const maxCell = options.maxCell ?? 104;

  // Место, которое занимает «обвязка»: газон слева/сверху/снизу, полоса выезда
  // справа и небольшой отступ от краёв экрана.
  const frameCols = 1.1; // 0.55 клетки газона слева + 0.55 справа
  const frameRows = 1.1;
  const exitLaneCols = 0.85;

  const hudSafeTop = Math.min(Math.max(viewH * 0.13, 84), 132);
  const hudSafeBottom = Math.min(Math.max(viewH * 0.06, 24), 84);

  const availW = Math.max(viewW - 24, 120);
  const availH = Math.max(viewH - hudSafeTop - hudSafeBottom, 160);

  const cellFromWidth = availW / (cols + frameCols + exitLaneCols);
  const cellFromHeight = availH / (rows + frameRows);
  const cell = Math.max(minCell, Math.min(maxCell, Math.min(cellFromWidth, cellFromHeight)));

  const boardW = cols * cell;
  const boardH = rows * cell;
  const margin = cell * 0.55;
  const exitLane = cell * exitLaneCols;

  const totalW = boardW + margin * 2 + exitLane;
  const totalH = boardH + margin * 2;

  const originX = (viewW - totalW) / 2 + margin;
  const originY = hudSafeTop + Math.max((availH - totalH) / 2, 0) + margin;

  return {
    cell,
    cols,
    rows,
    originX,
    originY,
    margin,
    exitLane,
    viewW,
    viewH,
    hudSafeTop,
    hudSafeBottom,
  };
}

/** Пиксельный X центра клетки. */
export function cellCenterX(metrics: Metrics, x: number): number {
  return metrics.originX + (x + 0.5) * metrics.cell;
}

/** Пиксельный Y центра клетки. */
export function cellCenterY(metrics: Metrics, y: number): number {
  return metrics.originY + (y + 0.5) * metrics.cell;
}

/**
 * Пиксельный центр автомобиля: `axisPos` — координата вдоль его оси
 * (может быть дробной во время перетаскивания).
 */
export function carPixelPos(
  metrics: Metrics,
  car: { x: number; y: number; length: number; orientation: 'h' | 'v' },
  axisPos: number,
): { x: number; y: number } {
  const { cell, originX, originY } = metrics;
  const center = axisPos + car.length / 2;
  return car.orientation === 'h'
    ? { x: originX + center * cell, y: originY + (car.y + 0.5) * cell }
    : { x: originX + (car.x + 0.5) * cell, y: originY + center * cell };
}

/** Клетка сетки по координатам сцены (может выходить за пределы поля). */
export function pointToCell(metrics: Metrics, px: number, py: number): { x: number; y: number } {
  return {
    x: Math.floor((px - metrics.originX) / metrics.cell),
    y: Math.floor((py - metrics.originY) / metrics.cell),
  };
}

export function isInsideBoard(metrics: Metrics, cellX: number, cellY: number): boolean {
  return cellX >= 0 && cellY >= 0 && cellX < metrics.cols && cellY < metrics.rows;
}
