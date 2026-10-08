import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export type DateDisplayTimezone = 'utc' | 'local';

/**
 * Unambiguous display date: DD/MMM/YYYY (e.g. 09/Jun/2009).
 * Defaults to UTC so day/month are never locale-ambiguous.
 */
export function formatDisplayDate(
  value?: string | Date | null,
  timezone: DateDisplayTimezone = 'utc'
): string | undefined {
  if (value == null || value === '') return undefined;
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;

    const day = timezone === 'utc' ? date.getUTCDate() : date.getDate();
    const month = timezone === 'utc' ? date.getUTCMonth() : date.getMonth();
    const year = timezone === 'utc' ? date.getUTCFullYear() : date.getFullYear();

    const dd = String(day).padStart(2, '0');
    const mmm = MONTH_ABBR[month];
    return `${dd}/${mmm}/${year}`;
  } catch {
    return undefined;
  }
}

/** Short timezone label for UI notes, e.g. "UTC" or "GMT+8". */
export function getTimezoneLabel(timezone: DateDisplayTimezone): string {
  if (timezone === 'utc') return 'UTC';
  try {
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
      .formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value || 'Local';
  } catch {
    return 'Local';
  }
}
