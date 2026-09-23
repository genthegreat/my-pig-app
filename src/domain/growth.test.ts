import { describe, expect, it } from "vitest";
import type { Weight } from "@/db/schema";
import { lifetimeAdg, measuredAdg, projectSaleDate, weighSessions } from "./growth";

let n = 0;
const w = (date: string, room: string, kg: number): Weight => ({
  id: `w${++n}`,
  room_id: room,
  date,
  weight_kg: kg,
  basis: "live",
  updated_at: "",
  device_id: "",
});

describe("growth", () => {
  it("lifetime ADG is the gain since an assumed 1.4 kg birth weight", () => {
    // Sample pens: 79 days old averaging 19 kg; 37 days old averaging 8.83 kg
    const older = [15, 17, 18, 20, 21, 23];
    const younger = [7, 8, 8, 9, 10, 11];
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(lifetimeAdg("2026-06-20", "2026-09-07", avg(older))!.kgPerDay).toBeCloseTo(0.223, 3);
    expect(lifetimeAdg("2026-08-01", "2026-09-07", avg(younger))!.kgPerDay).toBeCloseTo(0.201, 3);
  });

  it("groups pen weigh-ins into sessions, latest first", () => {
    const s = weighSessions([w("2026-09-07", "room-7", 10), w("2026-09-07", "room-7", 20), w("2026-08-01", "room-7", 8)]);
    expect(s).toHaveLength(2);
    expect(s[0].date).toBe("2026-09-07");
    expect(s[0].count).toBe(2);
    expect(s[0].avgKg).toBe(15);
  });

  it("measures ADG between the two latest sessions of the same pen", () => {
    const s = weighSessions([w("2026-09-07", "room-7", 18), w("2026-08-08", "room-7", 12)]);
    const adg = measuredAdg(s)!;
    expect(adg.days).toBe(30);
    expect(adg.kgPerDay).toBeCloseTo(0.2, 3);
    expect(adg.basis).toBe("measured");
  });

  it("projects the date a pen reaches market weight", () => {
    const p = projectSaleDate(66, "2026-09-07", 80, {
      kgPerDay: 0.33,
      fromDate: "",
      toDate: "",
      fromKg: 0,
      toKg: 0,
      days: 0,
      basis: "assumed",
    })!;
    expect(p.days).toBe(43); // 14 kg / 0.33 = 42.4 → 43
    expect(p.date).toBe("2026-10-20");
  });
});
