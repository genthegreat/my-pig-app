"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import type { RatioBasis } from "@/db/schema";
import { patch, save, todayIso } from "@/db/write";
import { useToast } from "@/components/AppShell";
import { DateInput, Field, NumInput, Page, Seg, Select, TextArea } from "@/components/ui";
import { addDays } from "@/domain/dates";
import { fmtK2, fmtKg, fmtPct } from "@/domain/format";
import { rationFigures } from "@/domain/ration";

export default function RationPage() {
  const router = useRouter();
  const { toast } = useToast();
  const products = useLiveQuery(() => db.feed_product.filter((p) => !!p.active).toArray(), []);
  const groups = useLiveQuery(() => db.group.toArray(), []);
  const [group, setGroup] = useState("");
  const [concId, setConcId] = useState("");
  const [dilId, setDilId] = useState("");
  const [rc, setRc] = useState("1");
  const [rd, setRd] = useState("3");
  const [basis, setBasis] = useState<RatioBasis | "">("");
  const [concUnit, setConcUnit] = useState("");
  const [dilUnit, setDilUnit] = useState("");
  const [from, setFrom] = useState(todayIso());
  const [kgPerPig, setKgPerPig] = useState("");
  const [notes, setNotes] = useState("");

  const conc = useMemo(() => products?.find((p) => p.id === concId), [products, concId]);
  const dil = useMemo(() => products?.find((p) => p.id === dilId), [products, dilId]);
  useEffect(() => {
    if (conc) setConcUnit(String(conc.bag_size_kg));
  }, [conc]);
  useEffect(() => {
    if (dil) setDilUnit(String(dil.bag_size_kg));
  }, [dil]);

  const figures =
    conc && basis
      ? rationFigures(
          {
            ratio_concentrate: Number(rc) || 1,
            ratio_diluent: Number(rd) || 0,
            ratio_basis: basis,
            concentrate_unit_kg: Number(concUnit) || undefined,
            diluent_unit_kg: Number(dilUnit) || undefined,
          },
          conc,
          dil,
        )
      : undefined;

  const valid = conc && basis && Number(rc) > 0 && (Number(rd) === 0 || dil) && from;

  const submit = async () => {
    if (!valid || !conc || !basis) return;
    // Close the previous ration for this group.
    const open = (await db.ration.toArray()).filter((r) => (r.group_id ?? "") === group && !r.effective_to);
    for (const r of open) await patch("ration", r.id, { effective_to: addDays(from, -1) });
    await save("ration", {
      group_id: group || undefined,
      effective_from: from,
      concentrate_id: conc.id,
      diluent_id: dil?.id,
      ratio_concentrate: Number(rc),
      ratio_diluent: Number(rd) || 0,
      ratio_basis: basis,
      concentrate_unit_kg: basis === "bags" ? Number(concUnit) || conc.bag_size_kg : undefined,
      diluent_unit_kg: basis === "bags" && dil ? Number(dilUnit) || dil.bag_size_kg : undefined,
      kg_per_pig_per_day: kgPerPig ? Number(kgPerPig) : undefined,
      notes: notes.trim() || undefined,
    });
    toast("Ration recorded");
    router.push("/feed/");
  };

  const concs = (products ?? []).filter((p) => p.kind !== "diluent" && p.kind !== "additive");
  const dils = (products ?? []).filter((p) => p.kind === "diluent");

  return (
    <Page title="New ration" back="/feed/">
      <div className="card stack-sm">
        <Field label="Fed to">
          <Select value={group} onChange={setGroup} placeholder="Whole farm" options={(groups ?? []).map((g) => ({ value: g.id, label: g.name }))} />
        </Field>
        <Field label="Concentrate or feed">
          <Select value={concId} onChange={setConcId} placeholder="Pick a product" options={concs.map((p) => ({ value: p.id, label: `${p.name} (${p.kind}, ${p.bag_size_kg} kg)` }))} />
        </Field>
        <Field label="Diluent" hint="Every ration carries its diluent. 1:3 means nothing without knowing 1:3 of what.">
          <Select value={dilId} onChange={setDilId} placeholder="None — fed straight" options={dils.map((p) => ({ value: p.id, label: `${p.name} (${p.bag_size_kg} kg, ~${p.mj_per_kg ?? "?"} MJ/kg)` }))} />
        </Field>
        <div className="grid-2">
          <Field label="Parts concentrate">
            <NumInput value={rc} onChange={setRc} big />
          </Field>
          <Field label="Parts diluent">
            <NumInput value={rd} onChange={setRd} big />
          </Field>
        </div>
        <Field label="Counted in" error={!basis ? "Required. Bags are easy to count — but the bags are different sizes." : undefined}>
          <Seg
            value={basis}
            onChange={setBasis}
            accent
            options={[
              { value: "bags", label: "Bags" },
              { value: "weight", label: "Kilograms" },
            ]}
          />
        </Field>
        {basis === "bags" && (
          <div className="grid-2">
            <Field label="Kg per concentrate unit">
              <NumInput value={concUnit} onChange={setConcUnit} unit="kg" />
            </Field>
            <Field label="Kg per diluent unit" hint={dil?.unit_label === "bucket" ? "e.g. 35 kg if a 'bag' is 3.5 buckets" : undefined}>
              <NumInput value={dilUnit} onChange={setDilUnit} unit="kg" />
            </Field>
          </div>
        )}
        <div className="grid-2">
          <Field label="From">
            <DateInput value={from} onChange={setFrom} />
          </Field>
          <Field label="Kg per pig per day">
            <NumInput value={kgPerPig} onChange={setKgPerPig} unit="kg" placeholder="2.2" />
          </Field>
        </div>
        <Field label="Notes">
          <TextArea value={notes} onChange={setNotes} />
        </Field>
      </div>

      {figures && (
        <div className="card">
          <div className="eyebrow">This mix</div>
          <div className="kpis mt">
            <div className="kpi">
              <span className="k">Batch</span>
              <span className="v">{fmtKg(figures.batchKg, 0)}</span>
              <span className="n">
                {fmtKg(figures.concentrateKg, 0)} + {fmtKg(figures.diluentKg, 0)}
              </span>
            </div>
            <div className="kpi">
              <span className="k">Inclusion</span>
              <span className="v">{fmtPct(figures.inclusionPct, 0)}</span>
              <span className="n">1:{figures.byWeightRatio.toFixed(1)} by weight</span>
            </div>
            <div className="kpi">
              <span className="k">Energy</span>
              <span className="v">{figures.mjPerKg !== undefined ? `${figures.mjPerKg.toFixed(1)} MJ` : "—"}</span>
              <span className="n">{figures.costPerKg !== undefined ? `${fmtK2(figures.costPerKg)}/kg` : ""}</span>
            </div>
          </div>
          {figures.warnings.map((w, i) => (
            <div key={i} className={`card ${w.level === "warn" ? "warn" : "soft"} small mt`} style={{ padding: "8px 12px" }}>
              {w.level === "warn" ? "⚠ " : "ℹ "}
              {w.text}
            </div>
          ))}
        </div>
      )}

      <button type="button" className="btn xl primary block" disabled={!valid} onClick={submit}>
        Record ration
      </button>
    </Page>
  );
}
