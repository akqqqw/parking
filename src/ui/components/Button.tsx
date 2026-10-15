import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { audio } from '@/services/audio';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'icon' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  full?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  full,
  children,
  className,
  onClick,
  disabled,
  ...rest
}: ButtonProps): JSX.Element {
  const classes = [
    'btn',
    `btn--${variant}`,
    `btn--${size}`,
    full ? 'btn--full' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classes}
      disabled={disabled}
      onClick={(event) => {
        audio.unlock();
        if (!disabled) audio.click();
        onClick?.(event);
      }}
      {...rest}
    >
      {icon ? <span className="btn__icon">{icon}</span> : null}
      {children ? <span className="btn__label">{children}</span> : null}
    </button>
  );
}
