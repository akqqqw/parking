/**
 * Задача дня.
 *
 * Каждый день каталог «выдаёт» один уровень: выбор детерминирован от
 * локальной даты, поэтому у всех устройств игрока он совпадает, а сам
 * уровень не нужно нигде хранить. За первое прохождение дня платятся
 * бонусные монеты, серия подряд идущих дней увеличивает награду.
 */

/** Минимальный номер уровня: обучение 1–5 в задачу дня не попадает. */
export const DAILY_FIRST_LEVEL = 6;

/**
 * Верхняя граница пула. Дневная задача должна быть по силам большинству
 * игроков: экспертные уровни (пар 19–24) в неё не попадают, иначе новичок
 * упирается в стену и теряет серию.
 */
export const DAILY_LAST_LEVEL = 50;

/** Базовая награда за задачу дня. */
export const DAILY_BASE_BONUS = 40;

/** Дата в локальном часовом поясе игрока: `YYYY-MM-DD`. */
export function dateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Сдвинуть дату-ключ на `delta` дней (отрицательное — назад). */
export function addDays(key: string, delta: number): string {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  date.setDate(date.getDate() + delta);
  return dateKey(date);
}

/** `previous` — это вчерашний день относительно `today`. */
export function isYesterday(previous: string, today: string): boolean {
  return addDays(previous, 1) === today;
}

/** FNV-1a: короткий стабильный хэш строки. */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Номер уровня для даты. Уровни выдаются вразнобой, но один и тот же день
 * всегда даёт один и тот же уровень; подряд идущие дни не повторяются.
 */
export function dailyLevelId(key: string, levelCount: number): number {
  const last = Math.max(
    DAILY_FIRST_LEVEL,
    Math.min(levelCount, DAILY_LAST_LEVEL),
  );
  const span = last - DAILY_FIRST_LEVEL + 1;
  let index = hashString(`parking-jam:${key}`) % span;
  const previous = hashString(`parking-jam:${addDays(key, -1)}`) % span;
  // Крайне редко хэш соседних дат совпадает — сдвигаем, чтобы не было двух
  // одинаковых задач подряд.
  if (span > 1 && index === previous) index = (index + 1) % span;
  return DAILY_FIRST_LEVEL + index;
}

/** Награда за задачу дня: растёт с серией, но не больше чем в два раза. */
export function dailyReward(streak: number): number {
  const safe = Math.max(1, Math.floor(streak));
  return DAILY_BASE_BONUS + Math.min(safe - 1, 4) * 10;
}
