"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { animalLabel, roomLabel, useAnimal, useAnimalMap, useRoomMap, useRooms, useToday } from "@/db/hooks";
import { STAGE_LABEL } from "@/db/schema";
import { useToast } from "@/components/AppShell";
import { TagSwatch } from "@/components/tags";
import { ExitSheet, MoveSheet, StageSheet } from "@/components/sheets";
import { ChannelBadge, Computed, Page } from "@/components/ui";
import { ageDays, fmtAge } from "@/domain/dates";
import { fmtDate, fmtK, fmtK2, fmtKg, plural } from "@/domain/format";
import { lifetimeAdg, measuredAdg, weighSessions } from "@/domain/growth";
import { daysOnFarm } from "@/domain/herd";
import { lineAmount } from "@/domain/sales";
import { useSettings } from "@/db/hooks";
import { dailyCost } from "@/db/settings";

export default function AnimalDetailPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const id = useSearchParams().get("id");
  const animal = useAnimal(id);
  const today = useToday();
  const rooms = useRoomMap();
  const roomList = useRooms();
  const animals = useAnimalMap();
  const router = useRouter();
  const { toast } = useToast();
  const settings = useSettings();
  const [sheet, setSheet] = useState<"move" | "stage" | "exit" | null>(null);

  const data = useLiveQuery(async () => {
    if (!id) return undefined;
    const [weights, occupancy, stages, health, litters, sired, saleLines, flags] = await Promise.all([
      db.weight.where("animal_id").equals(id).toArray(),
      db.room_occupancy.where("animal_id").equals(id).toArray(),
      db.stage_change.where("animal_id").equals(id).toArray(),
      db.health_event.where("animal_id").equals(id).toArray(),
      db.litter.where("dam_id").equals(id).toArray(),
      db.litter.where("sire_id").equals(id).toArray(),
      db.sale_line.where("animal_id").equals(id).toArray(),
      db.data_flag.where("record_id").equals(id).toArray(),
    ]);
    const sale = saleLines[0] ? await db.sale.get(saleLines[0].sale_id) : undefined;
    const allLines = sale ? await db.sale_line.where("sale_id").equals(sale.id).toArray() : [];
    // Pen weigh-ins taken while this pig stood in that room.
    const penWeights = (
      await Promise.all(
        occupancy.map(async (o) => {
          const ws = await db.weight.where("room_id").equals(o.room_id).toArray();
          return ws.filter((w) => !w.animal_id && w.date >= o.moved_in && (!o.moved_out || w.date <= o.moved_out));
        }),
      )
    ).flat();
    return { weights, occupancy, stages, health, litters, sired, saleLines, sale, allLines, flags, penWeights };
  }, [id]);

  const own = useMemo(() => weighSessions(data?.weights ?? []), [data]);
  // A pen weigh-in describes the pen's growing stock. A sow or boar standing
  // in the same pen as piglets is not part of that average.
  const penApplies = !!animal && ["piglet_creep", "weaner", "grower", "finisher"].includes(animal.stage);
  const pen = useMemo(() => (penApplies ? weighSessions(data?.penWeights ?? []) : []), [data, penApplies]);

  if (animal === undefined) return <Page title="…" back="/animals/">{null}</Page>;
  if (animal === null) {
    return (
      <Page title="Not found" back="/animals/">
        <div className="empty">No pig with that id.</div>
      </Page>
    );
  }
  const a = animal;
  const dam = a.dam_id ? animals.get(a.dam_id) : undefined;
  const sire = a.sire_id ? animals.get(a.sire_id) : undefined;
  const age = ageDays(a.birth_date, today);
  const latest = own[0] ?? pen[0];
  const adg = measuredAdg(own.length >= 2 ? own : pen);
  const lifetime = latest && a.birth_date ? lifetimeAdg(a.birth_date, latest.date, latest.avgKg) : undefined;
  const days = daysOnFarm(a, today);
  const growing = a.stage === "weaner" || a.stage === "grower" || a.stage === "finisher";
  const fetched = data?.sale && data.saleLines[0] ? lineAmount(data.sale, data.saleLines[0], data.allLines) : undefined;
  const runningCost = fetched && days !== undefined ? days * dailyCost(settings).total : undefined;

  return (
    <Page
      title={animalLabel(a)}
      back="/animals/"
      right={
        <Link href={`/animals/edit/?id=${a.id}`} className="btn sm soft">
          Edit
        </Link>
      }
    >
      {a.status === "sold" && data?.sale && fetched && (
        <Link href={`/sales/detail/?id=${data.sale.id}`} className="card accent">
          <div className="eyebrow">Sold for</div>
          <div className="between" style={{ alignItems: "flex-end" }}>
            <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.05 }} className="num">
              {fetched.basis === "exact" ? "" : "≈"}
              {fmtK(fetched.amount)}
            </div>
            <div className="right small" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <div className="bold">{fmtDate(data.sale.date)}</div>
              <ChannelBadge channel={data.sale.channel} size="md" />
            </div>
          </div>
          <div className="small muted mt" style={{ marginTop: 6 }}>
            {fetched.basis === "exact"
              ? data.sale.channel === "dead"
                ? `${fmtKg(data.saleLines[0].carcass_kg, 2)} carcass at ${fmtK2(data.sale.price_per_kg)}/kg${data.sale.head_sold ? " plus a share of the heads" : ""}`
                : `${fmtKg(data.saleLines[0].live_kg)} live at ${fmtK2(data.sale.price_per_kg ?? data.sale.total / (data.saleLines[0].live_kg ?? 1))}/kg`
              : fetched.basis === "by_weight"
                ? `Its share by weight of ${fmtK(data.sale.total)} for ${data.sale.head}`
                : `An even share of ${fmtK(data.sale.total)} for ${data.sale.head} — no weight per pig was recorded`}
            {data.sale.live_equivalent_per_kg ? ` · ${fmtK2(data.sale.live_equivalent_per_kg)}/kg live${data.sale.channel === "dead" ? " equivalent" : ""}` : ""}
            {runningCost !== undefined ? ` · running cost to raise ≈ ${fmtK(runningCost)} (${days} days × ${fmtK2(dailyCost(settings).total)})` : ""}
          </div>
        </Link>
      )}

      <div className="card">
        <div className="hstack" style={{ alignItems: "flex-start" }}>
          <TagSwatch colour={a.tag_colour} size="lg" />
          <div className="grow">
            <div className="hstack wrap" style={{ gap: 6 }}>
              <span className="badge accent">{STAGE_LABEL[a.stage]}</span>
              {a.status !== "active" && <span className="badge danger">{a.status}</span>}
              {a.sex && <span className="badge">{a.sex === "male" ? (a.castrated ? "castrated male" : "male") : "female"}</span>}
              {a.breed && <span className="badge">{a.breed}</span>}
            </div>
            <div className="mt small">
              {a.tag_colour ? <>Tag <b>{a.tag_colour}</b></> : <span className="muted">No tag colour recorded</span>}
              {a.name ? <> · {a.name}</> : null}
            </div>
          </div>
        </div>
        <div className="mt stack-sm small">
          <div className="stat-line">
            <span className="k">Room</span>
            <span className="v">{a.status === "active" ? roomLabel(rooms, a.current_room) : "—"}</span>
          </div>
          <div className="stat-line">
            <span className="k">{a.origin === "purchased" ? "Bought" : "Born"}</span>
            <span className="v">
              {a.origin === "purchased" ? fmtDate(a.purchase_date) : fmtDate(a.birth_date)}
              {age !== undefined ? ` · ${fmtAge(age)}` : ""}
            </span>
          </div>
          {a.origin === "purchased" && (
            <div className="stat-line">
              <span className="k">From</span>
              <span className="v">
                {a.origin_detail ?? "—"}
                {a.purchase_cost ? ` · ${fmtK(a.purchase_cost)}` : ""}
              </span>
            </div>
          )}
          {(dam || sire || a.litter_id) && (
            <div className="stat-line">
              <span className="k">Parents</span>
              <span className="v">
                {dam ? <Link href={`/animals/detail/?id=${dam.id}`} style={{ color: "var(--accent)" }}>{animalLabel(dam)}</Link> : "dam unknown"}
                {" × "}
                {sire ? <Link href={`/animals/detail/?id=${sire.id}`} style={{ color: "var(--accent)" }}>{animalLabel(sire)}</Link> : "sire off-farm"}
                {a.litter_id ? (
                  <>
                    {" · "}
                    <Link href={`/breeding/litter/?id=${a.litter_id}`} style={{ color: "var(--accent)" }}>
                      {a.litter_id}
                    </Link>
                  </>
                ) : null}
              </span>
            </div>
          )}
          {a.status !== "active" && (
            <div className="stat-line">
              <span className="k">Left the farm</span>
              <span className="v">
                {fmtDate(a.exit_date)}
                {a.exit_reason ? ` · ${a.exit_reason}` : ""}
              </span>
            </div>
          )}
          {days !== undefined && (
            <div className="stat-line">
              <span className="k">Days on farm</span>
              <span className="v">{days}</span>
            </div>
          )}
        </div>
        {a.notes && <p className="mt small muted">{a.notes}</p>}
      </div>

      {data?.flags?.filter((f) => !f.resolved_on).map((f) => (
        <Link key={f.id} href="/flags/" className="card warn small">
          ⚠ {f.issue}
        </Link>
      ))}

      {a.status === "active" && (
        <div className="grid-3">
          <button type="button" className="btn" onClick={() => setSheet("move")}>
            Move room
          </button>
          <button type="button" className="btn" onClick={() => setSheet("stage")}>
            Change stage
          </button>
          <button type="button" className="btn" onClick={() => setSheet("exit")}>
            Sold / died
          </button>
          <Link href={`/weigh/?animal=${a.id}${a.current_room ? `&room=${a.current_room}` : ""}`} className="btn">
            Weigh
          </Link>
          <Link href={`/health/new/?animal=${a.id}`} className="btn">
            Log health
          </Link>
          {growing || a.stage === "gilt" ? (
            <Link href={`/offer/?animal=${a.id}`} className="btn primary">
              Offer
            </Link>
          ) : a.sex === "female" ? (
            <Link href={`/breeding/service/?dam=${a.id}`} className="btn primary">
              Served
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}

      <section className="card">
        <h2>Weight</h2>
        {!latest && data?.saleLines[0]?.live_kg ? (
          <p className="muted small">
            Never weighed on the farm. At sale on {fmtDate(data.sale?.date)}: <b>{fmtKg(data.saleLines[0].live_kg)}</b> live
            {data.saleLines[0].carcass_kg ? `, ${fmtKg(data.saleLines[0].carcass_kg, 2)} carcass` : ""}.
          </p>
        ) : !latest ? (
          <p className="muted small">No weight on record. Weigh the pen and it appears here.</p>
        ) : (
          <>
            <div className="kpis">
              <div className="kpi hero">
                <span className="k">{own[0] ? "Latest weight" : "Pen average"}</span>
                <span className="v">{fmtKg(latest.avgKg)}</span>
                <span className="n">
                  {fmtDate(latest.date)}
                  {!own[0] ? ` · ${plural(latest.count, "pig")} weighed, ${fmtKg(latest.minKg, 0)}–${fmtKg(latest.maxKg, 0)}` : ""}
                </span>
              </div>
              {adg && (
                <div className="kpi">
                  <span className="k">Daily gain</span>
                  <span className="v">
                    <Computed
                      value={`${adg.kgPerDay.toFixed(3)} kg`}
                      formula="(latest − previous) ÷ days between"
                      inputs={[
                        { label: "Previous", value: `${fmtKg(adg.fromKg)} on ${fmtDate(adg.fromDate)}` },
                        { label: "Latest", value: `${fmtKg(adg.toKg)} on ${fmtDate(adg.toDate)}` },
                        { label: "Days", value: String(adg.days) },
                      ]}
                      note={own.length >= 2 ? "Measured on this pig." : "Measured on the pen average; composition may have changed."}
                    />
                  </span>
                  <span className="n">between the last two weighings</span>
                </div>
              )}
              {lifetime && (
                <div className="kpi">
                  <span className="k">Lifetime gain</span>
                  <span className="v">
                    <Computed
                      value={`${lifetime.kgPerDay.toFixed(3)} kg`}
                      formula="(weight − 1.4 kg birth weight) ÷ age"
                      inputs={[
                        { label: "Weight", value: fmtKg(lifetime.toKg) },
                        { label: "Age", value: `${lifetime.days} days` },
                      ]}
                      note="Context only. Lifetime gain rises with age; never compare a weaner's to a finisher's."
                    />
                  </span>
                  <span className="n">context only</span>
                </div>
              )}
            </div>
            <div className="mt small">
              {[...own, ...pen.filter((p) => !own.some((o) => o.date === p.date))]
                .sort((x, y) => (x.date < y.date ? 1 : -1))
                .slice(0, 8)
                .map((s) => (
                  <div key={s.date + (s.roomId ?? "")} className="stat-line">
                    <span className="k">
                      {fmtDate(s.date)} {s.weights[0]?.animal_id ? "" : `· ${roomLabel(rooms, s.roomId)} pen`}
                    </span>
                    <span className="v">
                      {fmtKg(s.avgKg)}
                      {s.count > 1 ? ` avg of ${s.count}` : ""}
                    </span>
                  </div>
                ))}
            </div>
          </>
        )}
      </section>

      {(data?.litters?.length || data?.sired?.length) ? (
        <section className="card">
          <h2>Breeding</h2>
          <div className="small">
            {[...(data?.litters ?? []), ...(data?.sired ?? [])]
              .sort((x, y) => ((x.service_date ?? x.actual_farrow ?? "") < (y.service_date ?? y.actual_farrow ?? "") ? 1 : -1))
              .map((l) => (
                <Link key={l.id} href={`/breeding/litter/?id=${l.id}`} className="stat-line">
                  <span className="k">
                    {l.id} · {l.outcome === "farrowed" ? `farrowed ${fmtDate(l.actual_farrow)}` : l.outcome === "pending" ? `due ${fmtDate(l.expected_farrow)}` : l.outcome}
                  </span>
                  <span className="v">{l.born_alive !== undefined ? `${l.born_alive} born` : "›"}</span>
                </Link>
              ))}
          </div>
        </section>
      ) : null}

      {data?.sale && (
        <section className="card">
          <h2>Sale</h2>
          <Link href={`/sales/detail/?id=${data.sale.id}`} className="stat-line">
            <span className="k">
              {fmtDate(data.sale.date)} <ChannelBadge channel={data.sale.channel} />
              {data.saleLines[0]?.live_kg ? ` · ${fmtKg(data.saleLines[0].live_kg)} live` : ""}
              {data.saleLines[0]?.carcass_kg ? ` · ${fmtKg(data.saleLines[0].carcass_kg, 2)} carcass` : ""}
            </span>
            <span className="v">
              {fmtK(data.sale.total)}
              {data.sale.head > 1 ? ` for ${data.sale.head}` : ""}
              {data.sale.live_equivalent_per_kg ? ` · ${fmtK2(data.sale.live_equivalent_per_kg)}/kg live` : ""}
            </span>
          </Link>
        </section>
      )}

      <section className="card">
        <h2>History</h2>
        <div className="small">
          {[
            ...(data?.stages ?? []).map((s) => ({
              date: s.date,
              text: `${STAGE_LABEL[s.to_stage]}${s.from_stage ? ` (from ${STAGE_LABEL[s.from_stage]})` : ""}${s.reason ? ` — ${s.reason}` : ""}`,
              kind: "stage",
            })),
            ...(data?.occupancy ?? []).map((o) => ({
              date: o.moved_in,
              text: `Moved into ${roomLabel(rooms, o.room_id)}${o.moved_out ? ` until ${fmtDate(o.moved_out)}` : ""}`,
              kind: "room",
            })),
            ...(data?.health ?? []).map((h) => ({
              date: h.date,
              text: `${h.type}${h.product ? ` · ${h.product}` : ""}${h.dose ? ` ${h.dose}` : ""}${h.notes ? ` — ${h.notes}` : ""}`,
              kind: "health",
            })),
          ]
            .sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0))
            .map((h, i) => (
              <div key={i} className="stat-line">
                <span className="k">{fmtDate(h.date)}</span>
                <span className="v" style={{ fontWeight: 500 }}>
                  {h.text}
                </span>
              </div>
            ))}
          {!data?.stages?.length && !data?.occupancy?.length && !data?.health?.length && (
            <p className="muted">Nothing recorded yet.</p>
          )}
        </div>
      </section>

      <MoveSheet open={sheet === "move"} onClose={() => setSheet(null)} animal={a} rooms={roomList ?? []} roomMap={rooms} onDone={() => toast("Moved")} />
      <StageSheet open={sheet === "stage"} onClose={() => setSheet(null)} animal={a} onDone={() => toast("Stage updated")} />
      <ExitSheet
        open={sheet === "exit"}
        onClose={() => setSheet(null)}
        animal={a}
        onDone={(status) => {
          toast(status === "sold" ? "Marked sold — record the sale under Money › Sales" : "Recorded");
          if (status === "sold") router.push(`/sales/new/?animal=${a.id}`);
        }}
      />
    </Page>
  );
}
