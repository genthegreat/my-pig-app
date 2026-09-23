import { describe, expect, it } from "vitest";
import { db } from "@/db/db";
import { regenerateCalendar } from "@/db/calendar";
import { bulkSeed } from "@/db/write";
import type { TableName } from "@/db/schema";
import { addDays } from "@/domain/dates";
import { cashflowByMonth } from "@/domain/cashflow";
import { lineAmount } from "@/domain/sales";
import { seedRows } from "./sample";

const rows = seedRows();

describe("the sample farm hangs together", () => {
  it("has unique ids in every table", () => {
    for (const t of Object.keys(rows) as TableName[]) {
      const ids = (rows[t] as { id: string }[]).map((r) => r.id);
      expect(new Set(ids).size, t).toBe(ids.length);
    }
  });

  it("every sold pig is on a sale line, and every sale line is a pig that was sold", () => {
    const animals = new Map(rows.animal.map((a) => [a.id, a]));
    const sold = rows.animal.filter((a) => a.status === "sold").map((a) => a.id).sort();
    expect(rows.sale_line.map((l) => l.animal_id).sort()).toEqual(sold);
    for (const l of rows.sale_line) expect(animals.get(l.animal_id!)?.status).toBe("sold");
  });

  it("each sale's pigs add up to what was received", () => {
    for (const s of rows.sale) {
      const ls = rows.sale_line.filter((l) => l.sale_id === s.id);
      const sum = ls.reduce((a, l) => a + lineAmount(s, l, ls).amount, 0);
      expect(sum).toBeCloseTo(s.total, 2);
    }
  });

  it("the dead-weight sale shows its dressing percentage and live equivalent", () => {
    const dead = rows.sale.find((s) => s.channel === "dead")!;
    expect(dead.dressing_pct).toBeCloseTo((dead.carcass_kg! / dead.live_kg!) * 100, 5);
    expect(dead.live_equivalent_per_kg).toBeCloseTo(dead.total / dead.live_kg!, 5);
  });

  it("the litter named only by room keeps no dam and is flagged", () => {
    const s4 = rows.litter.find((l) => l.id === "S4")!;
    expect(s4.dam_id).toBeUndefined();
    expect(rows.data_flag.some((f) => f.record_id === "S4")).toBe(true);
    for (const l of rows.litter) expect(l.expected_farrow).toBe(addDays(l.service_date!, 114));
  });

  it("pay is the labour cost, and nothing is paid twice", () => {
    const labour = rows.cost.filter((c) => c.category === "labour");
    expect(rows.payroll.reduce((a, p) => a + p.amount, 0)).toBe(labour.reduce((a, c) => a + c.total, 0));
    expect(new Set(rows.payroll.map((p) => p.cost_id)).size).toBe(labour.length);
  });

  it("keeps capital out of the operating net", () => {
    const cf = cashflowByMonth(rows.sale, rows.cost, "2025-06", "2026-08");
    const june = cf.find((m) => m.month === "2025-06")!;
    expect(june.capital).toBe(8800);
  });
});

describe("the sample farm loads into IndexedDB", () => {
  it("and the calendar shows the pending farrowings without anyone entering them", async () => {
    await db.delete();
    await db.open();
    await db.transaction("rw", (Object.keys(rows) as TableName[]).map((t) => db.table(t)), async () => {
      for (const t of Object.keys(rows) as TableName[]) await bulkSeed(t, rows[t]);
    });
    expect(await db.animal.where("status").equals("active").count()).toBe(14);
    await regenerateCalendar("2026-09-02");
    const farrow = (await db.calendar_entry.where("source").equals("breeding").toArray()).filter((e) => e.id.includes(":farrow:"));
    expect(farrow.map((e) => e.litter_id).sort()).toEqual(["S3", "S4"]);
  });
});
