/**
 * Игровая сцена Phaser: отрисовка парковки, машин и обработка перетаскивания.
 *
 * Сцена не хранит собственной «правды» о положении машин: она отображает
 * состояние из `gameStore`. Игрок тянет машину → сцена отправляет ход в
 * хранилище → подписка возвращает новую расстановку → сцена плавно доводит
 * машину до клетки. Благодаря этому отмена хода, перезапуск и подсказки
 * работают без дублирования логики.
 */

import Phaser from 'phaser';
import { bridge } from '../bridge';
import { audio } from '@/services/audio';
import { useGameStore } from '@/state/gameStore';
import { buildOccupancy, slideRange } from '../core';
import { hashString } from '../rng';
import {
  DEFAULT_CAR_SKIN,
  DEFAULT_PARKING_SKIN,
  getCarSkin,
  getParkingSkin,
  type CarColorSkin,
  type ParkingSkin,
} from '../theme/palettes';
import type { Car, Level, Move, SlideRange } from '../types';
import { BoardRenderer } from './BoardRenderer';
import { CarView, type CarFacing } from './CarView';
import {
  createDragSession,
  dragDeltaCells,
  moveForDrag,
  visualAxisPos,
  type DragSession,
} from './dragMath';
import {
  carPixelPos,
  cellCenterY,
  computeMetrics,
  isInsideBoard,
  pointToCell,
  type Metrics,
} from './layout';

interface DragState extends DragSession {
  pointerId: number;
  moved: boolean;
}

const SNAP_DURATION = 140;

export class GameScene extends Phaser.Scene {
  private levelRef: Level | null = null;
  private cars: Car[] = [];
  private carsRef: Car[] | null = null;
  private views = new Map<string, CarView>();
  private board!: BoardRenderer;
  private metrics!: Metrics;

  private drag: DragState | null = null;
  private hovered: string | null = null;
  private paused = false;
  private busy = false;
  private wonPlayed = false;
  private resetToken = -1;
  private hintToken = -1;
  private resizeTimer?: Phaser.Time.TimerEvent;
  private unsubscribeStore?: () => void;
  private offTheme?: () => void;
  private offPause?: () => void;

  private parkingSkin: ParkingSkin = getParkingSkin(DEFAULT_PARKING_SKIN);
  private carSkin: CarColorSkin = getCarSkin(DEFAULT_CAR_SKIN);

  constructor() {
    super('game');
  }

  create(): void {
    this.board = new BoardRenderer(this);
    this.makeSparkTexture();
    this.cameras.main.setBackgroundColor(this.parkingSkin.grass);

    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerup', this.handlePointerUp, this);
    this.input.on('pointerupoutside', this.handlePointerUp, this);
    this.scale.on('resize', this.handleResize, this);

    this.offTheme = bridge.on('theme:update', ({ parking, cars }) => {
      this.parkingSkin = parking;
      this.carSkin = cars;
      this.cameras.main.setBackgroundColor(parking.grass);
      if (this.levelRef) this.rebuild();
    });
    this.offPause = bridge.on('game:paused', ({ paused }) => {
      this.paused = paused;
      if (paused) {
        audio.stopEngine();
        this.cancelDrag();
      }
    });

    this.unsubscribeStore = useGameStore.subscribe((state, prev) => {
      void prev;
      this.applyStoreState(state);
    });
    this.applyStoreState(useGameStore.getState(), true);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    bridge.emit('scene:ready', { levelId: this.levelRef?.id ?? null });
  }

  private teardown(): void {
    this.unsubscribeStore?.();
    this.offTheme?.();
    this.offPause?.();
    this.scale.off('resize', this.handleResize, this);
    this.input.off('pointerdown', this.handlePointerDown, this);
    this.input.off('pointermove', this.handlePointerMove, this);
    this.input.off('pointerup', this.handlePointerUp, this);
    this.input.off('pointerupoutside', this.handlePointerUp, this);
    this.views.forEach((view) => view.destroy());
    this.views.clear();
    this.board?.destroy();
  }

  private makeSparkTexture(): void {
    if (this.textures.exists('spark')) return;
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(6, 6, 5.2);
    graphics.generateTexture('spark', 12, 12);
    graphics.destroy();
  }

  // ---------------------------------------------------------------- состояние

  private applyStoreState(state: ReturnType<typeof useGameStore.getState>, force = false): void {
    if (!state.level) {
      this.clearBoard();
      return;
    }
    const needsRebuild = force || state.level !== this.levelRef || state.resetToken !== this.resetToken;
    if (needsRebuild) {
      this.levelRef = state.level;
      this.resetToken = state.resetToken;
      // Если уровень был пройден и награда уже начислена (игрок вернулся на
      // экран), не проигрываем анимацию выезда повторно.
      this.wonPlayed = state.rewardGranted && state.status === 'won';
      this.busy = false;
      this.hintToken = -1;
      this.buildLevel(state.level);
      this.syncCars(state.cars, 0);
      bridge.emit('level:loaded', { level: state.level });
    } else if (state.cars !== this.carsRef) {
      this.syncCars(state.cars, SNAP_DURATION);
    }

    if (state.hint && state.hint.token !== this.hintToken) {
      this.hintToken = state.hint.token;
      this.showHint(state.hint.carId);
    }
    if (state.status === 'won' && !this.wonPlayed) {
      this.wonPlayed = true;
      this.playExitAnimation();
    } else if (state.status === 'playing') {
      this.wonPlayed = false;
    }
  }

  private clearBoard(): void {
    this.views.forEach((view) => view.destroy());
    this.views.clear();
    this.levelRef = null;
    this.cars = [];
  }

  private rebuild(): void {
    if (!this.levelRef) return;
    const level = this.levelRef;
    this.buildLevel(level);
    this.syncCars(useGameStore.getState().cars, 0);
  }

  private buildLevel(level: Level): void {
    this.views.forEach((view) => view.destroy());
    this.views.clear();
    this.cars = level.cars;
    this.carsRef = level.cars;
    this.metrics = computeMetrics(this.scale.width, this.scale.height, level.cols, level.rows);
    this.board.draw({
      level,
      metrics: this.metrics,
      skin: this.parkingSkin,
      seed: hashString(`board:${level.id}`),
    });
    for (const car of level.cars) {
      const view = new CarView(this, car, this.metrics, this.facingFor(level, car), this.carSkin);
      view.setDepth(20);
      this.views.set(car.id, view);
    }
  }

  private facingFor(level: Level, car: Car): CarFacing {
    if (car.orientation === 'h') {
      if (car.target) return 'right';
      return hashString(`${level.id}:${car.id}`) % 2 === 0 ? 'right' : 'left';
    }
    return hashString(`${level.id}:${car.id}`) % 2 === 0 ? 'up' : 'down';
  }

  /** Плавно привести машины к новой расстановке. */
  private syncCars(cars: Car[], duration: number): void {
    this.cars = cars;
    this.carsRef = cars;
    for (const car of cars) {
      let view = this.views.get(car.id);
      if (!view && this.levelRef) {
        view = new CarView(this, car, this.metrics, this.facingFor(this.levelRef, car), this.carSkin);
        view.setDepth(20);
        this.views.set(car.id, view);
      }
      if (!view || !this.metrics) continue;
      const axisPos = car.orientation === 'h' ? car.x : car.y;
      const keepDragging = this.drag?.car.id === car.id;
      if (keepDragging) continue;
      const target = carPixelPos(this.metrics, car, axisPos);
      const close = Math.abs(view.x - target.x) < 0.7 && Math.abs(view.y - target.y) < 0.7;
      if (close) {
        view.setPosition(target.x, target.y);
      } else {
        void view.slideTo(this.metrics, axisPos, duration);
      }
    }
  }

  // ---------------------------------------------------------------- ввод

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.paused || this.busy || !this.levelRef || !this.metrics) return;
    if (useGameStore.getState().status === 'won') return;
    audio.unlock();

    const cell = pointToCell(this.metrics, pointer.x, pointer.y);
    if (!isInsideBoard(this.metrics, cell.x, cell.y)) return;
    const carId = this.occupancyAt(cell.x, cell.y);
    if (!carId) return;

    const car = this.cars.find((item) => item.id === carId);
    if (!car) return;

    const range = this.rangeFor(car);
    this.drag = {
      ...createDragSession(car, pointer.x, pointer.y, range),
      pointerId: pointer.id,
      moved: false,
    };
    const view = this.views.get(carId);
    view?.setDragging(true);
    view?.clearHint();
    this.drawTrack(car, range);
    audio.pick();
    audio.startEngine();
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.metrics || !this.levelRef) return;

    if (!this.drag) {
      // Наведение курсора (десктоп).
      if (this.paused || this.busy) return;
      const cell = pointToCell(this.metrics, pointer.x, pointer.y);
      const carId = isInsideBoard(this.metrics, cell.x, cell.y) ? this.occupancyAt(cell.x, cell.y) : null;
      if (carId !== this.hovered) {
        if (this.hovered) this.views.get(this.hovered)?.setHover(false);
        if (carId) this.views.get(carId)?.setHover(true);
        this.hovered = carId;
        this.input.setDefaultCursor(carId ? 'grab' : 'default');
      }
      return;
    }

    if (pointer.id !== this.drag.pointerId) return;
    const session = this.drag;
    const car = this.cars.find((item) => item.id === session.car.id);
    if (!car) return;

    const deltaCells = dragDeltaCells(session, this.metrics, pointer.x, pointer.y);
    const visual = visualAxisPos(session, this.metrics, pointer.x, pointer.y);
    if (Math.abs(visual - session.startAxisPos) > 0.08) session.moved = true;

    const view = this.views.get(car.id);
    if (!view) return;
    const { x, y } = carPixelPos(this.metrics, car, visual);
    view.setPosition(x, y);
    audio.updateEngine(Math.min(1, Math.abs(deltaCells) / 2));
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.drag || pointer.id !== this.drag.pointerId) return;
    const session = this.drag;
    const { car, startAxisPos, range, moved } = session;
    const carId = car.id;
    this.drag = null;
    this.board.clearTrack();
    audio.stopEngine();

    const view = this.views.get(carId);
    view?.setDragging(false);
    if (!car) return;

    const move: Move | null = moveForDrag(session, this.metrics, pointer.x, pointer.y);
    if (move) {
      useGameStore.getState().registerMove(move);
      audio.snap();
      return;
    }

    if (view) void view.slideTo(this.metrics, startAxisPos, SNAP_DURATION);
    if (range.min === range.max) {
      view?.shake();
      audio.error();
    } else if (moved) {
      audio.snap();
    }
  }

  private cancelDrag(): void {
    if (!this.drag) return;
    const { car, startAxisPos } = this.drag;
    const carId = car.id;
    this.drag = null;
    this.board.clearTrack();
    const view = this.views.get(carId);
    view?.setDragging(false);
    if (view) void view.slideTo(this.metrics, startAxisPos, SNAP_DURATION);
  }

  // ---------------------------------------------------------------- помощники

  private occupancyAt(cellX: number, cellY: number): string | null {
    const index = cellY * this.metrics.cols + cellX;
    for (const car of this.cars) {
      for (let i = 0; i < car.length; i += 1) {
        const x = car.orientation === 'h' ? car.x + i : car.x;
        const y = car.orientation === 'h' ? car.y : car.y + i;
        if (y * this.metrics.cols + x === index) return car.id;
      }
    }
    return null;
  }

  private rangeFor(car: Car): SlideRange {
    try {
      const occupancy = buildOccupancy(this.cars, this.metrics.cols, this.metrics.rows);
      return slideRange(car, occupancy, this.metrics.cols, this.metrics.rows);
    } catch {
      const pos = car.orientation === 'h' ? car.x : car.y;
      return { min: pos, max: pos };
    }
  }

  /** Подсветить клетки, по которым может проехать машина. */
  private drawTrack(car: Car, range: SlideRange): void {
    const cells: Array<{ x: number; y: number }> = [];
    for (let pos = range.min; pos <= range.max + car.length - 1; pos += 1) {
      if (pos < range.min + car.length) continue;
      cells.push(car.orientation === 'h' ? { x: pos, y: car.y } : { x: car.x, y: pos });
    }
    for (let pos = range.min; pos < (car.orientation === 'h' ? car.x : car.y); pos += 1) {
      cells.push(car.orientation === 'h' ? { x: pos, y: car.y } : { x: car.x, y: pos });
    }
    this.board.drawTrack(this.metrics, cells, car.target ? 0xffd257 : 0x8fd6ff, 0.18);
  }

  private showHint(carId: string): void {
    this.views.forEach((view, id) => {
      if (id === carId) view.showHint();
      else view.clearHint();
    });
  }

  private playExitAnimation(): void {
    const level = this.levelRef;
    if (!level) return;
    const target = this.cars.find((car) => car.target);
    const view = target ? this.views.get(target.id) : undefined;
    if (!target || !view) {
      bridge.emit('level:cleared', { levelId: level.id, moves: useGameStore.getState().moves.length });
      return;
    }
    this.busy = true;
    this.hintToken = -1;
    this.tweens.killTweensOf(view);
    const metrics = this.metrics;
    const exitY = cellCenterY(metrics, target.y);
    const exitX = metrics.originX + (level.cols + 2.6) * metrics.cell;

    this.tweens.add({
      targets: view,
      x: exitX,
      y: exitY,
      duration: 820,
      ease: 'Cubic.easeIn',
      onStart: () => {
        view.setDepth(70);
        this.emitConfetti(metrics.originX + (level.cols - 0.5) * metrics.cell, exitY);
        audio.win();
      },
      onComplete: () => {
        this.busy = false;
        bridge.emit('level:cleared', {
          levelId: level.id,
          moves: useGameStore.getState().moves.length,
        });
      },
    });
  }

  private emitConfetti(x: number, y: number): void {
    if (!this.textures.exists('spark')) return;
    const colors = [0xffd257, 0xff7a59, 0x7ff0a5, 0x8fd6ff, 0xffffff];
    const emitter = this.add.particles(x, y, 'spark', {
      speed: { min: 80, max: 320 },
      angle: { min: 180, max: 360 },
      gravityY: 420,
      lifespan: 1100,
      quantity: 1,
      scale: { start: 0.9, end: 0.1 },
      alpha: { start: 1, end: 0 },
      tint: colors,
      blendMode: 'NORMAL',
      emitting: false,
    });
    emitter.setDepth(80);
    emitter.explode(46);
    this.time.delayedCall(1400, () => emitter.destroy());
  }

  private handleResize(): void {
    this.resizeTimer?.remove();
    this.resizeTimer = this.time.delayedCall(120, () => this.relayout());
  }

  private relayout(): void {
    if (!this.levelRef || !this.metrics) return;
    const level = this.levelRef;
    this.metrics = computeMetrics(this.scale.width, this.scale.height, level.cols, level.rows);
    this.board.draw({
      level,
      metrics: this.metrics,
      skin: this.parkingSkin,
      seed: hashString(`board:${level.id}`),
    });
    this.views.forEach((view, id) => {
      const car = this.cars.find((item) => item.id === id);
      view.redraw(this.metrics);
      if (car) {
        const axisPos = car.orientation === 'h' ? car.x : car.y;
        view.placeAt(this.metrics, axisPos);
      }
    });
    this.cameras.main.setBackgroundColor(this.parkingSkin.grass);
  }
}
