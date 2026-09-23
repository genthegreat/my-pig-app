// Ration arithmetic. Every ration carries its diluent AND its basis: a mix
// of "1 bag concentrate to 3 bags meal 3" is 1:1.5 by weight because the bags
// are different sizes (50 kg and 25 kg). See CLAUDE.md.

import type { FeedProduct, Ration } from "@/db/schema";

export interface RationFigures {
  concentrateKg: number;
  diluentKg: number;
  batchKg: number;
  inclusionPct: number; // concentrate share by weight
  byWeightRatio: number; // diluent kg per 1 kg concentrate
  mjPerKg?: number;
  proteinPct?: number;
  costPerKg?: number;
  costPerMj?: number;
  concentrateUnitsPerTonne: number;
  warnings: RationWarning[];
}

export interface RationWarning {
  level: "warn" | "info";
  text: string;
}

// The concentrate's own energy is not on record. 12 MJ/kg is the value that
// gives the standard 1:3 recipes 10.5 / 12.0 / 13.5 MJ/kg with meal 3, hammer meal and maize.
export const ASSUMED_CONCENTRATE_MJ = 12.0;
export const FINISHER_MIN_MJ = 13.0;
export const INCLUSION_RANGE = [20, 40] as const;

export function rationFigures(
  r: Pick<
    Ration,
    | "ratio_concentrate"
    | "ratio_diluent"
    | "ratio_basis"
    | "concentrate_unit_kg"
    | "diluent_unit_kg"
  >,
  concentrate?: FeedProduct,
  diluent?: FeedProduct,
): RationFigures {
  const concUnit =
    r.ratio_basis === "bags" ? (r.concentrate_unit_kg ?? concentrate?.bag_size_kg ?? 0) : 1;
  const dilUnit = r.ratio_basis === "bags" ? (r.diluent_unit_kg ?? diluent?.bag_size_kg ?? 0) : 1;
  const concentrateKg = r.ratio_concentrate * concUnit;
  const diluentKg = r.ratio_diluent * dilUnit;
  const batchKg = concentrateKg + diluentKg;
  const inclusionPct = batchKg > 0 ? (concentrateKg / batchKg) * 100 : 0;
  const byWeightRatio = concentrateKg > 0 ? diluentKg / concentrateKg : 0;

  const concMj = concentrate?.mj_per_kg ?? ASSUMED_CONCENTRATE_MJ;
  const dilMj = diluent?.mj_per_kg;
  const mjPerKg =
    batchKg > 0 && (diluentKg === 0 || dilMj !== undefined)
      ? (concentrateKg * concMj + diluentKg * (dilMj ?? 0)) / batchKg
      : undefined;

  const concProt = concentrate?.protein_pct;
  const dilProt = diluent?.protein_pct;
  const proteinPct =
    batchKg > 0 && concProt !== undefined && (diluentKg === 0 || dilProt !== undefined)
      ? (concentrateKg * concProt + diluentKg * (dilProt ?? 0)) / batchKg
      : undefined;

  const concPricePerKg =
    concentrate?.current_price_per_bag && concentrate.bag_size_kg
      ? concentrate.current_price_per_bag / concentrate.bag_size_kg
      : undefined;
  const dilPricePerKg =
    diluent?.current_price_per_bag && diluent.bag_size_kg
      ? diluent.current_price_per_bag / diluent.bag_size_kg
      : undefined;
  const costPerKg =
    batchKg > 0 && concPricePerKg !== undefined && (diluentKg === 0 || dilPricePerKg !== undefined)
      ? (concentrateKg * concPricePerKg + diluentKg * (dilPricePerKg ?? 0)) / batchKg
      : undefined;
  const costPerMj = costPerKg !== undefined && mjPerKg ? costPerKg / mjPerKg : undefined;

  const concentrateUnitsPerTonne =
    batchKg > 0 && concUnit > 0 ? (1000 / batchKg) * r.ratio_concentrate : 0;

  const warnings: RationWarning[] = [];
  if (concentrate?.kind === "complete" && r.ratio_diluent > 0) {
    warnings.push({
      level: "warn",
      text: `${concentrate.name} is a complete feed. It is balanced already and must not be diluted.`,
    });
  }
  if (concentrate?.kind === "unconfirmed") {
    warnings.push({
      level: "warn",
      text: `Whether ${concentrate.name} is a concentrate or a complete feed is unconfirmed. If it is complete, this dilution is wrong.`,
    });
  }
  if (
    diluent &&
    r.ratio_diluent > 0 &&
    diluent.mj_per_kg !== undefined &&
    diluent.mj_per_kg < 12 &&
    (concentrate?.kind === "concentrate" || concentrate?.kind === "unconfirmed")
  ) {
    warnings.push({
      level: "warn",
      text: `Diluting with ${diluent.name} (~${diluent.mj_per_kg} MJ/kg) rather than maize (~14 MJ/kg). Energy, not protein, is what has been short.`,
    });
  }
  if (r.ratio_diluent > 0 && (inclusionPct < INCLUSION_RANGE[0] || inclusionPct > INCLUSION_RANGE[1])) {
    warnings.push({
      level: "warn",
      text: `Concentrate inclusion is ${inclusionPct.toFixed(0)}%. Concentrates are designed for ${INCLUSION_RANGE[0]}–${INCLUSION_RANGE[1]}%.`,
    });
  }
  if (mjPerKg !== undefined && mjPerKg < FINISHER_MIN_MJ && r.ratio_diluent > 0) {
    warnings.push({
      level: "info",
      text: `About ${mjPerKg.toFixed(1)} MJ/kg. A finishing pig wants ${FINISHER_MIN_MJ}–14 MJ/kg; maize is the only route there.`,
    });
  }
  if (r.ratio_basis === "bags" && concUnit !== dilUnit && r.ratio_diluent > 0) {
    warnings.push({
      level: "info",
      text: `Counted in bags of ${concUnit} kg and ${dilUnit} kg, so 1:${r.ratio_diluent} in bags is 1:${byWeightRatio.toFixed(1)} by weight.`,
    });
  }

  return {
    concentrateKg,
    diluentKg,
    batchKg,
    inclusionPct,
    byWeightRatio,
    mjPerKg,
    proteinPct,
    costPerKg,
    costPerMj,
    concentrateUnitsPerTonne,
    warnings,
  };
}

export function ratioLabel(r: Pick<Ration, "ratio_concentrate" | "ratio_diluent" | "ratio_basis">): string {
  const rc = Number.isInteger(r.ratio_concentrate) ? r.ratio_concentrate : r.ratio_concentrate.toFixed(1);
  const rd = Number.isInteger(r.ratio_diluent) ? r.ratio_diluent : r.ratio_diluent.toFixed(1);
  return `${rc}:${rd} by ${r.ratio_basis === "bags" ? "bags" : "weight"}`;
}
