// Herd-level figures: head counts, pig-days, the running cost per pig per
// day computed from actual spend, and the feed requirement.

import type { Animal, Cost, CostCategory, FeedProduct, Litter, Stage } from "@/db/schema";
import { STAGES } from "@/db/schema";
import type { SettingsMap } from "@/db/settings";
import { num } from "@/db/settings";
import { addDays, daysBetween, daysInMonth, monthEnd, monthStart, overlapDays } from "./dates";

export interface HerdCounts {
  total: number;
  byStage: Record<Stage, number>;
}

export function herdCounts(animals: Animal[]): HerdCounts {
  const byStage = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
  let total = 0;
  for (const a of animals) {
    if (a.status !== "active") continue;
    total++;
    byStage[a.stage]++;
  }
  return { total, byStage };
}

/** The dates an animal was on the farm. Unknown exits count nothing. */
export function onFarmRange(a: Animal, today: string): [string, string] | undefined {
  const start = a.origin === "purchased" ? (a.purchase_date ?? a.birth_date) : (a.birth_date ?? a.purchase_date);
  if (!start) return undefined;
  if (a.status === "active") return [start, today];
  if (!a.exit_date) return undefined;
  return [start, a.exit_date];
}

export function pigDays(animals: Animal[], from: string, to: string, today: string): number {
  let sum = 0;
  for (const a of animals) {
    const r = onFarmRange(a, today);
    if (!r) continue;
    sum += overlapDays(r[0], r[1], from, to);
  }
  return sum;
}

export function daysOnFarm(a: Animal, today: string): number | undefined {
  const r = onFarmRange(a, today);
  return r ? daysBetween(r[0], r[1]) : undefined;
}

export type CostComponent = "feed" | "labour" | "other";

export function costComponent(category: CostCategory): CostComponent {
  if (category === "feed" || category === "feed_transport" || category === "additives") return "feed";
  if (category === "labour") return "labour";
  return "other";
}

export interface MonthlyRunningCost {
  month: string;
  days: number;
  pigDays: number;
  avgHead: number;
  spend: Record<CostComponent, number>;
  perPigDay: Record<CostComponent, number> & { total: number };
  capitalExcluded: number;
}

/** Non-capital spend in a month divided by the pig-days in it. */
export function monthlyRunningCost(
  month: string,
  costs: Cost[],
  animals: Animal[],
  today: string,
): MonthlyRunningCost {
  const from = monthStart(month);
  const to = monthEnd(month);
  const spend: Record<CostComponent, number> = { feed: 0, labour: 0, other: 0 };
  let capitalExcluded = 0;
  for (const c of costs) {
    if (c.date.slice(0, 7) !== month) continue;
    if (c.is_capital) {
      capitalExcluded += c.total;
      continue;
    }
    spend[costComponent(c.category)] += c.total;
  }
  const pd = pigDays(animals, from, to, today);
  const days = daysInMonth(month);
  const per = (n: number) => (pd > 0 ? n / pd : 0);
  const perPigDay = {
    feed: per(spend.feed),
    labour: per(spend.labour),
    other: per(spend.other),
    total: per(spend.feed + spend.labour + spend.other),
  };
  return { month, days, pigDays: pd, avgHead: pd / days, spend, perPigDay, capitalExcluded };
}

export interface FeedRequirement {
  kgPerDay: number;
  adults: number;
  lactatingSows: number;
  pigletsOnSows: number;
  lines: { label: string; head: number; kgEach: number; kg: number }[];
}

/**
 * Daily intake per active pig: 2.2 kg per adult, 2.5 kg + 0.25 kg per piglet
 * for a lactating sow, nothing for a piglet on the sow (creep is bought
 * separately). The map is keyed by animal id.
 */
export function intakeByAnimal(animals: Animal[], litters: Litter[], settings: SettingsMap | undefined, today: string): Map<string, number> {
  const intake = num(settings, "assumed_intake_kg");
  const lactBase = num(settings, "lactating_sow_base_kg");
  const lactPer = num(settings, "lactating_sow_per_piglet_kg");
  const weaningAge = num(settings, "weaning_age_days");
  const active = animals.filter((a) => a.status === "active");

  // A sow is lactating while her latest litter has piglets that are neither
  // weaned nor past the weaning age (or 56 days if that is not set).
  const lactWindow = Number.isNaN(weaningAge) ? 56 : weaningAge;
  const lactating = new Map<string, number>();
  for (const l of litters) {
    if (l.outcome !== "farrowed" || !l.actual_farrow || !l.dam_id) continue;
    if (l.weaning_date && l.weaning_date <= today) continue;
    if (daysBetween(l.actual_farrow, today) > lactWindow) continue;
    const alive = active.filter((a) => a.litter_id === l.id && a.stage === "piglet_creep").length;
    lactating.set(l.dam_id, (lactating.get(l.dam_id) ?? 0) + alive);
  }

  const out = new Map<string, number>();
  for (const a of active) {
    if (a.stage === "piglet_creep") out.set(a.id, 0);
    else if (lactating.has(a.id)) out.set(a.id, lactBase + lactPer * (lactating.get(a.id) ?? 0));
    else out.set(a.id, intake);
  }
  return out;
}

/**
 * Daily feed the herd needs: 2.2 kg per adult, 2.5 kg + 0.25 kg per piglet
 * for a lactating sow. Piglets on the sow eat creep, which is bought
 * separately and is not counted here.
 */
export function feedRequirement(animals: Animal[], litters: Litter[], settings: SettingsMap | undefined, today: string): FeedRequirement {
  const intake = num(settings, "assumed_intake_kg");
  const lactBase = num(settings, "lactating_sow_base_kg");
  const per = intakeByAnimal(animals, litters, settings, today);
  let adults = 0;
  let pigletsOnSows = 0;
  let lactatingSows = 0;
  let lactKg = 0;
  for (const a of animals) {
    if (a.status !== "active") continue;
    const kg = per.get(a.id) ?? 0;
    if (a.stage === "piglet_creep") pigletsOnSows++;
    else if (kg !== intake && kg >= lactBase) {
      lactatingSows++;
      lactKg += kg;
    } else adults++;
  }
  const lines = [
    { label: "Adults and growing stock", head: adults, kgEach: intake, kg: adults * intake },
    {
      label: "Lactating sows (2.5 kg + 0.25 per piglet)",
      head: lactatingSows,
      kgEach: lactatingSows ? lactKg / lactatingSows : 0,
      kg: lactKg,
    },
  ];
  return {
    kgPerDay: adults * intake + lactKg,
    adults,
    lactatingSows,
    pigletsOnSows,
    lines,
  };
}

export interface FeedForecast {
  kgOnHand: number;
  kgPerDay: number;
  daysLeft: number | undefined;
  runsOutOn: string | undefined;
  products: { product: FeedProduct; kg: number }[];
}

/** Bags on hand against the daily requirement. */
export function feedForecast(products: FeedProduct[], kgPerDay: number, today: string): FeedForecast {
  const lines = products
    .filter((p) => p.active && (p.bags_on_hand ?? 0) > 0 && p.kind !== "additive")
    .map((p) => ({ product: p, kg: (p.bags_on_hand ?? 0) * p.bag_size_kg }));
  const kgOnHand = lines.reduce((s, l) => s + l.kg, 0);
  const daysLeft = kgPerDay > 0 && kgOnHand > 0 ? kgOnHand / kgPerDay : undefined;
  return {
    kgOnHand,
    kgPerDay,
    daysLeft,
    runsOutOn: daysLeft !== undefined ? addDays(today, Math.floor(daysLeft)) : undefined,
    products: lines,
  };
}
