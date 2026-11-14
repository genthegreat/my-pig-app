"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { animalLabel, useActiveAnimals, useRooms, useSettings, useToday } from "@/db/hooks";
import { dailyCost, num } from "@/db/settings";
import { ChannelBadge, Checkbox, Computed, Field, NumInput, Page, Select } from "@/components/ui";
import { daysBetween } from "@/domain/dates";
import { fmtDate, fmtK, fmtK2, fmtKg, fmtNum } from "@/domain/format";
import { measuredAdg, weighSessions } from "@/domain/growth";
import { daysOnFarm } from "@/domain/herd";
import { computeOffer } from "@/domain/offer";

export default function OfferPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const params = useSearchParams();
  const today = useToday();
  const settings = useSettings();
  const animals = useActiveAnimals();
  const rooms = useRooms();
  const weights = useLiveQuery(() => db.weight.toArray(), []);
  const occupancy = useLiveQuery(() => db.room_occupancy.toArray(), []);
  const sales = useLiveQuery(() => db.sale.orderBy("date").reverse().toArray(), []);

  const [animalId, setAnimalId] = useState(params.get("animal") ?? "");
  const [roomId, setRoomId] = useState(params.get("room") ?? "");
  const [weight, setWeight] = useState("80");
  const [price, setPrice] = useState("60");
  const [channel, setChannel] = useState<"live" | "dead">("live");
  const [days, setDays] = useState("240");
  const [headsSold, setHeadsSold] = useState(true);
  const [adg, setAdg] = useState("");
  const [dress, setDress] = useState("");
  const [cost, setCost] = useState("");
  const [target, setTarget] = useState("");
  const [headPrice, setHeadPrice] = useState("");
  const [adgSource, setAdgSource] = useState<string>("");

  const c = dailyCost(settings);
  const s = {
    dress: dress !== "" ? Number(dress) : num(settings, "dressing_pct"),
    cost: cost !== "" ? Number(cost) : c.total,
    target: target !== "" ? Number(target) : num(settings, "target_price_per_kg"),
    headPrice: headPrice !== "" ? Number(headPrice) : num(settings, "head_price_per_kg"),
    headPct: num(settings, "head_pct_of_carcass"),
    defaultAdg: num(settings, "default_adg_kg"),
  };

  const growing = useMemo(() => (animals ?? []).filter((a) => a.stage !== "piglet_creep"), [animals]);
  const animal = growing.find((a) => a.id === animalId);
  const effectiveRoom = roomId || animal?.current_room || "";

  // Prefill from the pig / pen: latest weight, days on farm, measured gain.
  useEffect(() => {
    if (!weights || !occupancy) return;
    if (animal) {
      const d = daysOnFarm(animal, today);
      if (d !== undefined) setDays(String(d));
    }
    if (!effectiveRoom) return;
    const ids = new Set(animal ? [animal.id] : (animals ?? []).filter((a) => a.current_room === effectiveRoom).map((a) => a.id));
    const since = occupancy.filter((o) => o.room_id === effectiveRoom && !o.moved_out && ids.has(o.animal_id)).map((o) => o.moved_in).sort()[0] ?? "";
    const own = animal ? weighSessions(weights.filter((w) => w.animal_id === animal.id)) : [];
    const penApplies = !animal || ["piglet_creep", "weaner", "grower", "finisher", "gilt"].includes(animal.stage);
    const pen = penApplies ? weighSessions(weights.filter((w) => w.room_id === effectiveRoom && !w.animal_id && w.date >= since)) : [];
    const latest = own[0] ?? pen[0];
    if (latest) setWeight(String(Math.round(latest.avgKg)));
    if (!animal && !animalId) {
      const occ = (animals ?? []).filter((a) => a.current_room === effectiveRoom);
      const ds = occ.map((a) => daysOnFarm(a, today)).filter((x): x is number => x !== undefined);
      if (ds.length) setDays(String(Math.round(ds.reduce((a, b) => a + b, 0) / ds.length)));
    }
    const m = measuredAdg(own.length >= 2 ? own : pen);
    if (m && m.kgPerDay > 0) {
      setAdg(m.kgPerDay.toFixed(3));
      setAdgSource(`measured ${fmtDate(m.fromDate)} → ${fmtDate(m.toDate)}`);
    } else {
      setAdg("");
      setAdgSource(latest ? `one weigh-in only (${fmtDate(latest.date)}); assumed` : "");
    }
  }, [animal, animalId, effectiveRoom, weights, occupancy, animals, today]);

  const g = adg !== "" ? Number(adg) : s.defaultAdg;
  const r = computeOffer({
    liveKg: Number(weight) || 0,
    pricePerKg: Number(price) || 0,
    channel,
    daysOnFarm: Number(days) || 0,
    dressingPct: s.dress,
    dailyCost: s.cost,
    targetPerKg: s.target,
    headPricePerKg: s.headPrice,
    headPctOfCarcass: s.headPct,
    headsSold,
    adg: g,
  });

  const achieved = (sales ?? []).filter((x) => x.live_equivalent_per_kg).slice(0, 6);
  const best = num(settings, "best_live_price_per_kg");

  return (
    <Page title="Kwacha per kilo" back="/">
      <p className="small muted">A buyer is in front of you with a number. What is it worth, and does holding on beat taking it?</p>

      <div className="card stack-sm">
        <div className="grid-2">
          <Field label="Pig">
            <Select value={animalId} onChange={(v) => { setAnimalId(v); if (v) setRoomId(""); }} placeholder="Any / by hand" options={growing.map((a) => ({ value: a.id, label: animalLabel(a) }))} />
          </Field>
          <Field label="Or pen">
            <Select value={roomId} onChange={(v) => { setRoomId(v); if (v) setAnimalId(""); }} placeholder="—" options={(rooms ?? []).filter((x) => x.active).map((x) => ({ value: x.id, label: x.label }))} />
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Live weight">
            <NumInput value={weight} onChange={setWeight} unit="kg" big />
          </Field>
          <Field label="Price offered">
            <NumInput value={price} onChange={setPrice} unit="K/kg" big step={0.5} />
          </Field>
        </div>
        <Field label="Price is on">
          <div className="hstack" style={{ gap: 8 }}>
            <button type="button" className={`btn grow chan-pick ${channel === "live" ? "on-live" : ""}`} aria-pressed={channel === "live"} onClick={() => setChannel("live")}>
              <ChannelBadge channel="live" size="md" />
            </button>
            <button type="button" className={`btn grow chan-pick ${channel === "dead" ? "on-dead" : ""}`} aria-pressed={channel === "dead"} onClick={() => setChannel("dead")}>
              <ChannelBadge channel="dead" size="md" />
            </button>
          </div>
        </Field>
        {channel === "dead" && (
          <Checkbox checked={headsSold} onChange={setHeadsSold}>
            Heads sold too, at {fmtK(s.headPrice)}/kg
          </Checkbox>
        )}
        <div className="grid-2">
          <Field label="Days on farm">
            <NumInput value={days} onChange={setDays} unit="days" step={1} />
          </Field>
          <Field label="Still gaining" hint={adgSource || `assumed ${s.defaultAdg} kg/day`}>
            <NumInput value={adg} onChange={setAdg} unit="kg/day" step={0.01} placeholder={String(s.defaultAdg)} />
          </Field>
        </div>
      </div>

      <div className={`verdict ${r.verdict === "lose" ? "lose" : r.verdict === "take" ? "take" : "hold"}`}>
        <h2>{r.title}</h2>
        <p>{r.body}</p>
        <p className="fine">{r.fine}</p>
      </div>

      <div className="kpis">
        <div className="kpi hero">
          <span className="k">You&apos;d receive</span>
          <span className="v">{fmtK(r.revenue)}</span>
          <span className="n">{r.revenueNote}</span>
        </div>
        <div className="kpi">
          <span className="k">Per live kg</span>
          <span className="v">
            <Computed
              value={fmtK2(r.perLiveKg)}
              formula={channel === "dead" ? "(carcass kg × price + heads) ÷ live kg" : "price offered"}
              inputs={
                channel === "dead"
                  ? [
                      { label: "Carcass", value: `${fmtKg(Number(weight))} × ${s.dress}% = ${fmtKg(r.carcassKg)}` },
                      { label: "Heads", value: headsSold ? `${fmtKg(r.headKg)} (${s.headPct}% of carcass) × ${fmtK(s.headPrice)}` : "not sold" },
                      { label: "Received", value: fmtK(r.revenue) },
                    ]
                  : [{ label: "Offer", value: `${fmtK2(Number(price))} per live kg` }]
              }
              note={channel === "dead" ? "Dead weight is never comparable with live weight until it has been through the dressing percentage." : "the only figure worth comparing"}
            />
          </span>
          <span className="n">{channel === "dead" ? "what the carcass price really pays you" : "the only figure worth comparing"}</span>
        </div>
        <div className="kpi">
          <span className="k">Cost to raise</span>
          <span className="v">
            <Computed
              value={fmtK(r.cost)}
              formula="days on farm × daily running cost"
              inputs={[
                { label: "Days", value: days },
                { label: "Per day", value: `${fmtK2(s.cost)} (feed ${fmtK2(c.feed)} + labour ${fmtK2(c.labour)} + other ${fmtK2(c.other)})` },
              ]}
              note="Running cost only. Breeding stock and the pen build sit outside it."
            />
          </span>
          <span className="n">
            {days} days at {fmtK2(s.cost)}
          </span>
        </div>
        <div className="kpi">
          <span className="k">Margin</span>
          <span className={`v ${r.margin >= 0 ? "ok" : "danger"}`}>{fmtK(r.margin)}</span>
          <span className="n">{r.marginPctOfCost !== null ? `${Math.round(r.marginPctOfCost)}% over cost` : ""}</span>
        </div>
        <div className="kpi">
          <span className="k">Break-even</span>
          <span className="v">
            <Computed
              value={fmtK2(r.breakEvenPerKg)}
              formula="cost to raise ÷ live kg"
              inputs={[
                { label: "Cost", value: fmtK(r.cost) },
                { label: "Live weight", value: fmtKg(Number(weight)) },
              ]}
            />
          </span>
          <span className="n">per live kg — below this you lose</span>
        </div>
      </div>

      <div className="card">
        <div className="eyebrow">Hold or sell — how long you can afford to wait</div>
        <p className="small muted mt">Waiting costs {fmtK2(s.cost)} of feed and labour every day, but the pig also grows. Whether holding pays depends on how fast it is still gaining.</p>
        <div className="tbl-wrap mt">
          <table className="tbl">
            <thead>
              <tr>
                <th>Daily gain</th>
                <th>Value / day</th>
                <th>Net / day</th>
                <th>Can wait</th>
              </tr>
            </thead>
            <tbody>
              {r.rows.map((row) => (
                <tr key={row.adg} className={row.current ? "now" : ""}>
                  <td>{row.adg.toFixed(2)} kg</td>
                  <td>{fmtK2(row.valuePerDay)}</td>
                  <td className={row.netPerDay >= 0 ? "ok" : "danger"}>
                    {row.netPerDay >= 0 ? "+" : ""}
                    {fmtK2(row.netPerDay)}
                  </td>
                  <td>{row.maxDays === null ? <span className="ok">growth pays for itself</span> : row.worthWaiting ? `${Math.round(row.maxDays)} days` : <span className="danger">not worth waiting</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny faint mt">
          Waiting is free above {r.crossoverAdg.toFixed(3)} kg/day (daily cost ÷ target price). Finished pigs here have run about {num(settings, "default_adg_kg")} kg/day; young stock measure lower simply because lifetime gain rises with age.
        </p>
      </div>

      <div className="card">
        <div className="eyebrow">Prices actually achieved</div>
        <div className="chips mt">
          <span className="chip sm on">Best live · {fmtK2(best)}/kg</span>
          {achieved.map((x) => (
            <Link key={x.id} href={`/sales/detail/?id=${x.id}`} className="chip sm">
              {fmtDate(x.date)} · {fmtK2(x.live_equivalent_per_kg)}/kg {x.channel === "dead" ? "live equiv." : "live"}
            </Link>
          ))}
        </div>
        <p className="small muted mt">Compare every sale per live kg: a dead-weight price only means something once it has been through the dressing percentage. The target is a stretch, not a floor.</p>
      </div>

      <details className="plain card">
        <summary>Assumptions — change if the farm changes</summary>
        <div className="grid-2 mt">
          <Field label="Dressing %">
            <NumInput value={dress} onChange={setDress} placeholder={String(num(settings, "dressing_pct"))} step={0.1} />
          </Field>
          <Field label="Cost per pig per day">
            <NumInput value={cost} onChange={setCost} placeholder={fmtNum(c.total, 2)} unit="K" step={0.01} />
          </Field>
          <Field label="Target price">
            <NumInput value={target} onChange={setTarget} placeholder={String(num(settings, "target_price_per_kg"))} unit="K/kg" step={0.5} />
          </Field>
          <Field label="Head price">
            <NumInput value={headPrice} onChange={setHeadPrice} placeholder={String(num(settings, "head_price_per_kg"))} unit="K/kg" step={1} />
          </Field>
        </div>
        <p className="tiny faint mt">
          Changes here are for this calculation only. Dressing has measured {num(settings, "dressing_pct_min")}–{num(settings, "dressing_pct_max")}% — a range, never a certainty. Daily cost is feed {fmtK2(c.feed)} + labour {fmtK2(c.labour)} + bedding, vet and power {fmtK2(c.other)}. Make them permanent under{" "}
          <Link href="/settings/" style={{ color: "var(--accent)", fontWeight: 700 }}>
            Settings
          </Link>
          .
        </p>
      </details>
      <p className="tiny faint">
        {animal ? `${animalLabel(animal)} · on farm ${daysBetween(animal.birth_date ?? animal.purchase_date ?? today, today)} days.` : ""} Trotters are not counted — they have never been sold.
      </p>
    </Page>
  );
}
