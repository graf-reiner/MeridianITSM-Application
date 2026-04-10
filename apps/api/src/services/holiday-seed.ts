/**
 * Country holiday seed packs (ITIL Gap 8).
 *
 * Each entry is a calendar date the SLA business-hours calculator will skip.
 * `recurring=true` entries match by month-day every year (Christmas, New Year);
 * `recurring=false` entries are one-off (e.g. Thanksgiving 2026 = 2026-11-26).
 *
 * To add another country: define a `Country*Pack` builder, register it in
 * COUNTRY_REGISTRY, and surface the country in listHolidaySeedCountries().
 *
 * Year-dependent dates (Thanksgiving, UK bank holidays, German Easter Monday)
 * default to the current calendar year if no year is supplied.
 */

export interface HolidaySeedEntry {
  date: string; // YYYY-MM-DD
  name: string;
  recurring: boolean;
}

export interface HolidaySeedCountry {
  code: string;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Returns the date of the Nth weekday of a month.
 * Example: nthWeekday(2026, 11, 4, 4) → 4th Thursday of November 2026 (Thanksgiving).
 * weekday: 0=Sun, 1=Mon, ..., 6=Sat. n: 1=first, 2=second, ..., 5=fifth.
 */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekday = first.getUTCDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  return ymd(year, month, day);
}

/**
 * Returns the date of the last given weekday of a month.
 * Example: lastWeekday(2026, 5, 1) → last Monday of May 2026 (US Memorial Day).
 */
function lastWeekday(year: number, month: number, weekday: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = new Date(Date.UTC(year, month - 1, lastDay));
  const lastWd = last.getUTCDay();
  const offset = (lastWd - weekday + 7) % 7;
  return ymd(year, month, lastDay - offset);
}

// ─── Country packs ────────────────────────────────────────────────────────────

function buildUSPack(year: number): HolidaySeedEntry[] {
  return [
    { date: ymd(year, 1, 1), name: "New Year's Day", recurring: true },
    { date: nthWeekday(year, 1, 1, 3), name: 'Martin Luther King Jr. Day', recurring: false },
    { date: nthWeekday(year, 2, 1, 3), name: "Presidents' Day", recurring: false },
    { date: lastWeekday(year, 5, 1), name: 'Memorial Day', recurring: false },
    { date: ymd(year, 6, 19), name: 'Juneteenth', recurring: true },
    { date: ymd(year, 7, 4), name: 'Independence Day', recurring: true },
    { date: nthWeekday(year, 9, 1, 1), name: 'Labor Day', recurring: false },
    { date: nthWeekday(year, 10, 1, 2), name: 'Columbus Day', recurring: false },
    { date: ymd(year, 11, 11), name: 'Veterans Day', recurring: true },
    { date: nthWeekday(year, 11, 4, 4), name: 'Thanksgiving Day', recurring: false },
    { date: ymd(year, 12, 25), name: 'Christmas Day', recurring: true },
  ];
}

function buildUKPack(year: number): HolidaySeedEntry[] {
  return [
    { date: ymd(year, 1, 1), name: "New Year's Day", recurring: true },
    // Easter dates are complex — use static fixed-year list and update yearly.
    // For simplicity we omit Easter-derived holidays and add only the bank holidays
    // that have stable dates or simple weekday rules.
    { date: nthWeekday(year, 5, 1, 1), name: 'Early May Bank Holiday', recurring: false },
    { date: lastWeekday(year, 5, 1), name: 'Spring Bank Holiday', recurring: false },
    { date: lastWeekday(year, 8, 1), name: 'Summer Bank Holiday', recurring: false },
    { date: ymd(year, 12, 25), name: 'Christmas Day', recurring: true },
    { date: ymd(year, 12, 26), name: 'Boxing Day', recurring: true },
  ];
}

function buildDEPack(year: number): HolidaySeedEntry[] {
  return [
    { date: ymd(year, 1, 1), name: 'Neujahr', recurring: true },
    { date: ymd(year, 5, 1), name: 'Tag der Arbeit', recurring: true },
    { date: ymd(year, 10, 3), name: 'Tag der Deutschen Einheit', recurring: true },
    { date: ymd(year, 12, 25), name: '1. Weihnachtstag', recurring: true },
    { date: ymd(year, 12, 26), name: '2. Weihnachtstag', recurring: true },
  ];
}

// ─── Registry ─────────────────────────────────────────────────────────────────

type PackBuilder = (year: number) => HolidaySeedEntry[];

const COUNTRY_REGISTRY: Record<string, { name: string; build: PackBuilder }> = {
  US: { name: 'United States', build: buildUSPack },
  UK: { name: 'United Kingdom', build: buildUKPack },
  DE: { name: 'Germany', build: buildDEPack },
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Lists all available country seed packs the UI can offer.
 */
export function listHolidaySeedCountries(): HolidaySeedCountry[] {
  return Object.entries(COUNTRY_REGISTRY).map(([code, { name }]) => ({ code, name }));
}

/**
 * Returns the holiday seed pack for the given country and year.
 * Falls back to the current calendar year if `year` is omitted or invalid.
 * Returns null if the country is unknown.
 */
export function getHolidaySeed(country: string, year?: number): HolidaySeedEntry[] | null {
  const entry = COUNTRY_REGISTRY[country.toUpperCase()];
  if (!entry) return null;
  const y = typeof year === 'number' && year >= 1900 && year <= 2100 ? year : new Date().getFullYear();
  return entry.build(y);
}
