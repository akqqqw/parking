import { useEffect } from 'react';
import { HomeScreen } from './ui/screens/HomeScreen';
import { LevelSelectScreen } from './ui/screens/LevelSelectScreen';
import { GameScreen } from './ui/screens/GameScreen';
import { ShopScreen } from './ui/screens/ShopScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { useUiStore } from './state/uiStore';
import { useProgressStore } from './state/progressStore';
import { audio } from './services/audio';

export function App(): JSX.Element {
  const screen = useUiStore((state) => state.screen);
  const toast = useUiStore((state) => state.toast);
  const soundEnabled = useProgressStore((state) => state.soundEnabled);
  const musicEnabled = useProgressStore((state) => state.musicEnabled);

  useEffect(() => {
    audio.setEnabled(soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    // Музыка звучит в меню и магазине, но выключается на время уровня.
    audio.setMusicEnabled(musicEnabled && screen !== 'game');
  }, [musicEnabled, screen]);

  return (
    <div className="app">
      {screen === 'menu' ? <HomeScreen /> : null}
      {screen === 'levels' ? <LevelSelectScreen /> : null}
      {screen === 'game' ? <GameScreen /> : null}
      {screen === 'shop' ? <ShopScreen /> : null}
      {screen === 'settings' ? <SettingsScreen /> : null}
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
