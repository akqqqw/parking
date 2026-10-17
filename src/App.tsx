import { useEffect } from 'react';
import { HomeScreen } from './ui/screens/HomeScreen';
import { LevelSelectScreen } from './ui/screens/LevelSelectScreen';
import { GameScreen } from './ui/screens/GameScreen';
import { ShopScreen } from './ui/screens/ShopScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { AdminScreen } from './ui/screens/AdminScreen';
import { useUiStore } from './state/uiStore';
import { useProgressStore } from './state/progressStore';
import { audio } from './services/audio';
import { haptics } from './services/haptics';

export function App(): JSX.Element {
  const screen = useUiStore((state) => state.screen);
  const toast = useUiStore((state) => state.toast);
  const soundEnabled = useProgressStore((state) => state.soundEnabled);
  const musicEnabled = useProgressStore((state) => state.musicEnabled);
  const vibrations = useProgressStore((state) => state.vibrations);

  useEffect(() => {
    audio.setEnabled(soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    haptics.setEnabled(vibrations);
  }, [vibrations]);

  // Скрытая админ-панель: адрес `?admin` / `#admin` или Ctrl+Shift+A.
  // Обычным игрокам она не видна и нигде в интерфейсе не упоминается.
  useEffect(() => {
    const openFromUrl = (): void => {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has('admin') || url.hash === '#admin') {
          useUiStore.getState().go('admin');
        }
      } catch {
        /* среда без URL — пропускаем */
      }
    };
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        useUiStore.getState().go('admin');
      }
    };
    openFromUrl();
    window.addEventListener('hashchange', openFromUrl);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('hashchange', openFromUrl);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

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
      {screen === 'admin' ? <AdminScreen /> : null}
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
