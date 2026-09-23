// Date arithmetic on ISO yyyy-mm-dd strings. Everything here works on
// calendar days in the phone's local time — the farm does not care about
// time zones, and neither should the maths.

const DAY_MS = 86_400_000;

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, days: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / DAY_MS);
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthStart(monthKeyOrIso: string): string {
  return `${monthKeyOrIso.slice(0, 7)}-01`;
}

export function monthEnd(monthKeyOrIso: string): string {
  const [y, m] = monthKeyOrIso.slice(0, 7).split("-").map(Number);
  return toIso(new Date(y, m, 0));
}

export function daysInMonth(monthKeyOrIso: string): number {
  const [y, m] = monthKeyOrIso.slice(0, 7).split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function addMonths(monthKeyOrIso: string, n: number): string {
  const [y, m] = monthKeyOrIso.slice(0, 7).split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Inclusive list of month keys from a to b. */
export function monthRange(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  let k = fromKey.slice(0, 7);
  const end = toKey.slice(0, 7);
  while (k <= end) {
    out.push(k);
    k = addMonths(k, 1);
  }
  return out;
}

/** Days of overlap between [aStart, aEnd] and [bStart, bEnd], inclusive of both ends. */
export function overlapDays(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const s = aStart > bStart ? aStart : bStart;
  const e = aEnd < bEnd ? aEnd : bEnd;
  if (s > e) return 0;
  return daysBetween(s, e) + 1;
}

export function ageDays(birthIso: string | undefined, onIso: string): number | undefined {
  if (!birthIso) return undefined;
  return daysBetween(birthIso, onIso);
}

/** "3 weeks", "5 months", "1 year 2 months" — for ages on screen. */
export function fmtAge(days: number | undefined): string {
  if (days === undefined || Number.isNaN(days)) return "age unknown";
  if (days < 0) return "not yet born";
  if (days < 14) return `${days} day${days === 1 ? "" : "s"}`;
  if (days < 70) return `${Math.floor(days / 7)} wk`;
  const months = Math.floor(days / 30.44);
  if (months < 24) return `${months} mo`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem ? `${years} yr ${rem} mo` : `${years} yr`;
}
