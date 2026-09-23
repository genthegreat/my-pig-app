import { describe, expect, it } from "vitest";
import { computeSale, dressingPct, liveEquivalentPerKg, meanDressing } from "./sales";

describe("sale arithmetic", () => {
  // Four sample sales with both weights: 62.0, 60.0, 62.0, 65.0 — mean 62.3
  const measured = [
    { live: 100, carcass: 62, total: 4340, eq: 43.4, pct: 62.0 },
    { live: 240, carcass: 144, total: 9792, eq: 40.8, pct: 60.0 },
    { live: 236, carcass: 146.4, total: 10364, eq: 43.92, pct: 62.0 },
    { live: 80, carcass: 52, total: 3640, eq: 45.5, pct: 65.0 },
  ];

  it("reproduces the measured dressing percentages", () => {
    for (const m of measured) expect(dressingPct(m.live, m.carcass)).toBeCloseTo(m.pct, 1);
    expect(meanDressing(measured.map((m) => dressingPct(m.live, m.carcass)!))).toBeCloseTo(62.3, 1);
  });

  it("reproduces the live-equivalent prices of every dead sale", () => {
    for (const m of measured) expect(liveEquivalentPerKg(m.total, m.live)).toBeCloseTo(m.eq, 2);
  });

  it("never compares dead weight to live weight without dressing", () => {
    expect(liveEquivalentPerKg(4340, undefined)).toBeUndefined();
    expect(dressingPct(undefined, 76)).toBeUndefined();
  });

  it("computes a dead sale with heads sold", () => {
    const f = computeSale({
      channel: "dead",
      liveKg: 236,
      carcassKg: 146.4,
      pricePerKg: 68,
      headKg: 14.6,
      headSold: true,
      headPricePerKg: 28,
      trottersSold: false,
    });
    expect(f.carcassTotal).toBeCloseTo(9955.2, 2);
    expect(f.headTotal).toBeCloseTo(408.8, 2);
    expect(f.total).toBeCloseTo(10364, 2);
    expect(f.dressingPct).toBeCloseTo(62.0, 1);
    expect(f.liveEquivalentPerKg).toBeCloseTo(10364 / 236, 2);
  });

  it("computes a live sale price from a lump sum", () => {
    const f = computeSale({ channel: "live", liveKg: 52, headSold: false, trottersSold: false, totalOverride: 3000 });
    expect(f.total).toBe(3000);
    expect(f.livePricePerKg).toBeCloseTo(57.69, 2);
    expect(f.liveEquivalentPerKg).toBeUndefined();
  });
});
