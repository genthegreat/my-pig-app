"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { useAnimals, useSettings, useToday } from "@/db/hooks";
import { COST_CATEGORY_LABEL, type CostCategory } from "@/db/schema";
import { dailyCost, setSetting } from "@/db/settings";
import { useToast } from "@/components/AppShell";
import { Computed, Confirm, Page, SectionTitle } from "@/components/ui";
import { addDays, addMonths, monthKey } from "@/domain/dates";
import { fmtDate, fmtK, fmtK2, fmtMonth, fmtNum } from "@/domain/format";
import { monthlyRunningCost } from "@/domain/herd";

export default function CostsPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const params = useSearchParams();
  const today = useToday();
  const { toast } = useToast();
  const settings = useSettings();
  const animals = useAnimals();
  const costs = useLiveQuery(() => db.cost.toArray(), []);
  const [month, setMonth] = useState(params.get("m") ?? monthKey(today));
  const [confirmUse, setConfirmUse] = useState(false);
  const upcoming = useLiveQuery(async () => {
    const until = addDays(today, 30);
    return (await db.calendar_entry.where("source").equals("schedule").toArray()).filter((e) => !e.done && e.date <= until);
  }, [today]);
  const upcomingTotal = (upcoming ?? []).reduce((s, e) => s + (e.amount ?? 0), 0);

  const inMonth = useMemo(
    () => (costs ?? []).filter((c) => c.date.slice(0, 7) === month).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? -1 : 1)),
    [costs, month],
  );
  const opex = inMonth.filter((c) => !c.is_capital).reduce((s, c) => s + c.total, 0);
  const capex = inMonth.filter((c) => c.is_capital).reduce((s, c) => s + c.total, 0);
  const byCategory = useMemo(() => {
    const m = new Map<CostCategory, number>();
    for (const c of inMonth) m.set(c.category, (m.get(c.category) ?? 0) + c.total);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [inMonth]);

  const allTime = (costs ?? []).reduce((s, c) => s + c.total, 0);
  const allCapex = (costs ?? []).filter((c) => c.is_capital).reduce((s, c) => s + c.total, 0);

  // Running cost per pig per day from actual spend over the last three complete months.
  const recent = useMemo(() => {
    if (!costs || !animals) return [];
    const months = [3, 2, 1].map((n) => addMonths(monthKey(today), -n));
    return months.map((m) => monthlyRunningCost(m, costs, animals, today)).filter((r) => r.pigDays > 0 && r.spend.feed + r.spend.labour + r.spend.other > 0);
  }, [costs, animals, today]);
  const avg = recent.length
    ? {
        feed: recent.reduce((s, r) => s + r.perPigDay.feed, 0) / recent.length,
        labour: recent.reduce((s, r) => s + r.perPigDay.labour, 0) / recent.length,
        other: recent.reduce((s, r) => s + r.perPigDay.other, 0) / recent.length,
      }
    : undefined;
  const constant = dailyCost(settings);

  const useComputed = async () => {
    if (!avg) return;
    await setSetting("daily_cost_feed", avg.feed.toFixed(2));
    await setSetting("daily_cost_labour", avg.labour.toFixed(2));
    await setSetting("daily_cost_other", avg.other.toFixed(2));
    setConfirmUse(false);
    toast("Daily cost updated");
  };

  return (
    <Page
      title="Money"
      back="/more/"
      right={
        <Link href="/costs/new/" className="btn sm primary">
          + Cost
        </Link>
      }
    >
      <div className="grid-2">
        <Link href="/cashflow/" className="btn lg">
          📈 Cash flow
        </Link>
        <Link href="/sales/" className="btn lg">
          🤝 Sales
        </Link>
      </div>
      <Link href="/schedule/" className="card soft between">
        <div>
          <div className="eyebrow">Coming up, next 30 days</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{fmtK(upcomingTotal)}</div>
          <div className="small muted">
            {(upcoming ?? []).length ? `${(upcoming ?? []).filter((e) => e.short === "Pay").length} paydays · ${(upcoming ?? []).filter((e) => e.short !== "Pay").length} feed buys` : "nothing scheduled"}
          </div>
        </div>
        <span style={{ fontSize: 24 }}>›</span>
      </Link>

      <div className="between">
        <button type="button" className="btn sm" onClick={() => setMonth(addMonths(month, -1))}>
          ‹
        </button>
        <h2>{fmtMonth(month)}</h2>
        <button type="button" className="btn sm" onClick={() => setMonth(addMonths(month, 1))} disabled={month >= monthKey(today)}>
          ›
        </button>
      </div>

      <div className="kpis">
        <div className="kpi hero">
          <span className="k">Running costs</span>
          <span className="v">{fmtK(opex)}</span>
          <span className="n">feed, labour, vet, bedding…</span>
        </div>
        <div className="kpi">
          <span className="k">Capital</span>
          <span className="v">{fmtK(capex)}</span>
          <span className="n">stock and construction — never in cost-per-pig</span>
        </div>
      </div>

      {byCategory.length > 0 && (
        <div className="card small">
          {byCategory.map(([cat, total]) => (
            <div key={cat} className="stat-line">
              <span className="k">{COST_CATEGORY_LABEL[cat]}</span>
              <span className="v">{fmtK(total)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card tight">
        {inMonth.length === 0 ? (
          <div className="empty small">Nothing recorded for {fmtMonth(month)}.</div>
        ) : (
          <div className="list">
            {inMonth.map((c) => (
              <Link key={c.id} href={`/costs/new/?id=${c.id}`} className="row">
                <div className="body">
                  <div className="title">{c.item}</div>
                  <div className="sub">
                    {COST_CATEGORY_LABEL[c.category]}
                    {c.date_precision === "month" ? "" : ` · ${fmtDate(c.date)}`}
                    {c.supplier ? ` · ${c.supplier}` : ""}
                    {c.is_capital ? " · capital" : ""}
                    {c.payment_status === "pending" ? " · unpaid" : ""}
                    {c.confidence && c.confidence !== "high" ? ` · ${c.confidence} confidence` : ""}
                  </div>
                </div>
                <div className="trail">
                  <div className="v">{fmtK(c.total)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <section>
        <SectionTitle>Cost per pig per day</SectionTitle>
        <div className="card mt">
          <div className="between">
            <div>
              <div className="eyebrow">In use</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>
                <Computed
                  value={fmtK2(constant.total)}
                  formula="feed + labour + other"
                  inputs={[
                    { label: "Feed", value: fmtK2(constant.feed) },
                    { label: "Labour", value: fmtK2(constant.labour) },
                    { label: "Bedding, vet, power", value: fmtK2(constant.other) },
                  ]}
                  note="Drives break-even, margin and hold-or-sell. Editable under Settings."
                />
              </div>
            </div>
            <Link href="/settings/" className="btn sm">
              Edit
            </Link>
          </div>
          {avg && (
            <>
              <hr className="sep" />
              <div className="between">
                <div>
                  <div className="eyebrow">From actual spend, last {recent.length} months</div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>
                    <Computed
                      value={fmtK2(avg.feed + avg.labour + avg.other)}
                      formula="Σ non-capital spend in month ÷ pig-days in month, averaged"
                      inputs={recent.map((r) => ({
                        label: fmtMonth(r.month),
                        value: `${fmtK(r.spend.feed + r.spend.labour + r.spend.other)} ÷ ${fmtNum(r.pigDays)} pig-days (avg ${fmtNum(r.avgHead, 1)} head) = ${fmtK2(r.perPigDay.total)}`,
                      }))}
                      note={`Feed ${fmtK2(avg.feed)} · labour ${fmtK2(avg.labour)} · other ${fmtK2(avg.other)}. Pig-days count every pig on the farm each day, piglets included. Capital excluded: ${fmtK(recent.reduce((s, r) => s + r.capitalExcluded, 0))}.`}
                    />
                  </div>
                </div>
                <button type="button" className="btn sm" onClick={() => setConfirmUse(true)}>
                  Use this
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <p className="tiny faint">
        All time: {fmtK(allTime)} recorded, of which {fmtK(allCapex)} is capital. Month-only dates in the historic import show without a day.
      </p>

      <Confirm
        open={confirmUse}
        onClose={() => setConfirmUse(false)}
        onConfirm={useComputed}
        title="Replace the daily cost figure?"
        body={avg ? `Feed ${fmtK2(avg.feed)} + labour ${fmtK2(avg.labour)} + other ${fmtK2(avg.other)} = ${fmtK2(avg.feed + avg.labour + avg.other)} per pig per day, replacing ${fmtK2(constant.total)}.` : ""}
        confirmLabel="Replace"
      />
    </Page>
  );
}
