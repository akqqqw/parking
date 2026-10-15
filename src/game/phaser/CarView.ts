/**
 * Визуальное представление одного автомобиля.
 *
 * Внутри — три слоя Graphics (подсветка, тень, кузов), поэтому машину можно
 * подсвечивать, перекрашивать и анимировать, не пересоздавая объекты.
 * Кузов всегда рисуется «носом вправо», вертикальные машины поворачиваются.
 */

import Phaser from 'phaser';
import type { Car } from '../types';
import { shade, type CarColorSkin } from '../theme/palettes';
import { realColor } from './theme';
import { drawCarInto, drawCarShadow } from './drawCar';
import { carPixelPos, type Metrics } from './layout';

export type CarFacing = 'right' | 'left' | 'up' | 'down';

export class CarView extends Phaser.GameObjects.Container {
  readonly car: Car;
  private readonly glowGfx: Phaser.GameObjects.Graphics;
  private readonly shadowGfx: Phaser.GameObjects.Graphics;
  private readonly bodyGfx: Phaser.GameObjects.Graphics;
  private metrics: Metrics;
  private facing: CarFacing;
  private skin: CarColorSkin;
  private dragging = false;
  private pulseTween?: Phaser.Tweens.Tween;

  constructor(
    scene: Phaser.Scene,
    car: Car,
    metrics: Metrics,
    facing: CarFacing,
    skin: CarColorSkin,
  ) {
    super(scene, 0, 0);
    this.car = car;
    this.metrics = metrics;
    this.facing = facing;
    this.skin = skin;

    this.glowGfx = scene.add.graphics();
    this.shadowGfx = scene.add.graphics();
    this.bodyGfx = scene.add.graphics();
    this.add([this.glowGfx, this.shadowGfx, this.bodyGfx]);

    scene.add.existing(this);
    this.redraw(metrics);
    this.placeAt(metrics, car.orientation === 'h' ? car.x : car.y);
  }

  /** Перерисовать геометрию под новый размер клетки. */
  redraw(metrics: Metrics): void {
    this.metrics = metrics;
    const { cell } = metrics;
    const color = realColor(this.skin, this.car.color);

    this.bodyGfx.clear();
    this.bodyGfx.setPosition(0, 0);
    this.bodyGfx.setRotation(0);
    drawCarInto(this.bodyGfx, {
      kind: this.car.kind,
      color,
      length: this.car.length,
      cell,
      target: this.car.target,
    });

    this.shadowGfx.clear();
    drawCarShadow(
      this.shadowGfx,
      { length: this.car.length, cell },
      this.dragging ? { x: 0.16, y: 0.24 } : { x: 0.05, y: 0.09 },
    );

    this.glowGfx.clear();
    const bodyW = this.car.length * cell - cell * 0.12;
    const bodyH = cell - cell * 0.16;
    this.glowGfx.fillStyle(this.car.target ? 0xffd257 : 0xffffff, 0.5);
    this.glowGfx.fillRoundedRect(
      -bodyW / 2 - cell * 0.14,
      -bodyH / 2 - cell * 0.14,
      bodyW + cell * 0.28,
      bodyH + cell * 0.28,
      cell * 0.32,
    );
    this.glowGfx.setVisible(false);

    // Ориентация: вертикальные машины поворачиваем, горизонтальные — «зеркалим»
    // для сохранения направления тени.
    const vertical = this.car.orientation === 'v';
    if (!vertical) {
      this.setRotation(0);
      this.bodyGfx.setScale(this.facing === 'left' ? -1 : 1, 1);
    } else {
      this.setRotation(this.facing === 'up' ? -Math.PI / 2 : Math.PI / 2);
      this.bodyGfx.setScale(1, 1);
    }
    if (!this.dragging) this.setScale(1);
  }

  /**
   * Поставить машину по координате вдоль её оси (может быть дробной во время
   * перетаскивания).
   */
  placeAt(metrics: Metrics, axisPos: number): void {
    const { x, y } = carPixelPos(metrics, this.car, axisPos);
    this.setPosition(x, y);
  }

  /** Плавный переезд к позиции с фиксацией по сетке. */
  slideTo(metrics: Metrics, axisPos: number, duration = 130): Promise<void> {
    const { x: targetX, y: targetY } = carPixelPos(metrics, this.car, axisPos);
    return new Promise((resolve) => {
      if (duration <= 0) {
        this.setPosition(targetX, targetY);
        resolve();
        return;
      }
      this.scene.tweens.add({
        targets: this,
        x: targetX,
        y: targetY,
        duration,
        ease: 'Cubic.easeOut',
        onComplete: () => resolve(),
      });
    });
  }

  setDragging(value: boolean): void {
    this.dragging = value;
    this.setScale(value ? 1.06 : 1);
    this.shadowGfx.clear();
    drawCarShadow(
      this.shadowGfx,
      { length: this.car.length, cell: this.metrics.cell },
      value ? { x: 0.14, y: 0.22 } : { x: 0.05, y: 0.09 },
    );
    this.setDepth(value ? 60 : 20);
    if (value) this.setGlow(this.car.target ? 0xffd257 : 0x8fd6ff, 0.55);
  }

  setHover(value: boolean): void {
    if (this.dragging) return;
    this.setScale(value ? 1.03 : 1);
    if (value) {
      this.setGlow(0xffffff, 0.32);
    } else if (!this.pulseTween) {
      this.glowGfx.setVisible(false);
    }
  }

  /** Показать подсветку подсказки. */
  showHint(color = 0x7ff0a5): void {
    this.setGlow(color, 0.85);
    this.pulseTween?.stop();
    this.glowGfx.setAlpha(1);
    this.pulseTween = this.scene.tweens.add({
      targets: this.glowGfx,
      alpha: { from: 1, to: 0.25 },
      duration: 460,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        this.glowGfx.setVisible(false);
        this.glowGfx.setAlpha(1);
        this.pulseTween = undefined;
      },
    });
  }

  clearHint(): void {
    this.pulseTween?.stop();
    this.pulseTween = undefined;
    this.glowGfx.setVisible(false);
    this.glowGfx.setAlpha(1);
  }

  /** Покачать машину: тупик, ход невозможен. */
  shake(move = 6): void {
    const startX = this.x;
    const startY = this.y;
    const horizontal = this.car.orientation === 'h';
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 220,
      ease: 'Sine.easeInOut',
      onUpdate: (tween) => {
        const progress = tween.getValue() ?? 0;
        const value = Math.sin(progress * Math.PI * 3) * move * (1 - progress);
        this.setPosition(startX + (horizontal ? value : 0), startY + (horizontal ? 0 : value));
      },
      onComplete: () => this.setPosition(startX, startY),
    });
  }

  private setGlow(color: number, alpha: number): void {
    const { cell } = this.metrics;
    const bodyW = this.car.length * cell - cell * 0.12;
    const bodyH = cell - cell * 0.16;
    this.glowGfx.clear();
    this.glowGfx.fillStyle(color, alpha);
    this.glowGfx.fillRoundedRect(
      -bodyW / 2 - cell * 0.14,
      -bodyH / 2 - cell * 0.14,
      bodyW + cell * 0.28,
      bodyH + cell * 0.28,
      cell * 0.32,
    );
    this.glowGfx.setVisible(true);
    this.glowGfx.setAlpha(1);
  }

  /** Цвет кузова с учётом активного набора (для анимаций и эффектов). */
  get bodyColor(): number {
    return realColor(this.skin, this.car.color);
  }

  get accentColor(): number {
    return shade(this.bodyColor, 0.35);
  }
}
