"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { animalLabel, useAnimals, useSettings } from "@/db/hooks";
import { num } from "@/db/settings";
import { save, todayIso } from "@/db/write";
import { regenerateCalendar } from "@/db/calendar";
import { useToast } from "@/components/AppShell";
import { DateInput, Field, Page, Select, TextArea } from "@/components/ui";
import { addDays } from "@/domain/dates";
import { fmtDate } from "@/domain/format";

export default function ServicePage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const settings = useSettings();
  const animals = useAnimals();
  const litters = useLiveQuery(() => db.litter.toArray(), []);
  const [dam, setDam] = useState(params.get("dam") ?? "");
  const [boar, setBoar] = useState("");
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState("");

  const sows = (animals ?? []).filter((a) => a.status === "active" && a.sex === "female" && (a.stage === "sow" || a.stage === "gilt"));
  const boars = (animals ?? []).filter((a) => a.status === "active" && a.stage === "boar");
  const gestation = num(settings, "gestation_days");
  const expected = date ? addDays(date, gestation) : "";
  const alreadyPending = (litters ?? []).find((l) => l.dam_id === dam && l.outcome === "pending");
  const nextId = `L${(litters ?? []).length + 1}`;

  const submit = async () => {
    if (!dam || !date) return;
    const l = await save("litter", {
      id: nextId,
      dam_id: dam,
      sire_id: boar || undefined,
      service_date: date,
      expected_farrow: expected,
      stillborn: 0,
      died_pre_weaning: 0,
      outcome: "pending",
      notes: notes.trim() || undefined,
    });
    await save("heat_record", { animal_id: dam, date, served: 1, boar_id: boar || undefined });
    await regenerateCalendar();
    toast(`Farrowing due ${fmtDate(expected)}`);
    router.push(`/breeding/litter/?id=${l.id}`);
  };

  return (
    <Page title="Sow served" back="/breeding/">
      <div className="card stack-sm">
        <Field label="Sow">
          <Select value={dam} onChange={setDam} placeholder="Pick the sow by tag" options={sows.map((s) => ({ value: s.id, label: `${animalLabel(s)}${s.stage === "gilt" ? " (gilt)" : ""}` }))} />
        </Field>
        {alreadyPending && (
          <p className="small warn">
            She already has a pending litter ({alreadyPending.id}, due {fmtDate(alreadyPending.expected_farrow)}). Record its outcome first if this is a re-service.
          </p>
        )}
        <Field label="Boar">
          <Select value={boar} onChange={setBoar} placeholder="Unknown" options={boars.map((b) => ({ value: b.id, label: animalLabel(b) }))} />
        </Field>
        <Field label="Date served">
          <DateInput value={date} onChange={setDate} />
        </Field>
        <Field label="Notes">
          <TextArea value={notes} onChange={setNotes} placeholder="Which room, how many times…" />
        </Field>
      </div>
      <div className="card accent">
        <div className="eyebrow">Expected farrowing</div>
        <div style={{ fontSize: 28, fontWeight: 800 }}>{expected ? fmtDate(expected) : "—"}</div>
        <div className="small muted">
          Service + {gestation} days. Goes on the calendar as litter {nextId}.
        </div>
      </div>
      <button type="button" className="btn xl primary block" disabled={!dam || !date} onClick={submit}>
        Record service
      </button>
    </Page>
  );
}
