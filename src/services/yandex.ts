/**
 * Адаптер Yandex Games SDK.
 *
 * Сам SDK сейчас НЕ подключён: в `index.html` нет внешнего скрипта, в проекте
 * нет зависимости. Здесь описана единственная точка интеграции — когда игра
 * поедет на платформу, достаточно добавить в `index.html`
 * `<script src="https://yandex.ru/games/sdk/v2"></script>` и вызвать
 * `initYandexSdk()` при старте: код сам увидит `window.YaGames` и включит
 * облачные сохранения, Rewarded Video и лидерборды.
 *
 * Пока SDK нет, все функции работают как пустышки: игра не падает, локальные
 * сохранения, обычные подсказки и прогресс продолжают работать в полном объёме.
 */

/** Ключ лидерборда в консоли разработчика Яндекс Игр. */
export const LEADERBOARD_STARS = 'totalStars';
/** Ключ облачного сохранения. */
export const CLOUD_SAVE_KEY = 'progress';

interface DataLike {
  getData(keys?: string[]): Promise<Record<string, unknown>>;
  setData(data: Record<string, unknown>, flush?: boolean): Promise<void>;
}

interface LeaderboardsLike {
  setLeaderboardScore(name: string, score: number): Promise<void>;
}

interface RewardedLike {
  showRewardedVideo(callbacks: {
    onOpen?: () => void;
    onRewarded?: () => void;
    onClose?: () => void;
    onError?: (error: unknown) => void;
  }): void;
}

interface PlayerLike extends DataLike {
  getMode?(): string;
  getUniqueID?(): string;
  setLeaderboardScore?(name: string, score: number): Promise<void>;
  getLeaderboards?(): Promise<LeaderboardsLike>;
}

interface YaGamesLike {
  getPlayer(options?: { scopes?: boolean; signed?: boolean }): Promise<PlayerLike>;
  getLeaderboards?(): Promise<LeaderboardsLike>;
  adv?: { showRewardedVideo?: RewardedLike['showRewardedVideo'] };
  screen?: { fullscreen?: { request?(): Promise<void> } };
  features?: Record<string, unknown>;
}

interface YandexWindow {
  YaGames?: { init(options?: unknown): Promise<YaGamesLike> };
}

let yaGames: YaGamesLike | null = null;
let player: PlayerLike | null = null;
let initPromise: Promise<boolean> | null = null;

/** Доступен ли SDK на странице (проверяется без инициализации). */
export function yandexSdkPresent(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as unknown as YandexWindow).YaGames);
}

/** SDK проинициализирован и игрок получен. */
export function yandexReady(): boolean {
  return yaGames !== null;
}

/**
 * Инициализация SDK. Безопасно вызывать всегда: если SDK нет — вернёт `false`
 * и ничего не сделает (игра останется полностью локальной).
 */
export function initYandexSdk(): Promise<boolean> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const win = typeof window === 'undefined' ? undefined : (window as unknown as YandexWindow);
    if (!win?.YaGames) return false;
    try {
      yaGames = await win.YaGames.init({ adv: { onAdvClose: () => undefined } });
      try {
        player = await yaGames.getPlayer({ scopes: false, signed: false });
      } catch {
        player = null;
      }
      return true;
    } catch (error) {
      console.warn('Не удалось инициализировать Yandex Games SDK', error);
      yaGames = null;
      return false;
    }
  })();
  return initPromise;
}

/** Чтение облачного сохранения (undefined — если облако недоступно). */
export async function cloudLoad(): Promise<unknown | undefined> {
  if (!player) return undefined;
  try {
    const data = await player.getData([CLOUD_SAVE_KEY]);
    return data?.[CLOUD_SAVE_KEY];
  } catch (error) {
    console.warn('Облачное сохранение недоступно', error);
    return undefined;
  }
}

/** Запись облачного сохранения: молча ничего не делает без SDK. */
export async function cloudSave(snapshot: unknown): Promise<void> {
  if (!player) return;
  try {
    await player.setData({ [CLOUD_SAVE_KEY]: snapshot }, true);
  } catch (error) {
    console.warn('Не удалось сохранить в облако', error);
  }
}

/** Отправка результата в лидерборд (например, суммарных звёзд). */
export async function submitLeaderboardScore(score: number): Promise<void> {
  if (!yaGames) return;
  try {
    const boards = await yaGames.getLeaderboards?.();
    if (boards?.setLeaderboardScore) {
      await boards.setLeaderboardScore(LEADERBOARD_STARS, score);
      return;
    }
    if (player?.setLeaderboardScore) {
      await player.setLeaderboardScore(LEADERBOARD_STARS, score);
    }
  } catch (error) {
    console.warn('Лидерборд недоступен', error);
  }
}

/** Можно ли показать Rewarded Video прямо сейчас. */
export function rewardedAvailable(): boolean {
  return Boolean(yaGames?.adv?.showRewardedVideo);
}

/**
 * Показать Rewarded Video. Возвращает `true`, если награду нужно выдать.
 * Без SDK возвращает `false` — вызывающий код тогда предложит обычный путь.
 */
export function showRewardedVideo(): Promise<boolean> {
  const show = yaGames?.adv?.showRewardedVideo;
  if (!show) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    let rewarded = false;
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      resolve(rewarded);
    };
    try {
      show({
        onRewarded: () => {
          rewarded = true;
        },
        onClose: finish,
        onError: finish,
      });
      // Страховка: платформа может не вызвать onClose.
      setTimeout(finish, 60_000);
    } catch (error) {
      console.warn('Реклама недоступна', error);
      finish();
    }
  });
}
