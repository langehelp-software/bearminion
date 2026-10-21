import type { StepItem } from './definition'

/** 24px, stroke 1.8, round caps and joins. */
export const stepIconPaths: Record<StepItem['icon'], string> = {
  terminal: 'M4 5h16v14H4zM8 10l2.5 2L8 14M12.5 14H16',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  git: 'M6 3v12M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9c0 5-6 4-12 6',
  check: 'M5 12.5l4.5 4.5L19 7',
  bolt: 'M13 3L5 13.5h6L10 21l8-10.5h-6z',
  cursor: 'M5 4l5.5 15 2.2-6.3L19 10.5zM13 13l5 5',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  database: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
}

/**
 * Columns for the step grid, by item count. A row never leaves an orphan: the count drops to the widest divisor that
 * fits, with about 15.5rem per column (4 items: 4, then 2 × 2, then 1; 3 items: 3, then 1).
 */
export const stepColumns: Record<number, string> = {
  2: '@min-[34rem]:grid-cols-2',
  3: '@min-[49.5rem]:grid-cols-3',
  4: '@min-[34rem]:grid-cols-2 @min-[65rem]:grid-cols-4',
  5: '@min-[80.5rem]:grid-cols-5',
  6: '@min-[34rem]:grid-cols-2 @min-[49.5rem]:grid-cols-3 @min-[96rem]:grid-cols-6',
}
