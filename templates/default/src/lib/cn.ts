import { twMerge } from 'tailwind-merge'

/** Merge Tailwind classes, letting later utilities win. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return twMerge(classes.filter((value): value is string => Boolean(value)).join(' '))
}
