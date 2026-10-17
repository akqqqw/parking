/**
 * Тактильная отдача.
 *
 * Работает только там, где браузер поддерживает `navigator.vibrate`
 * (Android, некоторые планшеты). На iOS API нет — вызовы просто ничего не
 * делают. Пользователь может выключить вибрацию в настройках, поэтому сервис
 * хранит собственный флаг и не обращается к `progressStore` напрямую.
 */

type Pattern = 'snap' | 'blocked' | 'win' | 'tap';

const PATTERNS: Record<Pattern, number | number[]> = {
  tap: 8,
  snap: 14,
  blocked: [18, 40, 18],
  win: [24, 60, 24, 60, 48],
};

class HapticsService {
  private enabled = true;

  setEnabled(value: boolean): void {
    this.enabled = value;
    if (!value) this.cancel();
  }

  cancel(): void {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(0);
  }

  play(pattern: Pattern): void {
    if (!this.enabled) return;
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
    try {
      navigator.vibrate(PATTERNS[pattern]);
    } catch {
      // Некоторые встроенные браузеры бросают исключение — вибрация не критична.
    }
  }
}

export const haptics = new HapticsService();
