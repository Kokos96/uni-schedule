import { WeekParity } from '../types';

export const DEFAULT_SEMESTER_START_DATE = '2026-09-01';

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MS_PER_DAY = 86_400_000;

export const DAY_NAMES_UA_FULL: Record<number, string> = {
  1: 'Понеділок',
  2: 'Вівторок',
  3: 'Середа',
  4: 'Четвер',
  5: "П'ятниця",
  6: 'Субота',
  7: 'Неділя',
};

export const DAY_NAMES_UA_SHORT: Record<number, string> = {
  1: 'Пн',
  2: 'Вт',
  3: 'Ср',
  4: 'Чт',
  5: 'Пт',
  6: 'Сб',
  7: 'Нд',
};

export const MONTH_NAMES_UA = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
] as const;

export const MONTH_NAMES_UA_GENITIVE = [
  'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
  'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня',
] as const;

/** Format a Date as "YYYY-MM-DD" in local calendar time. */
export function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a "YYYY-MM-DD" string into a local-midnight Date.
 * Returns null if the string is malformed or represents an impossible calendar date.
 */
export function parseIsoDate(iso: string): Date | null {
  const match = ISO_DATE_RE.exec(iso.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

/** Check whether a string is a valid calendar "YYYY-MM-DD" date. */
export function isValidIsoDate(iso: string): boolean {
  return parseIsoDate(iso) !== null;
}

/** Check whether a string is a valid "HH:mm" 24-hour time. */
export function isValidTimeString(hhmm: string): boolean {
  return TIME_HHMM_RE.test(hhmm.trim());
}

/** Check whether two Dates fall on the same local calendar day. */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Return a new Date shifted by `days` local calendar days. */
export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  next.setDate(next.getDate() + days);
  return next;
}

/** Return the Monday (00:00:00 local) of the ISO week containing `date`. */
export function startOfWeek(date: Date): Date {
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return addDays(date, diffToMonday);
}

/** Return Mon–Fri (5 days) or Mon–Sun (7 days) for the week containing `anchor`. */
export function getWeekDates(anchor: Date, includeWeekends = false): Date[] {
  const monday = startOfWeek(anchor);
  const count = includeWeekends ? 7 : 5;
  return Array.from({ length: count }, (_, offset) => addDays(monday, offset));
}

/** Convert Date.getDay() (0=Sun..6=Sat) into schedule dayNumber (1=Mon..7=Sun). */
export function getScheduleDayNumber(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

/**
 * Determine week parity ('numerator' | 'denominator') relative to `semesterStartDate`.
 * Uses UTC day timestamps of each week's Monday to stay immune to DST transitions.
 */
export function getWeekParity(
  date: Date,
  semesterStartDate: string = DEFAULT_SEMESTER_START_DATE
): WeekParity {
  const startDate =
    parseIsoDate(semesterStartDate) ??
    parseIsoDate(DEFAULT_SEMESTER_START_DATE)!;

  const dateMonday = startOfWeek(date);
  const startMonday = startOfWeek(startDate);

  const dateUtc = Date.UTC(
    dateMonday.getFullYear(),
    dateMonday.getMonth(),
    dateMonday.getDate()
  );
  const startUtc = Date.UTC(
    startMonday.getFullYear(),
    startMonday.getMonth(),
    startMonday.getDate()
  );

  const diffWeeks = Math.floor((dateUtc - startUtc) / (7 * MS_PER_DAY));
  const normalizedMod = ((diffWeeks % 2) + 2) % 2;
  return normalizedMod === 0 ? 'numerator' : 'denominator';
}

/** Return the Monday "YYYY-MM-DD" ISO date for a given "YYYY-MM-DD" date string. */
export function getWeekStartIso(isoDate: string): string | null {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return null;
  return formatIsoDate(startOfWeek(parsed));
}

/** Format "YYYY-MM-DD" as compact "DD.MM" for Ukrainian labels and charts. */
export function formatShortDateUa(isoDate: string): string {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return isoDate;
  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}`;
}

/** Format a Date as "YYYY-MM" in local calendar time. */
export function formatYearMonth(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/** Convert "HH:mm" to total minutes since midnight. */
export function timeStringToMinutes(hhmm: string): number {
  const parts = hhmm.split(':');
  const hours = Number(parts[0] ?? 0);
  const minutes = Number(parts[1] ?? 0);
  return hours * 60 + minutes;
}

/** Convert "HH:mm" to total seconds since midnight. */
export function timeStringToSeconds(hhmm: string): number {
  return timeStringToMinutes(hhmm) * 60;
}
