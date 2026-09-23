"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { useAnimals, useSettings, useToday } from "@/db/hooks";
import { FEED_KIND_LABEL } from "@/db/schema";
import { num } from "@/db/settings";
import { Computed, Page, SectionTitle } from "@/components/ui";
import { fmtDate, fmtK, fmtK2, fmtKg, fmtNum, fmtPct, plural } from "@/domain/format";
import { feedForecast, feedRequirement } from "@/domain/herd";
import { rationFigures, ratioLabel } from "@/domain/ration";
import { bagsForOccurrence, feedNeedByProduct, nextOccurrence, productRunOut } from "@/domain/schedule";
import type { ProductNeed } from "@/domain/schedule";
import { CADENCE_LABEL } from "@/db/schema";

export default function FeedPage() {
  const today = useToday();
  const settings = useSettings();
  const animals = useAnimals();
  const products = useLiveQuery(() => db.feed_product.toArray(), []);
  const rations = useLiveQuery(() => db.ration.toArray(), []);
  const groups = useLiveQuery(() => db.group.toArray(), []);
  const litters = useLiveQuery(() => db.litter.toArray(), []);
  const purchases = useLiveQuery(() => db.feed_purchase.orderBy("date").reverse().limit(8).toArray(), []);
  const schedules = useLiveQuery(() => db.schedule.where("kind").equals("feed").toArray(), []);

  const productMap = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);
  const groupName = (id?: string) => (id ? (groups?.find((g) => g.id === id)?.name ?? id) : "Whole farm");
  const active = (rations ?? []).filter((r) => !r.effective_to || r.effective_to >= today).sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  const past = (rations ?? []).filter((r) => r.effective_to && r.effective_to < today).sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));

  const req = animals && litters ? feedRequirement(animals, litters, settings, today) : undefined;
  const need = useMemo<Map<string, ProductNeed>>(
    () => (rations && groups && animals && litters ? feedNeedByProduct(rations, productMap, groups, animals, litters, settings, today) : new Map()),
    [rations, groups, animals, litters, productMap, settings, today],
  );
  const forecast = products && req ? feedForecast(products, req.kgPerDay, today) : undefined;

  return (
    <Page
      title="Feed"
      back="/more/"
      right={
        <Link href="/feed/purchase/" className="btn sm primary">
          + Purchase
        </Link>
      }
    >
      <section>
        <SectionTitle href="/feed/ration/" action="New ration ›">
          Rations
        </SectionTitle>
        <div className="stack mt">
          {active.map((r) => {
            const conc = r.concentrate_id ? productMap.get(r.concentrate_id) : undefined;
            const dil = r.diluent_id ? productMap.get(r.diluent_id) : undefined;
            const f = rationFigures(r, conc, dil);
            return (
              <div key={r.id} className="card">
                <div className="between">
                  <div>
                    <div className="eyebrow">{groupName(r.group_id)}</div>
                    <h3>
                      {conc?.name ?? "—"} : {dil?.name ?? "no diluent"}
                    </h3>
                  </div>
                  <span className="badge accent">{ratioLabel(r)}</span>
                </div>
                <div className="small muted">
                  since {fmtDate(r.effective_from)}
                  {r.ratio_basis === "bags" ? ` · units of ${f.concentrateKg / r.ratio_concentrate} kg and ${r.ratio_diluent ? f.diluentKg / r.ratio_diluent : 0} kg` : ""}
                </div>
                <div className="kpis mt">
                  <div className="kpi">
                    <span className="k">Batch</span>
                    <span className="v">{fmtKg(f.batchKg, 0)}</span>
                    <span className="n">{fmtPct(f.inclusionPct, 0)} concentrate · 1:{f.byWeightRatio.toFixed(1)} by weight</span>
                  </div>
                  <div className="kpi">
                    <span className="k">Energy</span>
                    <span className="v">{f.mjPerKg !== undefined ? `${f.mjPerKg.toFixed(1)} MJ` : "—"}</span>
                    <span className="n">{f.proteinPct !== undefined ? `~${fmtPct(f.proteinPct)} protein (assumed)` : "protein unknown"}</span>
                  </div>
                  <div className="kpi">
                    <span className="k">Cost</span>
                    <span className="v">
                      {f.costPerKg !== undefined ? (
                        <Computed
                          value={`${fmtK2(f.costPerKg)}/kg`}
                          formula="(conc kg × conc K/kg + diluent kg × diluent K/kg) ÷ batch kg"
                          inputs={[
                            { label: conc?.name ?? "Concentrate", value: `${fmtKg(f.concentrateKg, 0)} at ${fmtK(conc?.current_price_per_bag)}/${conc?.bag_size_kg} kg` },
                            { label: dil?.name ?? "Diluent", value: `${fmtKg(f.diluentKg, 0)} at ${fmtK(dil?.current_price_per_bag)}/${dil?.bag_size_kg} kg` },
                          ]}
                          note={f.costPerMj !== undefined ? `${fmtK2(f.costPerMj)} per MJ · ${f.concentrateUnitsPerTonne.toFixed(1)} concentrate bags per tonne` : undefined}
                        />
                      ) : (
                        "—"
                      )}
                    </span>
                    <span className="n">{f.costPerMj !== undefined ? `${fmtK2(f.costPerMj)}/MJ` : "price missing"}</span>
                  </div>
                </div>
                {f.warnings.map((w, i) => (
                  <div key={i} className={`card ${w.level === "warn" ? "warn" : "soft"} small mt`} style={{ padding: "8px 12px" }}>
                    {w.level === "warn" ? "⚠ " : "ℹ "}
                    {w.text}
                  </div>
                ))}
                {r.notes && <p className="small muted mt">{r.notes}</p>}
              </div>
            );
          })}
          {active.length === 0 && <div className="card empty small">No ration on record.</div>}
        </div>
        {past.length > 0 && (
          <details className="plain mt">
            <summary>{plural(past.length, "earlier ration")}</summary>
            <div className="card small">
              {past.map((r) => (
                <div key={r.id} className="stat-line">
                  <span className="k">
                    {fmtDate(r.effective_from)} – {fmtDate(r.effective_to)} · {groupName(r.group_id)}
                  </span>
                  <span className="v">
                    {productMap.get(r.concentrate_id ?? "")?.name ?? "—"} : {productMap.get(r.diluent_id ?? "")?.name ?? "—"} {ratioLabel(r)}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      <section>
        <SectionTitle>Feed on hand</SectionTitle>
        <div className="card mt">
          {req && forecast && (
            <div className="kpis">
              <div className="kpi">
                <span className="k">Herd needs</span>
                <span className="v">
                  <Computed
                    value={`${fmtKg(req.kgPerDay, 1)}/day`}
                    formula="adults × 2.2 kg + lactating sows × (2.5 kg + 0.25 kg per piglet)"
                    inputs={req.lines.map((l) => ({ label: l.label, value: `${l.head} × ${fmtKg(l.kgEach, 2)} = ${fmtKg(l.kg, 1)}` }))}
                    note={`${req.pigletsOnSows} piglets on the sow eat creep, bought separately and not counted here.`}
                  />
                </span>
                <span className="n">
                  {req.adults} adults · {req.lactatingSows} lactating
                </span>
              </div>
              <div className="kpi">
                <span className="k">On hand</span>
                <span className="v">{fmtKg(forecast.kgOnHand, 0)}</span>
                <span className="n">{forecast.products.map((p) => `${fmtNum(p.product.bags_on_hand)} × ${p.product.name.split(" (")[0]}`).join(", ") || "no stock count yet"}</span>
              </div>
              <div className={`kpi ${forecast.daysLeft !== undefined && forecast.daysLeft < 7 ? "hero" : ""}`}>
                <span className="k">Runs out</span>
                <span className={`v ${forecast.daysLeft !== undefined && forecast.daysLeft < 7 ? "danger" : ""}`}>
                  {forecast.daysLeft !== undefined ? `${Math.floor(forecast.daysLeft)} days` : "—"}
                </span>
                <span className="n">{forecast.runsOutOn ? `about ${fmtDate(forecast.runsOutOn)} · on the calendar` : "count the bags on each product to forecast"}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      <section>
        <SectionTitle href="/schedule/" action="Schedule ›">
          Buying schedule
        </SectionTitle>
        <div className="card tight mt">
          {!schedules?.filter((s) => s.active).length ? (
            <div className="empty small">
              No buying rhythm set. Add one under Schedule and the calendar will say when to buy and how many bags — worked out from the rations the herd is on.
            </div>
          ) : (
            <div className="list">
              {schedules
                .filter((s) => s.active)
                .map((s) => {
                  const product = s.product_id ? productMap.get(s.product_id) : undefined;
                  const n = s.product_id ? need.get(s.product_id) : undefined;
                  const bags = bagsForOccurrence(s, n);
                  const unit = product?.unit_label === "bucket" ? "bucket" : "bag";
                  const next = nextOccurrence(s, today);
                  const runOut = product && n ? productRunOut(product, n, today) : undefined;
                  const late = runOut && next && runOut.date < next;
                  return (
                    <Link key={s.id} href="/schedule/" className="row" style={{ alignItems: "flex-start" }}>
                      <div className="body">
                        <div className="title">{product?.name ?? s.title}</div>
                        <div className="sub" style={{ whiteSpace: "normal" }}>
                          {CADENCE_LABEL[s.cadence]} · next {fmtDate(next)} · {bags !== undefined ? `${bags} ${unit}${bags === 1 ? "" : "s"}` : "quantity not set"}
                          {n && product?.current_price_per_bag && bags ? ` · ~${fmtK(bags * product.current_price_per_bag)}` : ""}
                        </div>
                        {runOut && (
                          <div className={`sub ${late ? "danger" : ""}`} style={{ whiteSpace: "normal" }}>
                            {late ? "⚠ " : ""}
                            {fmtNum(product?.bags_on_hand)} on hand runs out ~{fmtDate(runOut.date)}
                            {late ? ` — before the next buy. Bring it forward.` : "."}
                          </div>
                        )}
                      </div>
                      <span className="chev">›</span>
                    </Link>
                  );
                })}
            </div>
          )}
        </div>
      </section>

      <section>
        <SectionTitle href="/feed/product/" action="+ Product">
          Products
        </SectionTitle>
        <div className="card tight mt">
          <div className="list">
            {(products ?? [])
              .filter((p) => p.active)
              .map((p) => (
                <Link key={p.id} href={`/feed/product/?id=${p.id}`} className="row">
                  <div className="body">
                    <div className="title">{p.name}</div>
                    <div className="sub">
                      {FEED_KIND_LABEL[p.kind]} · <b>{p.bag_size_kg} kg</b> {p.unit_label ?? "bag"}
                      {p.mj_per_kg ? ` · ${p.mj_per_kg} MJ/kg` : ""}
                      {p.bags_on_hand !== undefined ? ` · ${p.bags_on_hand} on hand` : ""}
                    </div>
                  </div>
                  <div className="trail">
                    <div className="v">{fmtK(p.current_price_per_bag)}</div>
                    <div className="tiny muted">{p.current_price_per_bag ? `${fmtK2(p.current_price_per_bag / p.bag_size_kg)}/kg` : ""}</div>
                  </div>
                  <span className="chev">›</span>
                </Link>
              ))}
          </div>
        </div>
        <p className="tiny faint mt">Bag sizes belong to the product and are copied onto each purchase. Meal 3 is 25 kg — assuming 50 doubled every kilogram figure for sixteen months.</p>
      </section>

      <section>
        <SectionTitle href="/feed/purchase/" action="Record ›">
          Purchases
        </SectionTitle>
        <div className="card tight mt">
          {!purchases?.length ? (
            <div className="empty small">
              No purchases in bags yet. Historic feed bought: {fmtKg(num(settings, "historic_feed_kg"), 0)} for {fmtK(num(settings, "historic_feed_cost"))} — {fmtK2(num(settings, "historic_feed_cost") / num(settings, "historic_feed_kg"))}/kg.
            </div>
          ) : (
            <div className="list">
              {purchases.map((p) => (
                <div key={p.id} className="row">
                  <div className="body">
                    <div className="title">
                      {fmtNum(p.bags)} × {productMap.get(p.product_id)?.name ?? p.product_id}
                    </div>
                    <div className="sub">
                      {fmtDate(p.date)} · {fmtKg(p.bags * p.bag_size_kg, 0)} · {fmtK(p.price_per_bag)}/bag{p.supplier ? ` · ${p.supplier}` : ""}
                    </div>
                  </div>
                  <div className="trail">
                    <div className="v">{fmtK(p.total)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </Page>
  );
}
