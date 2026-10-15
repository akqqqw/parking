/**
 * Отрисовка самой парковки: газон, бордюры, асфальт, разметка, выезд и декор.
 *
 * Всё рисуется кодом в Graphics — статичный слой перерисовывается только при
 * изменении размеров сцены или смене оформления.
 */

import Phaser from 'phaser';
import type { Level } from '../types';
import type { Metrics } from './layout';
import { pointToCell } from './layout';
import { mulberry32 } from '../rng';
import { shade, type ParkingSkin } from '../theme/palettes';

export interface BoardRendererOptions {
  level: Level;
  metrics: Metrics;
  skin: ParkingSkin;
  seed: number;
}

/** Слой статичной графики парковки. */
export class BoardRenderer {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly decor: Phaser.GameObjects.Graphics;
  private readonly track: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(0);
    this.decor = scene.add.graphics().setDepth(1);
    this.track = scene.add.graphics().setDepth(2);
  }

  draw(options: BoardRendererOptions): void {
    const { level, metrics, skin, seed } = options;
    const g = this.graphics;
    const random = mulberry32(seed);
    g.clear();
    this.decor.clear();

    const boardX = metrics.originX;
    const boardY = metrics.originY;
    const boardW = level.cols * metrics.cell;
    const boardH = level.rows * metrics.cell;
    const { cell } = metrics;
    const margin = metrics.margin;

    // --- Газон ---
    g.fillStyle(skin.grass, 1);
    g.fillRect(0, 0, metrics.viewW, metrics.viewH);
    // Тёмные «проплешины» для живости фона.
    const patchCount = Math.round((metrics.viewW * metrics.viewH) / (cell * cell * 26));
    g.fillStyle(skin.grassDark, 0.45);
    for (let i = 0; i < patchCount; i += 1) {
      const px = random() * metrics.viewW;
      const py = random() * metrics.viewH;
      const rx = cell * (0.6 + random() * 1.4);
      const ry = rx * (0.5 + random() * 0.4);
      g.fillEllipse(px, py, rx * 2, ry * 2);
    }

    // --- Площадка ---
    const frameX = boardX - margin;
    const frameY = boardY - margin;
    const frameW = boardW + margin * 2 + metrics.exitLane;
    const frameH = boardH + margin * 2;

    // Тень площадки.
    g.fillStyle(0x0d1218, 0.22);
    g.fillRoundedRect(frameX + 3, frameY + 5, frameW, frameH, cell * 0.4);
    // Бордюр.
    g.fillStyle(skin.curb, 1);
    g.fillRoundedRect(frameX, frameY, frameW, frameH, cell * 0.4);
    g.fillStyle(skin.curbDark, 0.65);
    g.fillRoundedRect(frameX, frameY + frameH - margin * 0.5, frameW, margin * 0.5, cell * 0.3);
    // Асфальт.
    g.fillStyle(skin.asphalt, 1);
    g.fillRoundedRect(boardX, boardY, boardW, boardH, cell * 0.16);
    // Полоса выезда справа.
    g.fillStyle(skin.asphaltShade, 1);
    g.fillRoundedRect(
      boardX + boardW,
      boardY,
      metrics.exitLane,
      boardH,
      { tl: 0, bl: 0, tr: cell * 0.16, br: cell * 0.16 },
    );

    // --- Разметка парковочных мест ---
    const lineW = Math.max(2, cell * 0.05);
    g.lineStyle(lineW, skin.line, 0.42);
    for (let x = 1; x < level.cols; x += 1) {
      g.beginPath();
      g.moveTo(boardX + x * cell, boardY + cell * 0.12);
      g.lineTo(boardX + x * cell, boardY + boardH - cell * 0.12);
      g.strokePath();
    }
    for (let y = 1; y < level.rows; y += 1) {
      g.beginPath();
      g.moveTo(boardX + cell * 0.12, boardY + y * cell);
      g.lineTo(boardX + boardW - cell * 0.12, boardY + y * cell);
      g.strokePath();
    }
    // Метки «мест» по краям: короткие штрихи поперёк.
    g.lineStyle(lineW * 1.4, skin.line, 0.6);
    for (let y = 0; y < level.rows; y += 1) {
      g.beginPath();
      g.moveTo(boardX, boardY + y * cell + cell * 0.08);
      g.lineTo(boardX + cell * 0.28, boardY + y * cell + cell * 0.08);
      g.strokePath();
    }

    // --- Выезд ---
    const exitY = boardY + level.exitRow * cell;
    const gateX = boardX + boardW;
    // Проём в бордюре.
    g.fillStyle(skin.asphaltShade, 1);
    g.fillRect(gateX - cell * 0.02, exitY + cell * 0.06, margin + metrics.exitLane * 0.9, cell * 0.88);
    // Стрелки на полосе выезда.
    g.fillStyle(skin.arrow, 0.92);
    for (let i = 0; i < 3; i += 1) {
      const arrowX = gateX + cell * 0.35 + i * cell * 0.52;
      const arrowH = cell * 0.34;
      const arrowW = cell * 0.26;
      g.fillTriangle(
        arrowX + arrowW,
        exitY + cell / 2,
        arrowX,
        exitY + cell / 2 - arrowH,
        arrowX,
        exitY + cell / 2 + arrowH,
      );
    }
    // Полосы «зебры» по краям проёма.
    g.fillStyle(skin.line, 0.85);
    g.fillRoundedRect(gateX, exitY + cell * 0.02, cell * 0.12, cell * 0.12, 2);
    g.fillRoundedRect(gateX, exitY + cell * 0.86, cell * 0.12, cell * 0.12, 2);

    // --- Декор ---
    const d = this.decor;
    // Деревья на газоне слева и сверху.
    const treeSpots = 5;
    for (let i = 0; i < treeSpots; i += 1) {
      const side = random();
      const r = cell * (0.24 + random() * 0.16);
      let tx: number;
      let ty: number;
      if (side < 0.45) {
        tx = frameX - margin * 0.35 - random() * cell * 0.35;
        ty = frameY + cell * (0.5 + random() * (level.rows - 1));
      } else if (side < 0.8) {
        tx = frameX + cell * (0.6 + random() * (level.cols - 1));
        ty = frameY - margin * 0.35 - random() * cell * 0.3;
      } else {
        tx = frameX + cell * (0.6 + random() * (level.cols - 1));
        ty = frameY + frameH + margin * 0.35 + random() * cell * 0.3;
      }
      d.fillStyle(0x2f6b34, 0.35);
      d.fillEllipse(tx + r * 0.3, ty + r * 0.45, r * 2.2, r * 1.4);
      d.fillStyle(shade(skin.grassDark, -0.12), 0.95);
      d.fillCircle(tx, ty, r);
      d.fillStyle(shade(skin.grass, 0.12), 0.9);
      d.fillCircle(tx - r * 0.22, ty - r * 0.24, r * 0.62);
    }
    // Дорожные конусы у въезда.
    const coneY = frameY + frameH - cell * 0.9;
    const coneX = frameX + cell * 0.5;
    d.fillStyle(0xff7b3d, 1);
    d.fillTriangle(coneX, coneY - cell * 0.3, coneX - cell * 0.16, coneY + cell * 0.16, coneX + cell * 0.16, coneY + cell * 0.16);
    d.fillStyle(0xf4f6f9, 0.95);
    d.fillRect(coneX - cell * 0.1, coneY - cell * 0.02, cell * 0.2, cell * 0.06);
  }

  /** Подсветить клетки, по которым может проехать выбранная машина. */
  drawTrack(
    metrics: Metrics,
    cells: Array<{ x: number; y: number }>,
    color: number,
    alpha = 0.22,
  ): void {
    const g = this.track;
    g.clear();
    g.fillStyle(color, alpha);
    for (const cell of cells) {
      g.fillRoundedRect(
        metrics.originX + cell.x * metrics.cell + metrics.cell * 0.08,
        metrics.originY + cell.y * metrics.cell + metrics.cell * 0.08,
        metrics.cell * 0.84,
        metrics.cell * 0.84,
        metrics.cell * 0.18,
      );
    }
  }

  clearTrack(): void {
    this.track.clear();
  }

  /** Клетка парковки по координатам сцены (для обработки ввода). */
  cellAt(metrics: Metrics, px: number, py: number): { x: number; y: number } {
    return pointToCell(metrics, px, py);
  }

  destroy(): void {
    this.graphics.destroy();
    this.decor.destroy();
    this.track.destroy();
  }
}
