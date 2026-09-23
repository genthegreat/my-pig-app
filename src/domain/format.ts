// Kwacha, always. K1,234 — no decimals except per-kg prices and feed costs,
// which take two. Weights to one decimal; carcass weights keep their two.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function group(n: string): string {
  return n.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Whole kwacha: K1,234. Negative values keep the sign: -K1,234. */
export function fmtK(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}K${group(Math.round(Math.abs(n)).toString())}`;
}

/** Per-kg prices and feed costs: K6.55. */
export function fmtK2(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const [whole, frac] = Math.abs(n).toFixed(2).split(".");
  return `${sign}K${group(whole)}.${frac}`;
}

export function fmtKg(n: number | undefined | null, decimals = 1): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return `${fmtNum(n, decimals)} kg`;
}

export function fmtNum(n: number | undefined | null, decimals = 0): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  const [whole, frac] = Math.abs(n).toFixed(decimals).split(".");
  return `${n < 0 ? "-" : ""}${group(whole)}${frac ? "." + frac : ""}`;
}

export function fmtPct(n: number | undefined | null, decimals = 1): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return `${n.toFixed(decimals)}%`;
}

/** ISO yyyy-mm-dd → "8 Nov 2025". */
export function fmtDate(iso: string | undefined | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "yyyy-mm" or ISO date → "Nov 2025". */
export function fmtMonth(isoOrMonth: string | undefined | null): string {
  if (!isoOrMonth) return "—";
  const [y, m] = isoOrMonth.slice(0, 7).split("-").map(Number);
  if (!y || !m) return isoOrMonth;
  return `${MONTHS[m - 1]} ${y}`;
}

/** Short form for tight cells: "8 Nov". */
export function fmtDayMonth(iso: string | undefined | null): string {
  if (!iso) return "—";
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!m || !d) return iso;
  return `${d} ${MONTHS[m - 1]}`;
}

export function fmtDays(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  const r = Math.round(n);
  return `${r} day${r === 1 ? "" : "s"}`;
}

export function plural(n: number, one: string, many = one + "s"): string {
  return `${fmtNum(n)} ${n === 1 ? one : many}`;
}

export const MONTH_NAMES = MONTHS;
