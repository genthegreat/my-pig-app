// The offer calculator. Ported from the "Kwacha Per Kilo" prototype — same
// arithmetic, same verdict thresholds. See docs/SPEC.md §5 and
// docs/DOMAIN-CONSTANTS.md "Hold-or-sell arithmetic".
//
// Holding for target T instead of accepting an offer paying P per live kg is
// worth  W(T − P) + (T·g − c)·D  where W = live weight, g = daily gain,
// c = daily running cost and D = days waited. When T·g ≥ c the pig pays for
// its own keep and waiting is free; below that the wait is capped at
// W(T − P) / (c − T·g) days.

export interface OfferInputs {
  liveKg: number;
  pricePerKg: number; // what the buyer said
  channel: "live" | "dead";
  daysOnFarm: number;
  dressingPct: number; // e.g. 62
  dailyCost: number; // K per pig per day
  targetPerKg: number; // K per live kg
  headPricePerKg: number; // K per kg, only if heads are sold with a dead-weight sale
  headPctOfCarcass: number; // e.g. 10
  headsSold: boolean; // dead-weight only
  adg: number; // kg/day, the growth rate used for the verdict
}

export type Verdict = "lose" | "take" | "hold" | "hold_days";

export interface AdgRow {
  adg: number;
  valuePerDay: number; // T·g
  costPerDay: number; // c
  netPerDay: number; // T·g − c
  maxDays: number | null; // null = growth pays for itself (no cap)
  worthWaiting: boolean;
  current: boolean;
}

export interface OfferResult {
  carcassKg: number;
  headKg: number;
  revenue: number;
  revenueNote: string;
  perLiveKg: number; // what the offer really pays per live kg
  cost: number;
  margin: number;
  marginPctOfCost: number | null;
  breakEvenPerKg: number;
  premiumAtTarget: number; // W(T − P)
  netPerDayAtAdg: number; // T·g − c at the chosen g
  maxDaysAtAdg: number | null;
  crossoverAdg: number; // c / T — above this, waiting is free
  verdict: Verdict;
  title: string;
  body: string;
  fine: string;
  rows: AdgRow[];
}

export const ADG_TABLE = [0, 0.15, 0.23, 0.28, 0.33, 0.45, 0.55];

function k(n: number, d = 0): string {
  const sign = n < 0 ? "-" : "";
  const [whole, frac] = Math.abs(n).toFixed(d).split(".");
  return `${sign}K${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${frac ? "." + frac : ""}`;
}

export function computeOffer(i: OfferInputs): OfferResult {
  const W = i.liveKg;
  const P = i.pricePerKg;
  const dress = i.dressingPct / 100;
  const c = i.dailyCost;
  const T = i.targetPerKg;

  const carcassKg = W * dress;
  const headKg = carcassKg * (i.headPctOfCarcass / 100);

  let revenue: number;
  let revenueNote: string;
  if (i.channel === "live") {
    revenue = P * W;
    revenueNote = `${W} kg live at ${k(P, 2)}`;
  } else {
    const heads = i.headsSold ? headKg * i.headPricePerKg : 0;
    revenue = P * carcassKg + heads;
    revenueNote = i.headsSold
      ? `${carcassKg.toFixed(1)} kg carcass at ${k(P, 2)} + ${headKg.toFixed(1)} kg heads at ${k(i.headPricePerKg)}`
      : `${carcassKg.toFixed(1)} kg carcass at ${k(P, 2)}, heads not sold`;
  }
  const perLiveKg = W > 0 ? revenue / W : 0;
  const cost = i.daysOnFarm * c;
  const margin = revenue - cost;
  const breakEvenPerKg = W > 0 ? cost / W : 0;
  const premiumAtTarget = W * (T - perLiveKg);
  const crossoverAdg = T > 0 ? c / T : Infinity;

  const rowFor = (g: number, current: boolean): AdgRow => {
    const valuePerDay = T * g;
    const netPerDay = valuePerDay - c;
    let maxDays: number | null = null;
    let worthWaiting = true;
    if (netPerDay < 0) {
      const d = premiumAtTarget / -netPerDay;
      maxDays = d > 0 ? d : 0;
      worthWaiting = d > 0;
    }
    return { adg: g, valuePerDay, costPerDay: c, netPerDay, maxDays, worthWaiting, current };
  };

  const rows = ADG_TABLE.map((g) => rowFor(g, Math.abs(g - i.adg) < 0.005));
  if (!rows.some((r) => r.current)) {
    rows.push(rowFor(i.adg, true));
    rows.sort((a, b) => a.adg - b.adg);
  }

  const atAdg = rowFor(i.adg, true);
  const netPerDayAtAdg = atAdg.netPerDay;
  const maxDaysAtAdg = atAdg.maxDays;

  let verdict: Verdict;
  let title: string;
  let body: string;
  let fine: string;

  if (margin < 0) {
    verdict = "lose";
    title = "You lose money here";
    body = `At ${k(revenue)} this pig does not cover the ${k(cost)} it cost to raise. Your break-even is ${k(breakEvenPerKg, 2)} per live kg.`;
    fine = "Selling still beats feeding it further unless it is genuinely still growing.";
  } else if (perLiveKg >= T) {
    verdict = "take";
    title = "Take it";
    body = `${k(perLiveKg, 2)} per live kg is at or above your ${k(T, 2)} target. Margin on this pig is ${k(margin)}.`;
    fine = "An offer at or above target will not come often. Take it while it is on the table.";
  } else if (netPerDayAtAdg >= 0) {
    verdict = "hold";
    title = "Hold out";
    body = `Turning this down costs you nothing per day. At ${i.adg.toFixed(2)} kg/day the pig adds ${k(T * i.adg, 2)} of value daily against ${k(c, 2)} of feed and labour — waiting is free, and ${k(T, 2)} would earn you ${k(premiumAtTarget)} more.`;
    fine = "That holds only while the pig is genuinely still gaining. Once it plateaus, every day is pure cost.";
  } else {
    const d = Math.round(maxDaysAtAdg ?? 0);
    verdict = "hold_days";
    title = `Hold — for up to ${d} days`;
    body = `At ${i.adg.toFixed(2)} kg/day growth this pig loses ${k(-netPerDayAtAdg, 2)} a day net. The ${k(premiumAtTarget)} you would gain at ${k(T, 2)} is worth about ${d} days of waiting, and no more.`;
    fine = `If no better buyer appears inside ${d} days, take the offer in front of you.`;
  }

  return {
    carcassKg,
    headKg,
    revenue,
    revenueNote,
    perLiveKg,
    cost,
    margin,
    marginPctOfCost: cost > 0 ? (margin / cost) * 100 : null,
    breakEvenPerKg,
    premiumAtTarget,
    netPerDayAtAdg,
    maxDaysAtAdg,
    crossoverAdg,
    verdict,
    title,
    body,
    fine,
    rows,
  };
}
