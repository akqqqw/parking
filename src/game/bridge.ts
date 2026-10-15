/**
 * Мост между React-интерфейсом и игровой сценой Phaser.
 *
 * Лёгкая типизированная шина событий: React отправляет в сцену разовые команды
 * (пауза, оформление), сцена сообщает наружу о готовности и победе. Игровое
 * состояние живёт в zustand-хранилище, к которому сцена подписана напрямую,
 * поэтому Phaser в интерфейсный бандл не попадает.
 */

import type { CarColorSkin, Level, ParkingSkin } from './types-bridge';

export interface BridgeEvents {
  /** Применить оформление парковки и набор цветов машин. */
  'theme:update': { parking: ParkingSkin; cars: CarColorSkin };
  /** Пауза: сцена перестаёт реагировать на ввод. */
  'game:paused': { paused: boolean };
  /** Сцена готова к работе (создана или пересоздана). */
  'scene:ready': { levelId: number | null };
  /** Автомобиль выехал с парковки: анимация завершена. */
  'level:cleared': { levelId: number; moves: number };
  /** Сцена сообщает, что уровень загружен (для отладки и аналитики). */
  'level:loaded': { level: Level };
}

type Handler<T> = (payload: T) => void;

class TypedEmitter {
  private handlers = new Map<string, Set<Handler<unknown>>>();

  on<K extends keyof BridgeEvents>(event: K, handler: Handler<BridgeEvents[K]>): () => void {
    const set = this.handlers.get(event as string) ?? new Set();
    set.add(handler as Handler<unknown>);
    this.handlers.set(event as string, set);
    return () => this.off(event, handler);
  }

  off<K extends keyof BridgeEvents>(event: K, handler: Handler<BridgeEvents[K]>): void {
    this.handlers.get(event as string)?.delete(handler as Handler<unknown>);
  }

  emit<K extends keyof BridgeEvents>(event: K, payload: BridgeEvents[K]): void {
    const set = this.handlers.get(event as string);
    if (!set) return;
    for (const handler of [...set]) (handler as Handler<BridgeEvents[K]>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const bridge = new TypedEmitter();
