/**
 * Декоративная картинка автомобиля для меню и экранов.
 * Рисуется в SVG, чтобы интерфейс не зависел от игровых текстур.
 */

export interface CarIllustrationProps {
  color?: string;
  width?: number;
  height?: number;
  className?: string;
}

export function CarIllustration({
  color = '#e23b3b',
  width = 168,
  height = 84,
  className,
}: CarIllustrationProps): JSX.Element {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 168 84"
      className={className}
      aria-hidden="true"
      style={{ overflow: 'visible' }}
    >
      <ellipse cx="84" cy="72" rx="62" ry="9" fill="rgba(0,0,0,0.28)" />
      <rect x="18" y="30" width="132" height="36" rx="16" fill={color} />
      <rect x="18" y="30" width="132" height="14" rx="10" fill="rgba(255,255,255,0.18)" />
      <path d="M46 30 L60 14 H108 L122 30 Z" fill={color} />
      <path d="M52 28 L62 17 H86 V28 Z" fill="#2b3b52" opacity="0.9" />
      <path d="M92 17 H106 L116 28 H92 Z" fill="#2b3b52" opacity="0.9" />
      <rect x="18" y="52" width="132" height="6" rx="3" fill="rgba(0,0,0,0.22)" />
      <circle cx="50" cy="66" r="13" fill="#1c2027" />
      <circle cx="50" cy="66" r="5.4" fill="#c9d2de" />
      <circle cx="118" cy="66" r="13" fill="#1c2027" />
      <circle cx="118" cy="66" r="5.4" fill="#c9d2de" />
      <rect x="132" y="38" width="16" height="9" rx="4" fill="#fff2c2" />
      <rect x="20" y="38" width="12" height="9" rx="4" fill="#d8453c" />
    </svg>
  );
}
