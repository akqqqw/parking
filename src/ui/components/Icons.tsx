/** Векторные иконки интерфейса (без эмодзи и внешних ассетов). */

export interface IconProps {
  size?: number;
  className?: string;
}

export function PlayIcon({ size = 22, className }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
    </svg>
  );
}

export function CoinsIcon({ size = 20, className }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="9" cy="12" r="6.4" fill="#f0b429" stroke="#b97f12" strokeWidth="1.2" />
      <circle cx="9" cy="12" r="3.4" fill="#ffd964" />
      <circle cx="15.6" cy="9.6" r="5.2" fill="#ffd964" stroke="#b97f12" strokeWidth="1.2" />
      <text x="15.6" y="12.6" textAnchor="middle" fontSize="7" fontWeight="700" fill="#b97f12">
        ₽
      </text>
    </svg>
  );
}

export function StarIcon({ size = 20, filled = true, className }: IconProps & { filled?: boolean }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45 6.2 20.5l1.1-6.45L2.6 9.45l6.5-.95z"
        fill={filled ? '#ffd257' : 'rgba(255,255,255,0.16)'}
        stroke={filled ? '#c9931f' : 'rgba(255,255,255,0.24)'}
        strokeWidth="1"
      />
    </svg>
  );
}

export function BulbIcon({ size = 22, className }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 2.8a6.2 6.2 0 00-3.6 11.25c.5.35.8.9.8 1.5v.6h5.6v-.6c0-.6.3-1.15.8-1.5A6.2 6.2 0 0012 2.8z"
        fill="currentColor"
      />
      <rect x="9.2" y="17.1" width="5.6" height="1.7" rx="0.8" fill="currentColor" />
      <rect x="9.9" y="19.6" width="4.2" height="1.5" rx="0.7" fill="currentColor" />
    </svg>
  );
}

export function UndoIcon({ size = 22, className }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M9.5 7H14a5 5 0 010 10H8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path d="M11.5 3.6L7.2 7l4.3 3.4z" fill="currentColor" />
    </svg>
  );
}

export function RestartIcon({ size = 22, className }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M20 12a8 8 0 11-2.6-5.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path d="M20.4 3.4v5.2h-5.2z" fill="currentColor" />
    </svg>
  );
}

export function PauseIcon({ size = 22, className }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="6" y="4.5" width="4.2" height="15" rx="1.4" fill="currentColor" />
      <rect x="13.8" y="4.5" width="4.2" height="15" rx="1.4" fill="currentColor" />
    </svg>
  );
}

export function SettingsIcon({ size = 22, className }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 8.6a3.4 3.4 0 100 6.8 3.4 3.4 0 000-6.8zm9 3.4l-1.9-1.1c.05-.4.05-.8 0-1.2L21 8.6l-1.7-2.9-2.1.7c-.3-.25-.65-.45-1-.6L15.6 3h-3.3L11.7 5.8c-.35.15-.7.35-1 .6l-2.1-.7L6.9 8.6l1.9 1.1c-.05.4-.05.8 0 1.2L6.9 12l1.7 2.9 2.1-.7c.3.25.65.45 1 .6l.6 2.8h3.3l.6-2.8c.35-.15.7-.35 1-.6l2.1.7 1.7-2.9z"
        fill="currentColor"
        opacity="0.92"
      />
    </svg>
  );
}

export function CartIcon({ size = 22, className }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M3 4.5h2.2l2.4 9.8h10.2l2.2-7H6.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx="9.4" cy="18.6" r="1.8" fill="currentColor" />
      <circle cx="17.4" cy="18.6" r="1.8" fill="currentColor" />
    </svg>
  );
}

export function BackIcon({ size = 22, className }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M14.5 5l-7 7 7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LockIcon({ size = 18, className }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="5.4" y="10.4" width="13.2" height="9.6" rx="2.2" fill="currentColor" />
      <path
        d="M8.6 10.2V8.2a3.4 3.4 0 016.8 0v2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
