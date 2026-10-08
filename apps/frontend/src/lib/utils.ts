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
 * True when the source carries a real clock time (not date-only / midnight).
 * JSON-serialized dates often arrive as T00:00:00.000Z for date-only fields.
 */
function hasAvailableTime(value: string | Date): boolean {
  if (value instanceof Date) {
    return (
      value.getUTCHours() !== 0 ||
      value.getUTCMinutes() !== 0 ||
      value.getUTCSeconds() !== 0 ||
      value.getUTCMilliseconds() !== 0
    );
  }

  const s = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;

  const isoTime = s.match(/T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?/i);
  if (isoTime) {
    const [, hh, mm, ss = '00'] = isoTime;
    const msMatch = s.match(/T\d{2}:\d{2}:\d{2}\.(\d+)/i);
    const hasMs = Boolean(msMatch && Number(msMatch[1]) !== 0);
    return hh !== '00' || mm !== '00' || ss !== '00' || hasMs;
  }

  const spaceTime = s.match(/\s(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (spaceTime) {
    const [, hh, mm, ss = '00'] = spaceTime;
    return hh !== '00' || mm !== '00' || ss !== '00';
  }

  return false;
}

/**
 * Unambiguous display date: DD/MMM/YYYY (e.g. 09/Jun/2009).
 * Appends HH:MM:SS when the source includes a non-midnight time.
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
    const datePart = `${dd}/${mmm}/${year}`;

    if (!hasAvailableTime(value)) return datePart;

    const hours = timezone === 'utc' ? date.getUTCHours() : date.getHours();
    const minutes = timezone === 'utc' ? date.getUTCMinutes() : date.getMinutes();
    const seconds = timezone === 'utc' ? date.getUTCSeconds() : date.getSeconds();
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return `${datePart} ${hh}:${mm}:${ss}`;
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

/**
 * Wall-clock timestamps (Cached, Last updated, share expiry).
 * Always includes HH:MM:SS and a timezone label so UTC ↔ Local toggles are obvious.
 */
export function formatTimestamp(
  value?: string | Date | number | null,
  timezone: DateDisplayTimezone = 'utc'
): string | undefined {
  if (value == null || value === '') return undefined;
  try {
    let date: Date;
    if (typeof value === 'number') {
      date = new Date(value);
    } else if (value instanceof Date) {
      date = value;
    } else {
      date = new Date(value);
    }
    if (Number.isNaN(date.getTime())) return undefined;

    const day = timezone === 'utc' ? date.getUTCDate() : date.getDate();
    const month = timezone === 'utc' ? date.getUTCMonth() : date.getMonth();
    const year = timezone === 'utc' ? date.getUTCFullYear() : date.getFullYear();
    const hours = timezone === 'utc' ? date.getUTCHours() : date.getHours();
    const minutes = timezone === 'utc' ? date.getUTCMinutes() : date.getMinutes();
    const seconds = timezone === 'utc' ? date.getUTCSeconds() : date.getSeconds();

    const dd = String(day).padStart(2, '0');
    const mmm = MONTH_ABBR[month];
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return `${dd}/${mmm}/${year} ${hh}:${mm}:${ss} ${getTimezoneLabel(timezone)}`;
  } catch {
    return undefined;
  }
}
