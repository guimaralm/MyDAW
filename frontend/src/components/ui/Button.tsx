import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'default' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Toggle state — renders as "on" (accented) rather than a plain action. */
  active?: boolean
  children: ReactNode
}

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap ' +
  'transition-colors duration-100 disabled:opacity-35 disabled:pointer-events-none ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1'

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2 text-[11px]',
  md: 'h-8 px-3 text-xs',
}

/**
 * One button with explicit intent, so an action, a toggle and a destructive command never
 * look identical (which is what the old all-grey-pills toolbar did).
 */
export function Button({ variant = 'default', size = 'md', active, className = '', children, ...rest }: ButtonProps) {
  const styles: Record<Variant, string> = {
    primary: 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]',
    default: active
      ? 'bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)]/40'
      : 'bg-[var(--bg-raised)] text-[var(--text-dim)] hover:bg-[var(--bg-raised-hover)] hover:text-[var(--text)]',
    ghost: active
      ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
      : 'text-[var(--text-dim)] hover:bg-[var(--bg-raised)] hover:text-[var(--text)]',
    danger: 'bg-[var(--bg-raised)] text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white',
  }
  return (
    <button
      type="button"
      className={`${BASE} ${SIZES[size]} ${styles[variant]} ${className}`}
      style={{ outlineColor: 'var(--accent)' }}
      {...rest}
    >
      {children}
    </button>
  )
}

/** Thin vertical rule for grouping related controls in a toolbar. */
export function ToolbarDivider() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-[var(--border)]" />
}
