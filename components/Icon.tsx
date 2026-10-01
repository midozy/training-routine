import type { ReactNode } from 'react';

/** One consistent SVG icon set (replaces unicode glyphs, which render differently across iOS versions). */
const P = {
  play: <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />,
  bolt: <path d="M13.5 2 5 13.5h6L10 22l9-12h-6z" fill="currentColor" stroke="none" />,
  swap: <path d="M7 7h12M15 3l4 4-4 4M17 17H5M9 13l-4 4 4 4" />,
  undo: <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  down: <path d="M12 5v14M6 13l6 6 6-6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.01" /></>,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  'arrows-h': <path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof P;

export default function Icon({ name, size = 16, strokeWidth = 2.2, className }: { name: IconName; size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
      {P[name]}
    </svg>
  );
}
