// The pay and feed-buying rhythm. A schedule is a rule ("worker salary,
// K1,100, monthly on the last day"; "buy meal 3 every two weeks"); this
// module turns rules into dated occurrences for the calendar and the cash
// plan, and works out how much feed each rule should buy from the rations
// the herd is actually on.

import type { Animal, FeedProduct, Group, Litter, Ration, Schedule, Stage } from "@/db/schema";
import { CADENCE_DAYS } from "@/db/schema";
import type { SettingsMap } from "@/db/settings";
import { addDays, daysInMonth, parseIso, toIso } from "./dates";
import { intakeByAnimal } from "./herd";
import { rationFigures } from "./ration";

// ── Occurrences ─────────────────────────────────────────────────────────────

/**
 * Same day of month as `anchor`, clamped to shorter months. An anchor on the
 * last day of its month means "the last day", so 30 Sep → 31 Oct → 30 Nov.
 */
function monthlyOn(anchor: string, monthsAhead: number): string {
  const a = parseIso(anchor);
  const lastDay = a.getDate() === daysInMonth(anchor);
  const target = new Date(a.getFullYear(), a.getMonth() + monthsAhead, 1);
  const key = toIso(target);
  const day = lastDay ? daysInMonth(key) : Math.min(a.getDate(), daysInMonth(key));
  return toIso(new Date(target.getFullYear(), target.getMonth(), day));
}

/**
 * Dates on which the rule falls inside [from, to], excluding anything on or
 * before `last_done`. Past occurrences are the caller's overdue items.
 */
export function occurrences(s: Pick<Schedule, "cadence" | "anchor" | "last_done" | "active">, from: string, to: string): string[] {
  if (!s.active || !s.anchor) return [];
  const out: string[] = [];
  const floor = s.last_done && s.last_done > from ? s.last_done : from;
  if (s.cadence === "monthly") {
    for (let k = 0; k < 120; k++) {
      const d = monthlyOn(s.anchor, k);
      if (d > to) break;
      if (d > floor && d >= s.anchor) out.push(d);
    }
  } else {
    const step = s.cadence === "weekly" ? 7 : 14;
    for (let k = 0; k < 400; k++) {
      const d = addDays(s.anchor, k * step);
      if (d > to) break;
      if (d > floor) out.push(d);
    }
  }
  return out;
}

export function nextOccurrence(s: Schedule, today: string): string | undefined {
  return occurrences(s, addDays(today, -1), addDays(today, 400))[0];
}

// ── Feed need per product from the rations ──────────────────────────────────

export interface ProductNeed {
  product: FeedProduct;
  kgPerDay: number;
  unitsPerDay: number; // bags or buckets of this product per day
  head: number; // pigs this feed is currently going to
  via: { ration: Ration; groupName: string; head: number; kgPerDay: number }[];
}

function stagesOf(g: Group): Stage[] {
  return (g.stage ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean) as Stage[];
}

/**
 * For every product in an active ration: kilograms and bags per day, from
 * the pigs that ration feeds. A group ration feeds the animals whose stage
 * the group names; a ration with no group feeds everyone not covered by a
 * group ration.
 */
export function feedNeedByProduct(
  rations: Ration[],
  products: Map<string, FeedProduct>,
  groups: Group[],
  animals: Animal[],
  litters: Litter[],
  settings: SettingsMap | undefined,
  today: string,
): Map<string, ProductNeed> {
  const active = rations.filter((r) => r.effective_from <= today && (!r.effective_to || r.effective_to >= today));
  const intake = intakeByAnimal(animals, litters, settings, today);
  const feeding = animals.filter((a) => a.status === "active" && (intake.get(a.id) ?? 0) > 0);
  const covered = new Set<string>();
  const out = new Map<string, ProductNeed>();

  const add = (productId: string | undefined, kgPerDay: number, ration: Ration, groupName: string, head: number) => {
    if (!productId || kgPerDay <= 0) return;
    const product = products.get(productId);
    if (!product) return;
    const e = out.get(productId) ?? { product, kgPerDay: 0, unitsPerDay: 0, head: 0, via: [] };
    e.kgPerDay += kgPerDay;
    e.unitsPerDay = e.kgPerDay / product.bag_size_kg;
    e.head += head;
    e.via.push({ ration, groupName, head, kgPerDay });
    out.set(productId, e);
  };

  const apply = (r: Ration, herd: Animal[], groupName: string) => {
    const kgPerDay = herd.reduce((s, a) => s + (intake.get(a.id) ?? 0), 0);
    if (kgPerDay <= 0) return;
    const conc = r.concentrate_id ? products.get(r.concentrate_id) : undefined;
    const dil = r.diluent_id ? products.get(r.diluent_id) : undefined;
    const f = rationFigures(r, conc, dil);
    if (f.batchKg <= 0) return;
    add(r.concentrate_id, (kgPerDay * f.concentrateKg) / f.batchKg, r, groupName, herd.length);
    add(r.diluent_id, (kgPerDay * f.diluentKg) / f.batchKg, r, groupName, herd.length);
  };

  for (const r of active.filter((x) => x.group_id)) {
    const g = groups.find((x) => x.id === r.group_id);
    if (!g) continue;
    const stages = stagesOf(g);
    const herd = feeding.filter((a) => stages.includes(a.stage) && !covered.has(a.id));
    herd.forEach((a) => covered.add(a.id));
    apply(r, herd, g.name);
  }
  for (const r of active.filter((x) => !x.group_id)) {
    apply(
      r,
      feeding.filter((a) => !covered.has(a.id)),
      "Whole farm",
    );
  }
  return out;
}

/** Bags to buy for one occurrence: fixed on the rule, or the period's need rounded up. */
export function bagsForOccurrence(s: Schedule, need?: ProductNeed): number | undefined {
  if (s.bags && s.bags > 0) return s.bags;
  if (!need) return undefined;
  return Math.ceil(need.unitsPerDay * CADENCE_DAYS[s.cadence]);
}

/** When the bags on hand run out at the current rate, if a count exists. */
export function productRunOut(product: FeedProduct, need: ProductNeed | undefined, today: string): { days: number; date: string } | undefined {
  if (!need || need.unitsPerDay <= 0 || product.bags_on_hand === undefined) return undefined;
  const days = product.bags_on_hand / need.unitsPerDay;
  return { days, date: addDays(today, Math.floor(days)) };
}

/**
 * What a payday should pay. A "balance" rule pays the monthly rate less
 * everything already paid in that month except bonuses — e.g. K400 on the
 * 15th and the rest of K1,500 on the last day.
 */
export function payOccurrenceAmount(
  s: Schedule,
  date: string,
  employee: { pay_rate?: number } | undefined,
  payroll: { employee_id: string; period: string; amount: number; kind: string }[],
): { amount: number | undefined; explain?: string } {
  if (s.kind !== "pay" || s.amount_mode !== "balance" || !employee?.pay_rate) return { amount: s.amount };
  const period = date.slice(0, 7);
  const already = payroll.filter((p) => p.employee_id === s.employee_id && p.period === period && p.kind !== "bonus");
  const paid = already.reduce((t, p) => t + p.amount, 0);
  const amount = Math.max(0, employee.pay_rate - paid);
  return {
    amount,
    explain: paid > 0 ? `${fmtKw(employee.pay_rate)} monthly pay less ${fmtKw(paid)} already paid` : `${fmtKw(employee.pay_rate)} monthly pay, nothing paid yet this month`,
  };
}

function fmtKw(n: number): string {
  return "K" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Round to a sensible kwacha figure for a plan. */
export function occurrenceAmount(s: Schedule, need?: ProductNeed): number | undefined {
  if (s.kind === "feed") {
    const bags = bagsForOccurrence(s, need);
    const price = need?.product.current_price_per_bag;
    return bags !== undefined && price ? bags * price : s.amount;
  }
  return s.amount;
}
