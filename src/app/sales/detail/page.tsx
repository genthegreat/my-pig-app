"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { animalLabel, useAnimalMap, useSettings } from "@/db/hooks";
import { dailyCost } from "@/db/settings";
import { ChannelBadge, Computed, Page } from "@/components/ui";
import { fmtDate, fmtK, fmtK2, fmtKg, fmtPct, plural } from "@/domain/format";
import { daysOnFarm } from "@/domain/herd";
import { lineAmount } from "@/domain/sales";

export default function SaleDetailPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const id = useSearchParams().get("id") ?? "";
  const settings = useSettings();
  const sale = useLiveQuery(() => db.sale.get(id), [id]);
  const lines = useLiveQuery(() => db.sale_line.where("sale_id").equals(id).toArray(), [id]);
  const client = useLiveQuery(async () => (sale?.client_id ? db.client.get(sale.client_id) : undefined), [sale?.client_id]);
  const flags = useLiveQuery(() => db.data_flag.where("record_id").equals(id).toArray(), [id]);
  const animals = useAnimalMap();

  if (!sale) return <Page title="…" back="/sales/">{null}</Page>;
  const s = sale;
  const c = dailyCost(settings);

  // Margin against running cost only: days on farm × daily cost, per animal where known.
  const costed = (lines ?? [])
    .map((l) => {
      const a = l.animal_id ? animals.get(l.animal_id) : undefined;
      const days = a ? daysOnFarm(a, s.date) : undefined;
      return { line: l, animal: a, days, cost: days !== undefined ? days * c.total : undefined };
    })
    .filter((x) => x.cost !== undefined);
  const totalCost = costed.length === s.head ? costed.reduce((sum, x) => sum + (x.cost ?? 0), 0) : undefined;

  return (
    <Page title={s.description ?? "Sale"} back="/sales/">
      {flags?.filter((f) => !f.resolved_on).map((f) => (
        <Link key={f.id} href="/flags/" className="card warn small">
          ⚠ {f.issue}
        </Link>
      ))}
      <div className="kpis">
        <div className="kpi hero">
          <span className="k">Received</span>
          <span className="v">{fmtK(s.total)}</span>
          <span className="n hstack wrap" style={{ gap: 6 }}>
            <ChannelBadge channel={s.channel} size="md" />
            <span>
              {fmtDate(s.date)} · {plural(s.head, "pig")}
              {client ? ` · ${client.name}` : ""}
            </span>
          </span>
        </div>
        {s.channel === "dead" ? (
          <div className="kpi">
            <span className="k">Per live kg</span>
            <span className={`v ${s.live_equivalent_per_kg ? "" : "muted"}`}>
              {s.live_equivalent_per_kg ? (
                <Computed
                  value={fmtK2(s.live_equivalent_per_kg)}
                  formula="total ÷ live kg"
                  inputs={[
                    { label: "Total", value: fmtK2(s.total) },
                    { label: "Live weight", value: fmtKg(s.live_kg) },
                  ]}
                  note="The only figure comparable with a live sale."
                />
              ) : (
                "not weighed live"
              )}
            </span>
            <span className="n">live-equivalent price</span>
          </div>
        ) : (
          <div className="kpi">
            <span className="k">Per live kg</span>
            <span className="v">{s.live_equivalent_per_kg ? fmtK2(s.live_equivalent_per_kg) : "—"}</span>
            <span className="n">{s.live_kg ? `${fmtKg(s.live_kg)} live` : "weight not recorded"}</span>
          </div>
        )}
        {s.dressing_pct !== undefined && (
          <div className="kpi">
            <span className="k">Dressing</span>
            <span className="v">
              <Computed
                value={fmtPct(s.dressing_pct)}
                formula="carcass kg ÷ live kg"
                inputs={[
                  { label: "Carcass", value: fmtKg(s.carcass_kg, 2) },
                  { label: "Live", value: fmtKg(s.live_kg) },
                ]}
                note="Carcasses here exclude head and trotters."
              />
            </span>
            <span className="n">measured on this sale</span>
          </div>
        )}
        {totalCost !== undefined && (
          <div className="kpi">
            <span className="k">Margin</span>
            <span className={`v ${s.total - totalCost >= 0 ? "ok" : "danger"}`}>
              <Computed
                value={fmtK(s.total - totalCost)}
                formula="received − Σ (days on farm × daily running cost)"
                inputs={costed.map((x) => ({ label: animalLabel(x.animal), value: `${x.days} days × ${fmtK2(c.total)} = ${fmtK(x.cost)}` }))}
                note="Running cost only. Breeding stock and the pen build sit outside it."
              />
            </span>
            <span className="n">over running cost of {fmtK(totalCost)}</span>
          </div>
        )}
      </div>

      <div className="card small">
        {s.channel === "dead" && (
          <>
            <div className="stat-line">
              <span className="k">Carcass</span>
              <span className="v">
                {fmtKg(s.carcass_kg, 2)} × {fmtK2(s.price_per_kg)} = {fmtK(s.carcass_total)}
              </span>
            </div>
            <div className="stat-line">
              <span className="k">Heads</span>
              <span className="v">
                {s.head_kg ? fmtKg(s.head_kg, 2) : "—"} · {s.head_sold ? `sold at ${fmtK(s.head_price_per_kg)}/kg = ${fmtK(s.head_total)}` : "given away"}
              </span>
            </div>
            <div className="stat-line">
              <span className="k">Trotters</span>
              <span className="v">{s.trotters_kg ? `${fmtKg(s.trotters_kg, 2)} · ${s.trotters_sold ? "sold" : "not sold"}` : "—"}</span>
            </div>
          </>
        )}
        <div className="stat-line">
          <span className="k">Live weight</span>
          <span className="v">{s.live_kg ? fmtKg(s.live_kg) : "not recorded"}</span>
        </div>
        <div className="stat-line">
          <span className="k">Payment</span>
          <span className="v">
            {s.payment_status ?? "—"}
            {s.amount_paid !== undefined && s.amount_paid !== s.total ? ` · ${fmtK(s.amount_paid)} received` : ""}
          </span>
        </div>
        {s.notes && <p className="mt muted">{s.notes}</p>}
      </div>

      {lines && lines.length > 0 && (
        <div className="card tight">
          <div className="list">
            {lines.map((l) => {
              const a = l.animal_id ? animals.get(l.animal_id) : undefined;
              const got = lineAmount(s, l, lines);
              return (
                <Link key={l.id} href={a ? `/animals/detail/?id=${a.id}` : "#"} className="row">
                  <div className="body">
                    <div className="title">{a ? animalLabel(a) : "Unrecorded pig"}</div>
                    <div className="sub">
                      {l.live_kg ? `${fmtKg(l.live_kg)} live` : ""}
                      {l.live_kg && l.carcass_kg ? " · " : ""}
                      {l.carcass_kg ? `${fmtKg(l.carcass_kg, 2)} carcass` : ""}
                      {l.head_kg ? ` · head ${fmtKg(l.head_kg, 2)}` : ""}
                    </div>
                  </div>
                  <div className="trail">
                    <div className="v">
                      {got.basis === "exact" ? "" : "≈"}
                      {fmtK(got.amount)}
                    </div>
                    {got.basis !== "exact" && <div className="tiny muted">{got.basis === "by_weight" ? "by weight" : "even share"}</div>}
                  </div>
                  <span className="chev">›</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </Page>
  );
}
