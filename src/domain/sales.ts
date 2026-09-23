// Sale arithmetic. Dead weight is never comparable to live weight until it
// has been through the dressing percentage — live_equivalent_per_kg is what
// makes the two channels commensurable, and it is shown on every dead sale.

export interface SaleFigures {
  carcassTotal?: number;
  headTotal?: number;
  trottersTotal?: number;
  total: number;
  dressingPct?: number;
  liveEquivalentPerKg?: number;
  livePricePerKg?: number; // live channel: total ÷ live kg
}

export interface SaleInputs {
  channel: "live" | "dead";
  liveKg?: number;
  carcassKg?: number;
  pricePerKg?: number;
  headKg?: number;
  headSold: boolean;
  headPricePerKg?: number;
  trottersKg?: number;
  trottersSold: boolean;
  trottersPricePerKg?: number;
  /** When the buyer paid a lump sum rather than a per-kg price. */
  totalOverride?: number;
}

export function dressingPct(liveKg?: number, carcassKg?: number): number | undefined {
  if (!liveKg || !carcassKg || liveKg <= 0) return undefined;
  return (carcassKg / liveKg) * 100;
}

export function liveEquivalentPerKg(total: number, liveKg?: number): number | undefined {
  if (!liveKg || liveKg <= 0) return undefined;
  return total / liveKg;
}

export function computeSale(s: SaleInputs): SaleFigures {
  let carcassTotal: number | undefined;
  let liveTotal: number | undefined;
  if (s.channel === "dead") {
    if (s.carcassKg && s.pricePerKg) carcassTotal = s.carcassKg * s.pricePerKg;
  } else if (s.liveKg && s.pricePerKg) {
    liveTotal = s.liveKg * s.pricePerKg;
  }
  const headTotal = s.headSold && s.headKg && s.headPricePerKg ? s.headKg * s.headPricePerKg : undefined;
  const trottersTotal =
    s.trottersSold && s.trottersKg && s.trottersPricePerKg ? s.trottersKg * s.trottersPricePerKg : undefined;

  const computed = (carcassTotal ?? liveTotal ?? 0) + (headTotal ?? 0) + (trottersTotal ?? 0);
  const total = s.totalOverride ?? computed;

  return {
    carcassTotal,
    headTotal,
    trottersTotal,
    total,
    dressingPct: dressingPct(s.liveKg, s.carcassKg),
    liveEquivalentPerKg: s.channel === "dead" ? liveEquivalentPerKg(total, s.liveKg) : undefined,
    livePricePerKg: s.channel === "live" ? liveEquivalentPerKg(total, s.liveKg) : undefined,
  };
}

/** Mean of the dressing percentages actually measured. */
export function meanDressing(pcts: number[]): number | undefined {
  if (!pcts.length) return undefined;
  return pcts.reduce((a, b) => a + b, 0) / pcts.length;
}

// ── What each pig in a sale fetched ─────────────────────────────────────────

export interface LineAmount {
  amount: number;
  /** exact: from this pig's own weight × price; by_weight: its share of a lump sum by weight; share: an even split */
  basis: "exact" | "by_weight" | "share";
}

type SaleShape = { channel: "live" | "dead"; head: number; total: number; price_per_kg?: number; head_total?: number; head_price_per_kg?: number; head_sold?: number };
type LineShape = { live_kg?: number; carcass_kg?: number; head_kg?: number };

function rawLineAmount(sale: SaleShape, line: LineShape, lines: LineShape[]): LineAmount {
  const head = Math.max(1, sale.head);
  if (sale.channel === "dead" && line.carcass_kg && sale.price_per_kg) {
    const heads = sale.head_sold && line.head_kg && sale.head_price_per_kg ? line.head_kg * sale.head_price_per_kg : (sale.head_total ?? 0) / head;
    return { amount: line.carcass_kg * sale.price_per_kg + heads, basis: "exact" };
  }
  if (sale.channel === "live" && line.live_kg && sale.price_per_kg) {
    return { amount: line.live_kg * sale.price_per_kg, basis: "exact" };
  }
  const kgKey = sale.channel === "dead" ? "carcass_kg" : "live_kg";
  const mine = line[kgKey];
  const all = lines.map((l) => l[kgKey] ?? 0);
  if (mine && all.every((k) => k > 0) && all.length === head) {
    const sum = all.reduce((s, k) => s + k, 0);
    return { amount: (sale.total * mine) / sum, basis: "by_weight" };
  }
  return { amount: sale.total / head, basis: "share" };
}

/**
 * What each pig in a sale fetched. Exact when the sale priced per kg and the
 * pig's weight is on record; a weight-proportional share of a lump sum when
 * only weights are known; otherwise an even split. The figures are then
 * apportioned so they add up to the money actually received — a slip rounded
 * up to 120 kg pays K8,400, even though the pigs' own weights come to K8,386.
 */
export function lineAmounts<T extends LineShape>(sale: SaleShape, lines: T[]): Map<T, LineAmount> {
  const raw = lines.map((l) => [l, rawLineAmount(sale, l, lines)] as const);
  const computed = raw.reduce((s, [, a]) => s + a.amount, 0);
  // Only scale when every pig is priced from its own figures and the whole sale is covered.
  const scale = computed > 0 && raw.length === sale.head ? sale.total / computed : 1;
  return new Map(raw.map(([l, a]) => [l, { amount: a.amount * scale, basis: a.basis }]));
}

export function lineAmount(sale: SaleShape, line: LineShape, lines: LineShape[]): LineAmount {
  return lineAmounts(sale, lines.includes(line) ? lines : [...lines, line]).get(line) ?? rawLineAmount(sale, line, lines);
}
