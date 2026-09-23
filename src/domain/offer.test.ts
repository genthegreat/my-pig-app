import { describe, expect, it } from "vitest";
import { computeOffer, type OfferInputs } from "./offer";

// Sample figures, not any farm's own.
const base: OfferInputs = {
  liveKg: 80,
  pricePerKg: 55,
  channel: "live",
  daysOnFarm: 240,
  dressingPct: 62,
  dailyCost: 15,
  targetPerKg: 60,
  headPricePerKg: 28,
  headPctOfCarcass: 10,
  headsSold: true,
  adg: 0.33,
};

describe("offer calculator", () => {
  it("works out revenue, cost and margin on a live offer", () => {
    const r = computeOffer(base);
    expect(r.revenue).toBeCloseTo(4400, 2); // 80 kg × K55
    expect(r.perLiveKg).toBeCloseTo(55, 2);
    expect(r.cost).toBeCloseTo(3600, 2); // 240 days × K15
    expect(r.margin).toBeCloseTo(800, 2);
    expect(r.breakEvenPerKg).toBeCloseTo(45, 2);
    expect(r.verdict).toBe("hold");
    expect(r.title).toBe("Hold out");
  });

  it("break-even is the cost to raise ÷ live weight", () => {
    expect(computeOffer({ ...base, daysOnFarm: 200 }).breakEvenPerKg).toBeCloseTo((200 * 15) / 80, 2);
  });

  it("crossover growth rate at the K60 target is 0.25 kg/day", () => {
    expect(computeOffer(base).crossoverAdg).toBeCloseTo(0.25, 3);
  });

  it("caps the wait when the pig is gaining below the crossover", () => {
    const r = computeOffer({ ...base, adg: 0.2 });
    // net = 60 × 0.2 − 15 = −3/day; premium = 80 × 5 = 400 → 133 days
    expect(r.netPerDayAtAdg).toBeCloseTo(-3, 2);
    expect(r.maxDaysAtAdg).toBeCloseTo(133.33, 1);
    expect(r.verdict).toBe("hold_days");
    expect(r.title).toBe("Hold — for up to 133 days");
  });

  it("says take it at or above target", () => {
    const r = computeOffer({ ...base, pricePerKg: 60 });
    expect(r.verdict).toBe("take");
  });

  it("says you lose money below break-even", () => {
    const r = computeOffer({ ...base, pricePerKg: 40 });
    expect(r.margin).toBeLessThan(0);
    expect(r.verdict).toBe("lose");
  });

  it("puts a dead-weight offer through the dressing percentage before comparing", () => {
    const r = computeOffer({ ...base, channel: "dead", pricePerKg: 70, liveKg: 82 });
    // 82 × 0.62 = 50.84 kg carcass; heads 10% of that = 5.084 kg at K28
    expect(r.carcassKg).toBeCloseTo(50.84, 2);
    expect(r.headKg).toBeCloseTo(5.084, 2);
    expect(r.revenue).toBeCloseTo(50.84 * 70 + 5.084 * 28, 1);
    expect(r.perLiveKg).toBeCloseTo(45.14, 1);
    expect(r.perLiveKg).toBeLessThan(base.targetPerKg);
  });

  it("leaves the heads out when they are not sold", () => {
    const r = computeOffer({ ...base, channel: "dead", pricePerKg: 70, headsSold: false });
    expect(r.revenue).toBeCloseTo(80 * 0.62 * 70, 2);
  });

  it("marks the row for the chosen growth rate", () => {
    const r = computeOffer(base);
    expect(r.rows.find((x) => x.current)?.adg).toBe(0.33);
    const r2 = computeOffer({ ...base, adg: 0.3 });
    expect(r2.rows.find((x) => x.current)?.adg).toBe(0.3);
  });
});
