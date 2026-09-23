// Growth: pen averages, daily gain between weighings, sale-date projection.
//
// Lifetime ADG rises with age, so a 75-day-old's figure is never compared
// with a 240-day-old's. Wherever two weighings exist the app uses the gain
// between them; lifetime ADG is shown only as context.

import type { Weight } from "@/db/schema";
import { addDays, daysBetween } from "./dates";

// Birth weights are not on record. 1.4 kg is a typical birth weight, used
// to work out lifetime daily gain from a single weighing.
export const ASSUMED_BIRTH_WEIGHT_KG = 1.4;

export interface WeighSession {
  date: string;
  roomId?: string;
  count: number;
  avgKg: number;
  minKg: number;
  maxKg: number;
  totalKg: number;
  weights: Weight[];
}

/** Group live weights into sessions by room and date, latest first. */
export function weighSessions(weights: Weight[]): WeighSession[] {
  const byKey = new Map<string, Weight[]>();
  for (const w of weights) {
    if (w.basis !== "live") continue;
    const key = `${w.room_id ?? w.group_id ?? w.animal_id ?? "?"}|${w.date}`;
    const list = byKey.get(key) ?? [];
    list.push(w);
    byKey.set(key, list);
  }
  const out: WeighSession[] = [];
  for (const list of byKey.values()) {
    const kgs = list.map((w) => w.weight_kg);
    const totalKg = kgs.reduce((a, b) => a + b, 0);
    out.push({
      date: list[0].date,
      roomId: list[0].room_id,
      count: list.length,
      avgKg: totalKg / list.length,
      minKg: Math.min(...kgs),
      maxKg: Math.max(...kgs),
      totalKg,
      weights: list,
    });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export interface Adg {
  kgPerDay: number;
  fromDate: string;
  toDate: string;
  fromKg: number;
  toKg: number;
  days: number;
  basis: "measured" | "lifetime" | "assumed";
}

/** Daily gain between the two most recent sessions, if there are two. */
export function measuredAdg(sessions: WeighSession[]): Adg | undefined {
  if (sessions.length < 2) return undefined;
  const [latest, prev] = sessions;
  const days = daysBetween(prev.date, latest.date);
  if (days <= 0) return undefined;
  return {
    kgPerDay: (latest.avgKg - prev.avgKg) / days,
    fromDate: prev.date,
    toDate: latest.date,
    fromKg: prev.avgKg,
    toKg: latest.avgKg,
    days,
    basis: "measured",
  };
}

/** Lifetime gain from an assumed birth weight — context only. */
export function lifetimeAdg(birthDate: string, weighDate: string, kg: number): Adg | undefined {
  const days = daysBetween(birthDate, weighDate);
  if (days <= 0) return undefined;
  return {
    kgPerDay: (kg - ASSUMED_BIRTH_WEIGHT_KG) / days,
    fromDate: birthDate,
    toDate: weighDate,
    fromKg: ASSUMED_BIRTH_WEIGHT_KG,
    toKg: kg,
    days,
    basis: "lifetime",
  };
}

export interface Projection {
  targetKg: number;
  fromKg: number;
  fromDate: string;
  adg: Adg;
  days: number;
  date: string;
}

/** When does this pen reach the target weight, at the given gain? */
export function projectSaleDate(fromKg: number, fromDate: string, targetKg: number, adg: Adg): Projection | undefined {
  if (adg.kgPerDay <= 0) return undefined;
  const remaining = targetKg - fromKg;
  const days = remaining <= 0 ? 0 : Math.ceil(remaining / adg.kgPerDay);
  return { targetKg, fromKg, fromDate, adg, days, date: addDays(fromDate, days) };
}
