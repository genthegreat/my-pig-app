"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { animalLabel, useActiveAnimals, useSettings } from "@/db/hooks";
import type { Sale, SaleChannel } from "@/db/schema";
import { num } from "@/db/settings";
import { patch, save, todayIso } from "@/db/write";
import { regenerateCalendar } from "@/db/calendar";
import { useToast } from "@/components/AppShell";
import { ChannelBadge, Checkbox, DateInput, Field, NumInput, Page, Seg, Select, TextArea, TextInput } from "@/components/ui";
import { fmtK, fmtK2, fmtKg, fmtPct } from "@/domain/format";
import { computeSale } from "@/domain/sales";

export default function SaleNewPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}

interface LineState {
  animalId?: string;
  live: string;
  carcass: string;
}

function Inner() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const settings = useSettings();
  const animals = useActiveAnimals();
  const clients = useLiveQuery(() => db.client.toArray(), []);
  const [date, setDate] = useState(todayIso());
  const [channel, setChannel] = useState<SaleChannel>("live");
  const [clientId, setClientId] = useState("");
  const [newClient, setNewClient] = useState("");
  const [selected, setSelected] = useState<string[]>(params.get("animal") ? [params.get("animal")!] : []);
  const [perPig, setPerPig] = useState(true);
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [headCount, setHeadCount] = useState("1");
  const [liveTotal, setLiveTotal] = useState("");
  const [carcassTotal, setCarcassTotal] = useState("");
  const [price, setPrice] = useState("");
  const [lump, setLump] = useState("");
  const [headKg, setHeadKg] = useState("");
  const [headSold, setHeadSold] = useState(false);
  const [headPrice, setHeadPrice] = useState("");
  const [trottersKg, setTrottersKg] = useState("");
  const [trottersSold, setTrottersSold] = useState(false);
  const [payment, setPayment] = useState<"paid" | "part" | "unpaid">("paid");
  const [amountPaid, setAmountPaid] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const headPriceDefault = num(settings, "head_price_per_kg");
  const sellable = useMemo(() => (animals ?? []).filter((a) => a.stage !== "piglet_creep"), [animals]);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const setLine = (id: string, patchLine: Partial<LineState>) => setLines((l) => ({ ...l, [id]: { ...(l[id] ?? { live: "", carcass: "" }), ...patchLine } }));

  const head = selected.length || Number(headCount) || 0;
  const sumLive = selected.reduce((s, id) => s + (Number(lines[id]?.live) || 0), 0);
  const sumCarcass = selected.reduce((s, id) => s + (Number(lines[id]?.carcass) || 0), 0);
  const liveKg = perPig && selected.length ? sumLive || undefined : Number(liveTotal) || undefined;
  const carcassKg = perPig && selected.length ? sumCarcass || undefined : Number(carcassTotal) || undefined;

  const fig = computeSale({
    channel,
    liveKg,
    carcassKg,
    pricePerKg: Number(price) || undefined,
    headKg: Number(headKg) || undefined,
    headSold,
    headPricePerKg: Number(headPrice) || headPriceDefault,
    trottersKg: Number(trottersKg) || undefined,
    trottersSold,
    totalOverride: lump ? Number(lump) : undefined,
  });
  const total = fig.total;
  const valid = head > 0 && total > 0 && (channel === "live" ? !!liveKg || !!lump : !!carcassKg || !!lump);

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      let cid = clientId || undefined;
      if (!cid && newClient.trim()) {
        const c = await save("client", { name: newClient.trim(), first_purchase: date });
        cid = c.id;
      }
      const sale = await save("sale", {
        date,
        client_id: cid,
        description: description.trim() || undefined,
        channel,
        head,
        live_kg: liveKg,
        carcass_kg: channel === "dead" ? carcassKg : undefined,
        price_per_kg: Number(price) || undefined,
        carcass_total: fig.carcassTotal,
        head_kg: Number(headKg) || undefined,
        head_sold: headSold ? 1 : 0,
        head_price_per_kg: headSold ? Number(headPrice) || headPriceDefault : undefined,
        head_total: fig.headTotal,
        trotters_kg: Number(trottersKg) || undefined,
        trotters_sold: trottersSold ? 1 : 0,
        trotters_total: fig.trottersTotal,
        total,
        dressing_pct: fig.dressingPct,
        live_equivalent_per_kg: liveKg ? total / liveKg : undefined,
        payment_status: payment,
        amount_paid: payment === "paid" ? total : Number(amountPaid) || 0,
        notes: notes.trim() || undefined,
      } as Omit<Sale, "id" | "updated_at" | "device_id">);
      for (const id of selected) {
        const l = lines[id];
        await save("sale_line", { sale_id: sale.id, animal_id: id, live_kg: Number(l?.live) || undefined, carcass_kg: Number(l?.carcass) || undefined });
        const open = (await db.room_occupancy.where("animal_id").equals(id).toArray()).filter((o) => !o.moved_out);
        for (const o of open) await patch("room_occupancy", o.id, { moved_out: date });
        await patch("animal", id, { status: "sold", exit_date: date, exit_reason: `Sold ${channel === "dead" ? "dead weight" : "live"}${cid ? " to " + (clients?.find((c) => c.id === cid)?.name ?? newClient) : ""}`, current_room: undefined });
      }
      await regenerateCalendar();
      toast(`${fmtK(total)} recorded`);
      router.push(`/sales/detail/?id=${sale.id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page title="Record a sale" back="/sales/">
      <div className="card stack-sm">
        <Field label="Priced on">
          <div className="hstack" style={{ gap: 8 }}>
            <button type="button" className={`btn grow chan-pick ${channel === "live" ? "on-live" : ""}`} aria-pressed={channel === "live"} onClick={() => setChannel("live")}>
              <ChannelBadge channel="live" size="md" />
            </button>
            <button type="button" className={`btn grow chan-pick ${channel === "dead" ? "on-dead" : ""}`} aria-pressed={channel === "dead"} onClick={() => setChannel("dead")}>
              <ChannelBadge channel="dead" size="md" />
            </button>
          </div>
        </Field>
        {channel === "dead" && <p className="small warn">A dead-weight price per kg is not comparable with a live one until it has been through the dressing percentage — see the live equivalent below.</p>}
        <div className="grid-2">
          <Field label="Date">
            <DateInput value={date} onChange={setDate} />
          </Field>
          <Field label="Buyer">
            <Select value={clientId} onChange={setClientId} placeholder="Pick or add below" options={(clients ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
        </div>
        {!clientId && (
          <Field label="New buyer">
            <TextInput value={newClient} onChange={setNewClient} placeholder="Name, butchery, trader…" />
          </Field>
        )}
        <Field label="Description">
          <TextInput value={description} onChange={setDescription} placeholder="3 porkers from L3, to butchery" />
        </Field>
      </div>

      <div className="card stack-sm">
        <h3>Which pigs</h3>
        <div className="chips">
          {sellable.map((a) => (
            <button key={a.id} type="button" className="chip" aria-pressed={selected.includes(a.id)} onClick={() => toggle(a.id)}>
              {animalLabel(a)}
            </button>
          ))}
        </div>
        {selected.length === 0 && (
          <Field label="Head" hint="No tag picked — the sale is recorded without linking pigs">
            <NumInput value={headCount} onChange={setHeadCount} step={1} />
          </Field>
        )}
        {selected.length > 0 && (
          <Seg
            value={perPig ? "each" : "totals"}
            onChange={(v) => setPerPig(v === "each")}
            options={[
              { value: "each", label: "Weights per pig" },
              { value: "totals", label: "Totals only" },
            ]}
          />
        )}
        {perPig && selected.length > 0 ? (
          selected.map((id) => (
            <div key={id} className="grid-3" style={{ alignItems: "end" }}>
              <div className="bold small ellipsis">{animalLabel(sellable.find((a) => a.id === id))}</div>
              <Field label="Live kg">
                <NumInput value={lines[id]?.live ?? ""} onChange={(v) => setLine(id, { live: v })} />
              </Field>
              {channel === "dead" ? (
                <Field label="Carcass kg">
                  <NumInput value={lines[id]?.carcass ?? ""} onChange={(v) => setLine(id, { carcass: v })} step={0.01} />
                </Field>
              ) : (
                <span />
              )}
            </div>
          ))
        ) : (
          <div className="grid-2">
            <Field label="Live weight, total" hint={channel === "dead" ? "If weighed — makes the live-equivalent price possible" : undefined}>
              <NumInput value={liveTotal} onChange={setLiveTotal} unit="kg" />
            </Field>
            {channel === "dead" && (
              <Field label="Carcass, total">
                <NumInput value={carcassTotal} onChange={setCarcassTotal} unit="kg" step={0.01} />
              </Field>
            )}
          </div>
        )}
      </div>

      <div className="card stack-sm">
        <h3>Price</h3>
        <div className="grid-2">
          <Field label={channel === "dead" ? "Per kg carcass" : "Per kg live"}>
            <NumInput value={price} onChange={setPrice} unit="K/kg" step={0.5} big />
          </Field>
          <Field label="Or lump sum" hint="If the buyer paid one figure">
            <NumInput value={lump} onChange={setLump} unit="K" step={1} />
          </Field>
        </div>
        {channel === "dead" && (
          <>
            <div className="grid-2">
              <Field label="Heads">
                <NumInput value={headKg} onChange={setHeadKg} unit="kg" step={0.01} />
              </Field>
              <Field label="Trotters">
                <NumInput value={trottersKg} onChange={setTrottersKg} unit="kg" step={0.01} />
              </Field>
            </div>
            <Checkbox checked={headSold} onChange={setHeadSold}>
              Heads sold (K{headPriceDefault}/kg unless changed)
            </Checkbox>
            {headSold && (
              <Field label="Head price">
                <NumInput value={headPrice} onChange={setHeadPrice} unit="K/kg" placeholder={String(headPriceDefault)} />
              </Field>
            )}
            <Checkbox checked={trottersSold} onChange={setTrottersSold}>
              Trotters sold
            </Checkbox>
          </>
        )}
      </div>

      <div className="kpis">
        <div className="kpi hero">
          <span className="k">Total</span>
          <span className="v">{fmtK(total)}</span>
          <span className="n">
            {fig.carcassTotal ? `carcass ${fmtK(fig.carcassTotal)}` : ""}
            {fig.headTotal ? ` + heads ${fmtK(fig.headTotal)}` : ""}
            {lump ? "lump sum" : ""}
          </span>
        </div>
        <div className="kpi">
          <span className="k">Per live kg</span>
          <span className={`v ${channel === "dead" && !liveKg ? "muted" : ""}`}>
            {liveKg ? fmtK2(total / liveKg) : channel === "dead" ? "needs live kg" : "—"}
          </span>
          <span className="n">{channel === "dead" ? "live-equivalent — the comparable figure" : liveKg ? `${fmtKg(liveKg)} live` : ""}</span>
        </div>
        {fig.dressingPct !== undefined && (
          <div className="kpi">
            <span className="k">Dressing</span>
            <span className="v">{fmtPct(fig.dressingPct)}</span>
            <span className="n">
              measured range {num(settings, "dressing_pct_min")}–{num(settings, "dressing_pct_max")}%
            </span>
          </div>
        )}
      </div>

      <div className="card stack-sm">
        <Seg
          value={payment}
          onChange={setPayment}
          options={[
            { value: "paid", label: "Paid" },
            { value: "part", label: "Part paid" },
            { value: "unpaid", label: "Unpaid" },
          ]}
        />
        {payment === "part" && (
          <Field label="Received so far">
            <NumInput value={amountPaid} onChange={setAmountPaid} unit="K" />
          </Field>
        )}
        <Field label="Notes">
          <TextArea value={notes} onChange={setNotes} />
        </Field>
      </div>

      <button type="button" className="btn xl primary block" disabled={!valid || saving} onClick={submit}>
        Record sale{selected.length ? ` · ${selected.length} pig${selected.length === 1 ? "" : "s"} marked sold` : ""}
      </button>
    </Page>
  );
}
