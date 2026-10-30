import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Tailwind class joiner used by the copied reader chrome. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
