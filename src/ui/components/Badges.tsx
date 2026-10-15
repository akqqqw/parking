import { CoinsIcon, StarIcon } from './Icons';

export function CoinBadge({ value, size = 20 }: { value: number; size?: number }): JSX.Element {
  return (
    <span className="coin-badge">
      <CoinsIcon size={size} />
      <span className="coin-badge__value">{value.toLocaleString('ru-RU')}</span>
    </span>
  );
}

export function StarsRow({
  count,
  total = 3,
  size = 22,
}: {
  count: number;
  total?: number;
  size?: number;
}): JSX.Element {
  return (
    <span className="stars-row" aria-label={`${count} из ${total} звёзд`}>
      {Array.from({ length: total }, (_, index) => (
        <StarIcon key={index} size={size} filled={index < count} />
      ))}
    </span>
  );
}
