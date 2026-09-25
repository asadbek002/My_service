import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

/**
 * Prepare a form payload for the API: keep only `keys` (the API rejects unknown fields),
 * trim strings and drop empty values, since optional DTO fields validate '' as a real value.
 */
export function clean(input: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    let value = input[key];
    if (typeof value === 'string') value = value.trim();
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  return out;
}
