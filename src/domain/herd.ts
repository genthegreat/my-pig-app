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
 * Sows nursing a litter, with the number of piglets still on each. A sow is
 * lactating while her latest litter has piglets that are neither weaned nor
 * past the weaning age (or 56 days if that is not set).
 */
function lactatingSows(active: Animal[], litters: Litter[], settings: SettingsMap | undefined, today: string): Map<string, number> {
  const weaningAge = num(settings, "weaning_age_days");
  const lactWindow = Number.isNaN(weaningAge) ? 56 : weaningAge;
  const lactating = new Map<string, number>();
  for (const l of litters) {
    if (l.outcome !== "farrowed" || !l.actual_farrow || !l.dam_id) continue;
    if (l.weaning_date && l.weaning_date <= today) continue;
    if (daysBetween(l.actual_farrow, today) > lactWindow) continue;
    const alive = active.filter((a) => a.litter_id === l.id && a.stage === "piglet_creep").length;
    lactating.set(l.dam_id, (lactating.get(l.dam_id) ?? 0) + alive);
  }
  return lactating;
}

type IntakeClass = "weaner" | "breeder" | "growing";

const INTAKE_LINE: Record<IntakeClass, string> = {
  weaner: "Weaners",
  breeder: "Sows and boars",
  growing: "Growers and finishers",
};

function intakeClass(stage: Stage): IntakeClass {
  if (stage === "weaner") return "weaner";
  if (stage === "sow" || stage === "boar" || stage === "gilt") return "breeder";
  return "growing";
}

/** Daily intake for each class, each falling back to the grower rate when unset. */
function classIntake(settings: SettingsMap | undefined): Record<IntakeClass, number> {
  const growing = num(settings, "assumed_intake_kg");
  const or = (v: number) => (Number.isNaN(v) ? growing : v);
  return { weaner: or(num(settings, "weaner_intake_kg")), breeder: or(num(settings, "breeder_intake_kg")), growing };
}

/**
 * Daily intake per active pig by stage — weaners, sows and boars, growers and
 * finishers each at their own rate — and 2.5 kg + 0.25 kg per piglet for a
 * lactating sow. Nothing for a piglet on the sow (creep is bought
 * separately). The map is keyed by animal id.
 */
export function intakeByAnimal(animals: Animal[], litters: Litter[], settings: SettingsMap | undefined, today: string): Map<string, number> {
  const rate = classIntake(settings);
  const lactBase = num(settings, "lactating_sow_base_kg");
  const lactPer = num(settings, "lactating_sow_per_piglet_kg");
  const active = animals.filter((a) => a.status === "active");
  const lactating = lactatingSows(active, litters, settings, today);

  const out = new Map<string, number>();
  for (const a of active) {
    if (a.stage === "piglet_creep") out.set(a.id, 0);
    else if (lactating.has(a.id)) out.set(a.id, lactBase + lactPer * (lactating.get(a.id) ?? 0));
    else out.set(a.id, rate[intakeClass(a.stage)]);
  }
  return out;
}

/**
 * Daily feed the herd needs, by stage, plus 2.5 kg + 0.25 kg per piglet for
 * a lactating sow. Piglets on the sow eat creep, which is bought separately
 * and is not counted here.
 */
export function feedRequirement(animals: Animal[], litters: Litter[], settings: SettingsMap | undefined, today: string): FeedRequirement {
  const rate = classIntake(settings);
  const active = animals.filter((a) => a.status === "active");
  const lactating = lactatingSows(active, litters, settings, today);
  const per = intakeByAnimal(animals, litters, settings, today);
  const head: Record<IntakeClass, number> = { weaner: 0, breeder: 0, growing: 0 };
  let pigletsOnSows = 0;
  let lactKg = 0;
  for (const a of active) {
    if (a.stage === "piglet_creep") pigletsOnSows++;
    else if (lactating.has(a.id)) lactKg += per.get(a.id) ?? 0;
    else head[intakeClass(a.stage)]++;
  }
  const classes = Object.keys(head) as IntakeClass[];
  const lines = [
    ...classes.map((c) => ({ label: INTAKE_LINE[c], head: head[c], kgEach: rate[c], kg: head[c] * rate[c] })),
    {
      label: "Lactating sows (2.5 kg + 0.25 per piglet)",
      head: lactating.size,
      kgEach: lactating.size ? lactKg / lactating.size : 0,
      kg: lactKg,
    },
  ];
  return {
    kgPerDay: lines.reduce((s, l) => s + l.kg, 0),
    adults: classes.reduce((s, c) => s + head[c], 0),
    lactatingSows: lactating.size,
    pigletsOnSows,
    lines: lines.filter((l) => l.head > 0),
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
