/**
 * Обёртка Phaser для React.
 *
 * Компонент создаёт игру при монтировании и уничтожает при размонтировании;
 * вся связь со сценой идёт через `bridge` и zustand-хранилище.
 */

import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { bridge } from '@/game/bridge';
import { GameScene } from '@/game/phaser/GameScene';
import { getCarSkin, getParkingSkin } from '@/game/theme/palettes';
import { useProgressStore } from '@/state/progressStore';

export default function GameCanvas(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const parkingSkin = useProgressStore((state) => state.parkingSkin);
  const carSkin = useProgressStore((state) => state.carSkin);

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return undefined;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      backgroundColor: getParkingSkin(useProgressStore.getState().parkingSkin).grass,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.NO_CENTER,
        width: parent.clientWidth,
        height: parent.clientHeight,
      },
      render: {
        antialias: true,
        roundPixels: false,
        powerPreference: 'high-performance',
      },
      input: { activePointers: 2, touch: { capture: true } },
      banner: false,
      audio: { noAudio: true },
      scene: [GameScene],
    });

    const applyTheme = (): void => {
      const state = useProgressStore.getState();
      bridge.emit('theme:update', {
        parking: getParkingSkin(state.parkingSkin),
        cars: getCarSkin(state.carSkin),
      });
    };
    const offReady = bridge.on('scene:ready', applyTheme);

    return () => {
      offReady();
      game.destroy(true);
    };
  }, []);

  // Смена оформления в магазине применяется на лету.
  useEffect(() => {
    bridge.emit('theme:update', {
      parking: getParkingSkin(parkingSkin),
      cars: getCarSkin(carSkin),
    });
  }, [parkingSkin, carSkin]);

  return <div className="game-canvas" ref={containerRef} />;
}
