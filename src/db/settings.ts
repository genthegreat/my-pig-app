import { db } from "./db";
import { nowIso } from "./write";
import { SETTING_OVERRIDES } from "@/seed/farm-settings";

// Every figure the app computes with. The values here are sample defaults;
// a private farm's own figures (src/seed/farm-settings.ts) replace them.
// Each carries where it came from so the Settings screen can show it — the
// user has been burned by numbers he couldn't trace.

export interface SettingDef {
  key: string;
  label: string;
  value: string; // seeded default; '' means "not known — the app must ask"
  unit?: string;
  group: "money" | "sale" | "biology" | "growth" | "feed" | "farm" | "app";
  source: string;
  editable?: boolean;
  step?: number;
}

export const SETTING_DEFS: SettingDef[] = [
  // ── Money ─────────────────────────────────────────────────────────────
  {
    key: "daily_cost_feed",
    label: "Feed per pig per day",
    value: "15.00",
    unit: "K",
    group: "money",
    source: "Sample figure. Set it from your own feed spend ÷ pig-days — Money works it out and offers to replace this.",
    step: 0.01,
  },
  {
    key: "daily_cost_labour",
    label: "Labour per pig per day",
    value: "2.50",
    unit: "K",
    group: "money",
    source: "Sample figure: the worker's pay spread over the herd.",
    step: 0.01,
  },
  {
    key: "daily_cost_other",
    label: "Bedding, vet & power per pig per day",
    value: "1.00",
    unit: "K",
    group: "money",
    source: "Sample figure: bedding, vet and power.",
    step: 0.01,
  },
  {
    key: "target_price_per_kg",
    label: "Target live price",
    value: "60",
    unit: "K/kg",
    group: "sale",
    source: "Sample target. A stretch, not a floor.",
    step: 0.5,
  },
  {
    key: "best_live_price_per_kg",
    label: "Best live price achieved",
    value: "58",
    unit: "K/kg",
    group: "sale",
    source: "Sample figure — replace with the best live price you have achieved.",
    step: 0.01,
  },
  {
    key: "head_price_per_kg",
    label: "Head price",
    value: "28",
    unit: "K/kg",
    group: "sale",
    source: "Sample figure — what a butchery pays per kg of head.",
    step: 1,
  },
  {
    key: "head_pct_of_carcass",
    label: "Heads as a share of carcass weight",
    value: "10",
    unit: "%",
    group: "sale",
    source: "Sample figure. Used only to estimate head income on a dead-weight offer.",
    step: 0.1,
  },
  {
    key: "dressing_pct",
    label: "Dressing percentage (default)",
    value: "62",
    unit: "%",
    group: "sale",
    source: "Typical for a carcass without head and trotters. Replace with the mean of your own sales that have both weights. A range, never a certainty.",
    step: 0.1,
  },
  {
    key: "dressing_pct_min",
    label: "Dressing percentage, lowest measured",
    value: "58",
    unit: "%",
    group: "sale",
    source: "Sample figure — the lowest dressing percentage you have measured.",
    step: 0.1,
  },
  {
    key: "dressing_pct_max",
    label: "Dressing percentage, highest measured",
    value: "67",
    unit: "%",
    group: "sale",
    source: "Sample figure — the highest dressing percentage you have measured.",
    step: 0.1,
  },
  // ── Biology ───────────────────────────────────────────────────────────
  {
    key: "gestation_days",
    label: "Gestation",
    value: "114",
    unit: "days",
    group: "biology",
    source: "Standard pig gestation.",
    step: 1,
  },
  {
    key: "weaning_age_days",
    label: "Weaning age",
    value: "",
    unit: "days",
    group: "biology",
    source: "Not on record. Until it is entered the calendar cannot project weaning dates.",
    step: 1,
  },
  {
    key: "heat_cycle_days",
    label: "Heat cycle",
    value: "21",
    unit: "days",
    group: "biology",
    source: "Standard; used to suggest the next heat after a failed service.",
    step: 1,
  },
  {
    key: "gilt_min_service_kg",
    label: "Gilt minimum service weight",
    value: "110",
    unit: "kg",
    group: "biology",
    source: "Serve at the 2nd or 3rd heat, minimum 110–120 kg.",
    step: 1,
  },
  // ── Growth ────────────────────────────────────────────────────────────
  {
    key: "target_market_weight_kg",
    label: "Target market weight",
    value: "80",
    unit: "kg",
    group: "growth",
    source: "Sample market weight.",
    step: 1,
  },
  {
    key: "default_adg_kg",
    label: "Daily gain assumed when no weighings exist",
    value: "0.33",
    unit: "kg/day",
    group: "growth",
    source: "Sample figure for daily gain to market. Commercial benchmark 0.55–0.65.",
    step: 0.005,
  },
  {
    key: "benchmark_adg_kg",
    label: "Commercial benchmark daily gain",
    value: "0.55",
    unit: "kg/day",
    group: "growth",
    source: "0.55–0.65 kg/day; 90–100 kg by 150–180 days.",
    step: 0.01,
    editable: false,
  },
  // ── Feed ──────────────────────────────────────────────────────────────
  {
    key: "assumed_intake_kg",
    label: "Daily intake per grower or finisher",
    value: "2.2",
    unit: "kg",
    group: "feed",
    source: "Operating assumption. Also used for weaners and breeders when their own rates are blank.",
    step: 0.1,
  },
  {
    key: "weaner_intake_kg",
    label: "Daily intake per weaner",
    value: "1.0",
    unit: "kg",
    group: "feed",
    source: "A typical weaner's intake — set your own.",
    step: 0.1,
  },
  {
    key: "breeder_intake_kg",
    label: "Daily intake per sow or boar",
    value: "2.5",
    unit: "kg",
    group: "feed",
    source: "A typical dry sow or boar ration — check your feed's bag label.",
    step: 0.1,
  },
  {
    key: "lactating_sow_base_kg",
    label: "Lactating sow base intake",
    value: "2.5",
    unit: "kg",
    group: "feed",
    source: "2.5 kg plus 0.25 kg per piglet.",
    step: 0.1,
  },
  {
    key: "lactating_sow_per_piglet_kg",
    label: "Lactating sow extra per piglet",
    value: "0.25",
    unit: "kg",
    group: "feed",
    source: "2.5 kg plus 0.25 kg per piglet.",
    step: 0.05,
  },
  {
    key: "historic_feed_kg",
    label: "Feed bought to date",
    value: "5000",
    unit: "kg",
    group: "feed",
    source: "Sample figure.",
    editable: false,
  },
  {
    key: "historic_feed_cost",
    label: "Feed spend to date",
    value: "32500",
    unit: "K",
    group: "feed",
    source: "Sample figure: K32,500 ÷ 5,000 kg = K6.50/kg.",
    editable: false,
  },
  // ── Farm ──────────────────────────────────────────────────────────────
  {
    key: "piggery_area_m2",
    label: "Piggery area",
    value: "60",
    unit: "m²",
    group: "farm",
    source: "Sample figure.",
    editable: false,
  },
  {
    key: "pen_build_cost",
    label: "Pen build cost",
    value: "50000",
    unit: "K",
    group: "farm",
    source: "Sample figure. Capital — never in cost-per-pig.",
    editable: false,
  },
];

for (const d of SETTING_DEFS) Object.assign(d, SETTING_OVERRIDES[d.key]);

export type SettingsMap = Record<string, string>;

export function settingDefaults(): SettingsMap {
  const m: SettingsMap = {};
  for (const d of SETTING_DEFS) m[d.key] = d.value;
  return m;
}

export function num(settings: SettingsMap | undefined, key: string): number {
  const raw = settings?.[key];
  if (raw === undefined || raw === "") {
    const def = SETTING_DEFS.find((d) => d.key === key)?.value;
    return def === undefined || def === "" ? NaN : Number(def);
  }
  return Number(raw);
}

/** Daily running cost per pig: feed + labour + other. The most load-bearing number in the app. */
export function dailyCost(settings: SettingsMap | undefined) {
  const feed = num(settings, "daily_cost_feed");
  const labour = num(settings, "daily_cost_labour");
  const other = num(settings, "daily_cost_other");
  return { feed, labour, other, total: Math.round((feed + labour + other) * 100) / 100 };
}

export async function setSetting(key: string, value: string) {
  await db.setting.put({ key, value, updated_at: nowIso() });
}

export async function seedSettings() {
  const existing = new Set((await db.setting.toArray()).map((s) => s.key));
  const rows = SETTING_DEFS.filter((d) => !existing.has(d.key)).map((d) => ({
    key: d.key,
    value: d.value,
    updated_at: nowIso(),
  }));
  if (rows.length) await db.setting.bulkPut(rows);
}
