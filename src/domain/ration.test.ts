import { describe, expect, it } from "vitest";
import type { FeedProduct } from "@/db/schema";
import { rationFigures } from "./ration";

const p = (o: Partial<FeedProduct> & { name: string; kind: FeedProduct["kind"]; bag_size_kg: number }): FeedProduct => ({
  id: o.name,
  active: 1,
  updated_at: "",
  device_id: "",
  ...o,
});

const grower = p({ name: "Grower concentrate", kind: "concentrate", bag_size_kg: 50, mj_per_kg: 12, protein_pct: 38, current_price_per_bag: 700 });
const meal3 = p({ name: "Meal 3", kind: "diluent", bag_size_kg: 25, mj_per_kg: 9.5, protein_pct: 10, current_price_per_bag: 95 });
const hammer = p({ name: "Hammer-mill meal", kind: "diluent", bag_size_kg: 10, mj_per_kg: 12, protein_pct: 11, current_price_per_bag: 55 });
const maize = p({ name: "Maize", kind: "diluent", bag_size_kg: 50, mj_per_kg: 14, protein_pct: 8.5, current_price_per_bag: 350 });
const creep = p({ name: "Creep feed", kind: "complete", bag_size_kg: 25 });

describe("ration arithmetic: the standard recipes, at sample prices", () => {
  it("1 x 50 kg conc : 3 x 25 kg meal 3", () => {
    const f = rationFigures({ ratio_concentrate: 1, ratio_diluent: 3, ratio_basis: "bags" }, grower, meal3);
    expect(f.batchKg).toBe(125);
    expect(f.inclusionPct).toBeCloseTo(40, 1);
    expect(f.byWeightRatio).toBeCloseTo(1.5, 2);
    expect(f.mjPerKg).toBeCloseTo(10.5, 1);
    expect(f.proteinPct).toBeCloseTo(21.2, 1);
    expect(f.costPerKg).toBeCloseTo(7.88, 2);
    expect(f.costPerMj).toBeCloseTo(0.75, 3);
    expect(f.concentrateUnitsPerTonne).toBeCloseTo(8.0, 1);
  });

  it("1 x 50 kg conc : 3 x 35 kg hammer meal (current)", () => {
    const f = rationFigures(
      { ratio_concentrate: 1, ratio_diluent: 3, ratio_basis: "bags", concentrate_unit_kg: 50, diluent_unit_kg: 35 },
      grower,
      hammer,
    );
    expect(f.batchKg).toBe(155);
    expect(f.inclusionPct).toBeCloseTo(32.3, 1);
    expect(f.mjPerKg).toBeCloseTo(12.0, 1);
    expect(f.proteinPct).toBeCloseTo(19.7, 1);
    expect(f.costPerKg).toBeCloseTo(8.24, 2);
    expect(f.costPerMj).toBeCloseTo(0.687, 3);
    expect(f.concentrateUnitsPerTonne).toBeCloseTo(6.5, 1);
  });

  it("1 x 50 kg conc : 3 x 50 kg maize", () => {
    const f = rationFigures({ ratio_concentrate: 1, ratio_diluent: 3, ratio_basis: "bags" }, grower, maize);
    expect(f.batchKg).toBe(200);
    expect(f.inclusionPct).toBeCloseTo(25, 1);
    expect(f.mjPerKg).toBeCloseTo(13.5, 1);
    expect(f.proteinPct).toBeCloseTo(15.9, 1);
    expect(f.costPerKg).toBeCloseTo(8.75, 2);
    expect(f.costPerMj).toBeCloseTo(0.648, 3);
    expect(f.concentrateUnitsPerTonne).toBeCloseTo(5.0, 1);
  });

  it("a ratio by weight ignores bag sizes", () => {
    const f = rationFigures({ ratio_concentrate: 1, ratio_diluent: 3, ratio_basis: "weight" }, grower, meal3);
    expect(f.inclusionPct).toBeCloseTo(25, 1);
    expect(f.byWeightRatio).toBe(3);
  });

  it("warns when a complete feed is given a dilution ratio", () => {
    const f = rationFigures({ ratio_concentrate: 1, ratio_diluent: 3, ratio_basis: "bags" }, creep, meal3);
    expect(f.warnings.some((w) => /complete feed/.test(w.text))).toBe(true);
  });

  it("warns when a concentrate is diluted with bran rather than maize", () => {
    const f = rationFigures({ ratio_concentrate: 1, ratio_diluent: 3, ratio_basis: "bags" }, grower, meal3);
    expect(f.warnings.some((w) => /rather than maize/.test(w.text))).toBe(true);
    const g = rationFigures({ ratio_concentrate: 1, ratio_diluent: 3, ratio_basis: "bags" }, grower, maize);
    expect(g.warnings.some((w) => /rather than maize/.test(w.text))).toBe(false);
  });

  it("warns when inclusion leaves the 20-40% design range", () => {
    const f = rationFigures({ ratio_concentrate: 1, ratio_diluent: 5, ratio_basis: "bags" }, grower, meal3);
    // 50 / 175 = 28.6% — in range
    expect(f.warnings.some((w) => /inclusion/.test(w.text))).toBe(false);
    const g = rationFigures({ ratio_concentrate: 1, ratio_diluent: 10, ratio_basis: "bags" }, grower, meal3);
    expect(g.warnings.some((w) => /inclusion/.test(w.text))).toBe(true);
  });
});
