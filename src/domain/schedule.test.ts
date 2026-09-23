import { describe, expect, it } from "vitest";
import type { Schedule } from "@/db/schema";
import { occurrences, payOccurrenceAmount } from "./schedule";

const rule = (o: Partial<Schedule>): Schedule => ({
  id: "s",
  kind: "pay",
  title: "t",
  cadence: "monthly",
  anchor: "2026-09-30",
  active: 1,
  updated_at: "",
  device_id: "",
  ...o,
});

describe("schedule occurrences", () => {
  it("monthly on the last day clamps to short months", () => {
    const s = rule({ cadence: "monthly", anchor: "2026-01-31" });
    expect(occurrences(s, "2026-01-01", "2026-05-31")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
  });

  it("monthly mid-month keeps the day", () => {
    const s = rule({ cadence: "monthly", anchor: "2026-09-15" });
    expect(occurrences(s, "2026-09-01", "2026-11-30")).toEqual(["2026-09-15", "2026-10-15", "2026-11-15"]);
  });

  it("fortnightly steps 14 days from the anchor", () => {
    const s = rule({ cadence: "fortnightly", anchor: "2026-09-16" });
    expect(occurrences(s, "2026-09-01", "2026-10-31")).toEqual(["2026-09-16", "2026-09-30", "2026-10-14", "2026-10-28"]);
  });

  it("skips everything on or before last_done and honours the anchor", () => {
    const s = rule({ cadence: "monthly", anchor: "2026-09-30", last_done: "2026-09-30" });
    expect(occurrences(s, "2026-08-01", "2026-11-30")).toEqual(["2026-10-31", "2026-11-30"]);
    const inactive = rule({ active: 0 });
    expect(occurrences(inactive, "2026-01-01", "2027-01-01")).toEqual([]);
  });
});

describe("month-end pay is the balance after advances", () => {
  const worker = { pay_rate: 2000 };
  const salary = rule({ id: "sched-worker-salary", kind: "pay", employee_id: "emp-worker", pay_kind: "salary", amount: 1400, amount_mode: "balance" });
  const adv = (period: string, amount = 600) => ({ employee_id: "emp-worker", period, amount, kind: "advance" });

  it("K1,400 when the K600 advance was taken", () => {
    const r = payOccurrenceAmount(salary, "2026-09-30", worker, [adv("2026-09")]);
    expect(r.amount).toBe(1400);
    expect(r.explain).toMatch(/K2,000 monthly pay less K600/);
  });

  it("the full K2,000 when nothing was paid that month, less again after two advances", () => {
    expect(payOccurrenceAmount(salary, "2026-10-31", worker, [adv("2026-09")]).amount).toBe(2000);
    expect(payOccurrenceAmount(salary, "2026-10-31", worker, [adv("2026-10"), adv("2026-10", 300)]).amount).toBe(1100);
  });

  it("bonuses do not reduce the balance; other workers' pay is ignored", () => {
    expect(payOccurrenceAmount(salary, "2026-09-30", worker, [{ employee_id: "emp-worker", period: "2026-09", amount: 100, kind: "bonus" }]).amount).toBe(2000);
    expect(payOccurrenceAmount(salary, "2026-09-30", worker, [{ employee_id: "emp-other", period: "2026-09", amount: 600, kind: "advance" }]).amount).toBe(2000);
  });

  it("a fixed rule and a worker without a rate keep the rule's amount", () => {
    expect(payOccurrenceAmount(rule({ kind: "pay", amount: 600, pay_kind: "advance" }), "2026-09-15", worker, [adv("2026-09")]).amount).toBe(600);
    expect(payOccurrenceAmount(salary, "2026-09-30", { pay_rate: undefined }, []).amount).toBe(1400);
  });
});

