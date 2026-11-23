"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { useActiveAnimals, useRoomMap, useSettings, useToday } from "@/db/hooks";
import { num } from "@/db/settings";
import { Computed, Page, SectionTitle } from "@/components/ui";
import { cashflowByMonth, type CashflowMonth } from "@/domain/cashflow";
import { addDays, addMonths, monthKey } from "@/domain/dates";
import { fmtDate, fmtK, fmtK2, fmtMonth, plural } from "@/domain/format";

const GROWING = new Set(["weaner", "grower", "finisher"]);

export default function CashflowPage() {
  const today = useToday();
  const settings = useSettings();
  const animals = useActiveAnimals();
  const rooms = useRoomMap();
  const sales = useLiveQuery(() => db.sale.toArray(), []);
  const costs = useLiveQuery(() => db.cost.toArray(), []);
  const planned = useLiveQuery(async () => {
    const until = addDays(today, 30);
    return (await db.calendar_entry.toArray()).filter((e) => !e.done && e.date <= until && (e.source === "schedule" || e.source === "projection"));
  }, [today]);
  const [open, setOpen] = useState<string | null>(null);

  const thisMonth = monthKey(today);
  const firstMonth = useMemo(() => {
    const dates = [...(sales ?? []).map((s) => s.date), ...(costs ?? []).map((c) => c.date)].sort();
    return dates[0] ? monthKey(dates[0]) : thisMonth;
  }, [sales, costs, thisMonth]);
  const all = useMemo(() => (sales && costs ? cashflowByMonth(sales, costs, firstMonth, thisMonth) : []), [sales, costs, firstMonth, thisMonth]);
  const shown = all.slice(-13); // the last twelve months plus this one
  const current = all.find((m) => m.month === thisMonth);
  const last = all.find((m) => m.month === addMonths(thisMonth, -1));
  const maxBar = Math.max(1, ...shown.map((m) => Math.max(m.salesIn, m.running + m.capital)));
  const totals = all.reduce(
    (t, m) => ({ salesIn: t.salesIn + m.salesIn, running: t.running + m.running, capital: t.capital + m.capital }),
    { salesIn: 0, running: 0, capital: 0 },
  );

  // Next 30 days: the schedule says what goes out; the growth projections say
  // which pens could be sold, valued at the target price (a stretch, so labelled).
  const out30 = (planned ?? []).filter((e) => e.source === "schedule");
  const outTotal = out30.reduce((s, e) => s + (e.amount ?? 0), 0);
  const target = num(settings, "target_price_per_kg");
  const targetKg = num(settings, "target_market_weight_kg");
  const bestLive = num(settings, "best_live_price_per_kg");
  const in30 = (planned ?? [])
    .filter((e) => e.source === "projection" && e.room_id)
    .map((e) => {
      const head = (animals ?? []).filter((a) => a.current_room === e.room_id && GROWING.has(a.stage)).length;
      return { entry: e, head, amount: head * targetKg * target };
    })
    .filter((x) => x.head > 0);
  const inTotal = in30.reduce((s, x) => s + x.amount, 0);

  return (
    <Page title="Cash flow" back="/costs/">
      <div className="kpis">
        <div className="kpi hero">
          <span className="k">{fmtMonth(thisMonth)} so far</span>
          <span className={`v ${current && current.net < 0 ? "danger" : ""}`}>{fmtK(current?.net ?? 0)}</span>
          <span className="n">
            in {fmtK(current?.salesIn ?? 0)} · out {fmtK(current?.running ?? 0)}
            {current?.capital ? ` · capital ${fmtK(current.capital)}` : ""}
          </span>
        </div>
        <div className="kpi">
          <span className="k">{last ? fmtMonth(last.month) : "Last month"}</span>
          <span className={`v ${last && last.net < 0 ? "danger" : ""}`}>{fmtK(last?.net ?? 0)}</span>
          <span className="n">
            in {fmtK(last?.salesIn ?? 0)} · out {fmtK(last?.running ?? 0)}
          </span>
        </div>
      </div>

      <section>
        <SectionTitle href="/schedule/" action="Schedule ›">
          Next 30 days
        </SectionTitle>
        <div className="card mt">
          <div className="kpis">
            <div className="kpi">
              <span className="k">Going out</span>
              <span className="v">{fmtK(outTotal)}</span>
              <span className="n">
                {out30.filter((e) => e.short === "Pay").length} paydays · {out30.filter((e) => e.short !== "Pay").length} feed buys
              </span>
            </div>
            <div className="kpi">
              <span className="k">Could come in</span>
              <span className="v">
                <Computed
                  value={fmtK(inTotal)}
                  formula="pigs at market weight × target weight × target price"
                  inputs={in30.map((x) => ({
                    label: `${rooms.get(x.entry.room_id!)?.label ?? x.entry.room_id} · ${fmtDate(x.entry.date)}`,
                    value: `${plural(x.head, "pig")} × ${targetKg} kg × ${fmtK2(target)} = ${fmtK(x.amount)}`,
                  }))}
                  note={`At the K${target} target. At the best live price so far (${fmtK2(bestLive)}) it is ${fmtK(inTotal * (bestLive / target))}. Nothing comes in until a buyer is found.`}
                />
              </span>
              <span className="n">{in30.length ? `${in30.length} pen${in30.length === 1 ? "" : "s"} reaching ~${targetKg} kg` : "no pen reaches market weight"}</span>
            </div>
          </div>
          {out30.length > 0 && (
            <div className="small mt">
              {out30
                .slice()
                .sort((a, b) => (a.date < b.date ? -1 : 1))
                .map((e) => (
                  <div key={e.id} className="stat-line">
                    <span className="k">
                      {fmtDate(e.date)} · {e.title.replace(/ \(~K[\d,]+\)$/, "").replace(/ K[\d,]+$/, "")}
                    </span>
                    <span className="v">{fmtK(e.amount)}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </section>

      <section>
        <SectionTitle>By month</SectionTitle>
        <div className="card mt">
          <div className="legend mb">
            <span>
              <span className="bar in" style={{ width: 14 }} /> in (sales)
            </span>
            <span>
              <span className="bar out" style={{ width: 14 }} /> out (running)
            </span>
            <span>
              <span className="bar capital" style={{ width: 14 }} /> capital
            </span>
          </div>
          <div className="stack-sm">
            {shown.map((m) => (
              <MonthRow key={m.month} m={m} maxBar={maxBar} current={m.month === thisMonth} open={open === m.month} onToggle={() => setOpen(open === m.month ? null : m.month)} />
            ))}
          </div>
          <p className="tiny faint mt">
            Sales on the day the money came; costs on the day recorded — the historic lines carry a month only. Net is sales minus running costs. Tap a month for the breakdown.
          </p>
        </div>
      </section>

      <section className="card small">
        <div className="eyebrow">Since {fmtMonth(firstMonth)}</div>
        <div className="stat-line">
          <span className="k">Sales</span>
          <span className="v">{fmtK(totals.salesIn)}</span>
        </div>
        <div className="stat-line">
          <span className="k">Running costs</span>
          <span className="v">{fmtK(totals.running)}</span>
        </div>
        <div className="stat-line">
          <span className="k">Operating net</span>
          <span className={`v ${totals.salesIn - totals.running < 0 ? "danger" : "ok"}`}>{fmtK(totals.salesIn - totals.running)}</span>
        </div>
        <div className="stat-line">
          <span className="k">Capital (pen, breeding stock)</span>
          <span className="v">{fmtK(totals.capital)}</span>
        </div>
        <div className="stat-line">
          <span className="k">After capital</span>
          <span className={`v ${totals.salesIn - totals.running - totals.capital < 0 ? "danger" : "ok"}`}>{fmtK(totals.salesIn - totals.running - totals.capital)}</span>
        </div>
        <p className="muted mt">
          The herd itself is not counted: {plural((animals ?? []).length, "pig")} on the farm are the money that has not come in yet.{" "}
          <Link href="/offer/" style={{ color: "var(--accent)", fontWeight: 700 }}>
            Offer calculator ›
          </Link>
        </p>
      </section>
    </Page>
  );
}

function MonthRow({ m, maxBar, current, open, onToggle }: { m: CashflowMonth; maxBar: number; current: boolean; open: boolean; onToggle: () => void }) {
  const w = (n: number) => `${Math.max(n > 0 ? 1 : 0, (n / maxBar) * 100)}%`;
  return (
    <div>
      <button type="button" className={`chart-row ${current ? "now" : ""}`} onClick={onToggle} aria-expanded={open} style={{ width: "100%", background: "none", border: 0, padding: 0, textAlign: "left" }}>
        <span className="lbl">{fmtMonth(m.month).replace(" 20", " ’")}</span>
        <span className="bars baseline">
          <span className="bar in" style={{ width: w(m.salesIn) }} />
          <span style={{ display: "flex", gap: 2 }}>
            <span className="bar out" style={{ width: w(m.running), borderRadius: m.capital ? 0 : undefined }} />
            {m.capital > 0 && <span className="bar capital" style={{ width: w(m.capital) }} />}
          </span>
        </span>
        <span className={`val ${m.net < 0 ? "danger" : "ok"}`}>
          {m.net > 0 ? "+" : ""}
          {fmtK(m.net)}
        </span>
      </button>
      {open && (
        <div className="computed-panel small" style={{ marginTop: 4 }}>
          <dl>
            <dt>Sales</dt>
            <dd>
              {fmtK(m.salesIn)} ({plural(m.sales, "sale")})
            </dd>
            <dt>Feed</dt>
            <dd>{fmtK(m.feed)}</dd>
            <dt>Labour</dt>
            <dd>{fmtK(m.labour)}</dd>
            <dt>Other running</dt>
            <dd>{fmtK(m.other)}</dd>
            <dt>Capital</dt>
            <dd>{fmtK(m.capital)}</dd>
            <dt>Net after capital</dt>
            <dd>{fmtK(m.netAfterCapital)}</dd>
            <dt>Operating balance to date</dt>
            <dd>{fmtK(m.cumulative)}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}
