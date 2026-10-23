// Reading a weigh-in typed as a phone note:
//
//   Weights 17 October
//
//   Born 24/08:
//   13,24,12,22,23,20,16,19,13,16,16
//
//   Born 31/07:
//   40,40,40,35,36,36,39,36,36,27,24
//
// A heading followed by numbers is a group of pen weights; a heading with no
// numbers under it that carries a date is the day of the weighing. Dates are
// day first (24/08 is 24 August). Anything that is not a weight is handed
// back as unread rather than dropped, so nothing disappears without notice.

import type { Animal } from "@/db/schema";
import { toIso } from "./dates";

// No pig on this farm weighs more; a bigger number is a typing slip.
export const MAX_PLAUSIBLE_KG = 400;

export interface WeighTextGroup {
  heading: string;
  bornOn?: string; // a date in the heading, e.g. "Born 24/08"
  weights: number[];
  unread: string[]; // tokens in the number lines that are not weights
}

export interface WeighText {
  date?: string; // the day of the weighing, when the note names one
  groups: WeighTextGroup[];
  unread: string[]; // lines that are neither a heading nor numbers
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DAY_MONTH = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\.?(?:,?\\s+(\\d{4}))?\\b`, "i");
const MONTH_DAY = new RegExp(`\\b${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "i");
const NUMERIC = /\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?\b/;
const NUMBERS_ONLY = /^[\d\s.,;/kgKG]*$/;

/**
 * The first date in a piece of text, as ISO. With no year written, the
 * latest such date on or before `ref` — a weighing or a birth is never in
 * the future.
 */
export function findDate(text: string, ref: string): string | undefined {
  let d: number | undefined, m: number | undefined, y: number | undefined;
  let hit = DAY_MONTH.exec(text);
  if (hit) [d, m, y] = [Number(hit[1]), monthIndex(hit[2]), hit[3] ? Number(hit[3]) : undefined];
  else if ((hit = MONTH_DAY.exec(text))) [d, m, y] = [Number(hit[2]), monthIndex(hit[1]), hit[3] ? Number(hit[3]) : undefined];
  else if ((hit = NUMERIC.exec(text))) {
    [d, m] = [Number(hit[1]), Number(hit[2]) - 1];
    if (hit[3]) y = hit[3].length === 2 ? 2000 + Number(hit[3]) : Number(hit[3]);
  }
  if (d === undefined || m === undefined || m < 0 || m > 11 || d < 1) return undefined;
  const refYear = Number(ref.slice(0, 4));
  const make = (year: number) => {
    const date = new Date(year, m!, d!);
    return date.getMonth() === m ? toIso(date) : undefined; // 31/02 is not a date
  };
  if (y !== undefined) return make(y);
  const iso = make(refYear);
  return iso && iso > ref ? make(refYear - 1) : iso;
}

function monthIndex(name: string): number {
  return MONTHS.indexOf(name.slice(0, 3).toLowerCase());
}

/** Split a line of weights. Commas separate weights; decimals take a point. */
function readNumbers(s: string): { weights: number[]; unread: string[] } {
  const weights: number[] = [];
  const unread: string[] = [];
  for (const raw of s.split(/[,;\s]+/)) {
    const tok = raw.replace(/kgs?$/i, "");
    if (!tok) continue;
    const n = Number(tok);
    if (/^\d+(\.\d+)?$/.test(tok) && n > 0 && n <= MAX_PLAUSIBLE_KG) weights.push(n);
    else unread.push(raw);
  }
  return { weights, unread };
}

/** Mostly numbers and no date: a line of weights, perhaps with a slip in it. */
function isNumberLine(line: string, today: string): boolean {
  if (NUMBERS_ONLY.test(line)) return true;
  if (findDate(line, today)) return false;
  const { weights, unread } = readNumbers(line);
  return weights.length >= 2 && weights.length > unread.length;
}

export function parseWeighText(text: string, today: string): WeighText {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: WeighText = { groups: [], unread: [] };
  // Headings wait here until we know whether numbers follow them.
  let pending: string | undefined;
  let current: WeighTextGroup | undefined;

  const settleHeading = () => {
    if (pending === undefined) return;
    // A heading with no weights under it: the weighing's date, or noise.
    const date = !out.date ? findDate(pending, today) : undefined;
    if (date) out.date = date;
    else out.unread.push(pending);
    pending = undefined;
  };
  const openGroup = (heading: string) => {
    current = { heading, weights: [], unread: [] };
    out.groups.push(current);
  };

  for (const line of lines) {
    const colon = line.lastIndexOf(":");
    const numbers = colon < 0 && isNumberLine(line, today);
    const head = colon >= 0 ? line.slice(0, colon).trim() : numbers ? "" : line;
    const rest = colon >= 0 ? line.slice(colon + 1).trim() : numbers ? line : "";

    if (head) {
      settleHeading();
      current = undefined;
      if (rest) openGroup(head);
      else pending = head;
    }
    if (rest) {
      if (pending !== undefined) {
        openGroup(pending);
        pending = undefined;
      }
      if (!current) openGroup("");
      const { weights, unread } = readNumbers(rest);
      current!.weights.push(...weights);
      current!.unread.push(...unread);
    }
  }
  settleHeading();

  for (const g of out.groups) g.bornOn = g.heading ? findDate(g.heading, out.date ?? today) : undefined;
  return out;
}

/**
 * The room holding most of the active pigs born on `bornOn` — where a group
 * named by its birth date most likely stands. Undefined when none match.
 */
export function roomForBirthDate(bornOn: string | undefined, animals: Animal[]): string | undefined {
  if (!bornOn) return undefined;
  const counts = new Map<string, number>();
  for (const a of animals) {
    if (a.status !== "active" || a.birth_date !== bornOn || !a.current_room) continue;
    counts.set(a.current_room, (counts.get(a.current_room) ?? 0) + 1);
  }
  let best: string | undefined;
  for (const [room, n] of counts) if (!best || n > counts.get(best)!) best = room;
  return best;
}
