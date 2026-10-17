/** Навигация и диалоги интерфейса. */

import { create } from 'zustand';
import { getLevel } from '@/game/levels/catalog';
import { useGameStore } from './gameStore';

export type Screen = 'menu' | 'levels' | 'game' | 'shop' | 'settings' | 'admin';
export type Dialog = 'win' | 'pause' | 'hint-shop' | 'none';

export interface WinResult {
  levelId: number;
  moves: number;
  par: number;
  stars: number;
  coins: number;
  isNew: boolean;
  bestMoves: number;
}

export interface UiState {
  screen: Screen;
  dialog: Dialog;
  winResult: WinResult | null;
  toast: string | null;
  /** Открыть уровень и перейти на игровой экран. */
  openLevel: (levelId: number) => void;
  startNextLevel: () => void;
  replayLevel: () => void;
  go: (screen: Screen) => void;
  openDialog: (dialog: Dialog) => void;
  closeDialog: () => void;
  setWinResult: (result: WinResult) => void;
  showToast: (text: string) => void;
  hideToast: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useUiStore = create<UiState>((set, get) => ({
  screen: 'menu',
  dialog: 'none',
  winResult: null,
  toast: null,

  openLevel: (levelId) => {
    const level = getLevel(levelId);
    if (!level) return;
    useGameStore.getState().startLevel(level);
    set({ screen: 'game', dialog: 'none', winResult: null });
  },

  startNextLevel: () => {
    const current = useGameStore.getState().level?.id ?? 1;
    const next = getLevel(current + 1);
    if (!next) {
      set({ dialog: 'none' });
      get().go('levels');
      return;
    }
    get().openLevel(next.id);
  },

  replayLevel: () => {
    const current = useGameStore.getState().level?.id ?? 1;
    get().openLevel(current);
  },

  go: (screen) => set({ screen, dialog: 'none' }),

  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: 'none' }),
  setWinResult: (result) => set({ winResult: result, dialog: 'win' }),

  showToast: (text) => {
    set({ toast: text });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 2200);
  },
  hideToast: () => set({ toast: null }),
}));
