"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { animalLabel, useAnimals, useRooms } from "@/db/hooks";
import { STAGE_LABEL, STAGES, type Animal, type Sex, type Stage } from "@/db/schema";
import { patch, save, todayIso } from "@/db/write";
import { regenerateCalendar } from "@/db/calendar";
import { useToast } from "./AppShell";
import { moveAnimal } from "./sheets";
import { TagPicker } from "./tags";
import { Checkbox, DateInput, Field, NumInput, Seg, Select, TextArea, TextInput } from "./ui";

export function AnimalForm({ existing, defaults }: { existing?: Animal; defaults?: Partial<Animal> }) {
  const router = useRouter();
  const { toast } = useToast();
  const animals = useAnimals();
  const rooms = useRooms();
  const litters = useLiveQuery(() => db.litter.toArray(), []);
  const base = existing ?? defaults ?? {};

  const [tagColour, setTagColour] = useState<string | undefined>(base.tag_colour);
  const [tagLabel, setTagLabel] = useState(base.tag_label ?? "");
  const [name, setName] = useState(base.name ?? "");
  const [sex, setSex] = useState<Sex | "">(base.sex ?? "");
  const [castrated, setCastrated] = useState(!!base.castrated);
  const [stage, setStage] = useState<Stage>(base.stage ?? "weaner");
  const [breed, setBreed] = useState(base.breed ?? "");
  const [origin, setOrigin] = useState<"born_on_farm" | "purchased">(base.origin ?? "born_on_farm");
  const [birth, setBirth] = useState(base.birth_date ?? "");
  const [purchaseDate, setPurchaseDate] = useState(base.purchase_date ?? todayIso());
  const [purchaseCost, setPurchaseCost] = useState(base.purchase_cost?.toString() ?? "");
  const [originDetail, setOriginDetail] = useState(base.origin_detail ?? "");
  const [dam, setDam] = useState(base.dam_id ?? "");
  const [sire, setSire] = useState(base.sire_id ?? "");
  const [litter, setLitter] = useState(base.litter_id ?? "");
  const [room, setRoom] = useState(base.current_room ?? "");
  const [notes, setNotes] = useState(base.notes ?? "");
  const [saving, setSaving] = useState(false);

  const females = useMemo(() => (animals ?? []).filter((a) => a.sex === "female" && a.id !== existing?.id), [animals, existing]);
  const males = useMemo(() => (animals ?? []).filter((a) => a.sex === "male" && !a.castrated && a.id !== existing?.id), [animals, existing]);

  const error = !tagLabel.trim() && !name.trim() ? "Give the pig a tag label or a name" : undefined;

  const submit = async () => {
    if (error || saving) return;
    setSaving(true);
    try {
      const fields = {
        tag_colour: tagColour,
        tag_label: tagLabel.trim() || undefined,
        name: name.trim() || undefined,
        sex: sex || undefined,
        castrated: (castrated ? 1 : 0) as 0 | 1,
        breed: breed.trim() || undefined,
        stage,
        origin,
        birth_date: birth || undefined,
        purchase_date: origin === "purchased" ? purchaseDate || undefined : undefined,
        purchase_cost: origin === "purchased" && purchaseCost ? Number(purchaseCost) : undefined,
        origin_detail: origin === "purchased" ? originDetail.trim() || undefined : undefined,
        dam_id: dam || undefined,
        sire_id: sire || undefined,
        litter_id: litter || undefined,
        notes: notes.trim() || undefined,
      };
      if (existing) {
        if (stage !== existing.stage) {
          await save("stage_change", { animal_id: existing.id, from_stage: existing.stage, to_stage: stage, date: todayIso(), reason: "edited" });
        }
        await patch("animal", existing.id, fields);
        if (room && room !== existing.current_room) await moveAnimal(existing.id, room, todayIso());
        await regenerateCalendar();
        toast("Saved");
        router.push(`/animals/detail/?id=${existing.id}`);
      } else {
        const start = origin === "purchased" ? purchaseDate || todayIso() : birth || todayIso();
        const a = await save("animal", { ...fields, status: "active", current_room: room || undefined });
        await save("stage_change", { animal_id: a.id, to_stage: stage, date: start, reason: origin === "purchased" ? "bought" : "born" });
        if (room) await save("room_occupancy", { animal_id: a.id, room_id: room, moved_in: start });
        await regenerateCalendar();
        toast("Pig added");
        router.push(`/animals/detail/?id=${a.id}`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack">
      <div className="card">
        <h2>Tag</h2>
        <p className="small muted mb">The tag is the pig. The room is only where it stands.</p>
        <TagPicker value={tagColour} onChange={setTagColour} />
        <div className="grid-2 mt">
          <Field label="Tag label">
            <TextInput value={tagLabel} onChange={setTagLabel} placeholder="Sow 5" />
          </Field>
          <Field label="Name">
            <TextInput value={name} onChange={setName} placeholder="optional" />
          </Field>
        </div>
      </div>

      <div className="card stack-sm">
        <h2>About</h2>
        <Field label="Sex">
          <Seg
            value={sex}
            onChange={setSex}
            options={[
              { value: "female", label: "Female" },
              { value: "male", label: "Male" },
              { value: "", label: "Not recorded" },
            ]}
          />
        </Field>
        {sex === "male" && (
          <Checkbox checked={castrated} onChange={setCastrated}>
            Castrated
          </Checkbox>
        )}
        <Field label="Stage">
          <div className="chips">
            {STAGES.map((s) => (
              <button key={s} type="button" className="chip" aria-pressed={stage === s} onClick={() => setStage(s)}>
                {STAGE_LABEL[s]}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Breed">
          <TextInput value={breed} onChange={setBreed} placeholder="optional" />
        </Field>
      </div>

      <div className="card stack-sm">
        <h2>Origin</h2>
        <Seg
          value={origin}
          onChange={setOrigin}
          options={[
            { value: "born_on_farm", label: "Born here" },
            { value: "purchased", label: "Bought" },
          ]}
        />
        <Field label="Date of birth" hint={origin === "purchased" ? "If known" : undefined}>
          <DateInput value={birth} onChange={setBirth} />
        </Field>
        {origin === "purchased" ? (
          <>
            <Field label="Bought on">
              <DateInput value={purchaseDate} onChange={setPurchaseDate} />
            </Field>
            <div className="grid-2">
              <Field label="Price">
                <NumInput value={purchaseCost} onChange={setPurchaseCost} unit="K" step={1} />
              </Field>
              <Field label="From">
                <TextInput value={originDetail} onChange={setOriginDetail} placeholder="Seller, road or farm" />
              </Field>
            </div>
            <p className="small muted">Breeding stock is capital — it never enters cost-per-pig.</p>
          </>
        ) : (
          <>
            <Field label="Litter">
              <Select
                value={litter}
                onChange={(v) => {
                  setLitter(v);
                  const l = litters?.find((x) => x.id === v);
                  if (l) {
                    if (l.dam_id) setDam(l.dam_id);
                    if (l.sire_id) setSire(l.sire_id);
                    if (l.actual_farrow && !birth) setBirth(l.actual_farrow);
                  }
                }}
                placeholder="No litter"
                options={(litters ?? [])
                  .filter((l) => l.outcome === "farrowed")
                  .sort((a, b) => ((a.actual_farrow ?? "") < (b.actual_farrow ?? "") ? 1 : -1))
                  .map((l) => ({ value: l.id, label: `${l.id} · farrowed ${l.actual_farrow ?? "?"}` }))}
              />
            </Field>
          </>
        )}
        <div className="grid-2">
          <Field label="Dam">
            <Select value={dam} onChange={setDam} placeholder="Unknown" options={females.map((a) => ({ value: a.id, label: animalLabel(a) }))} />
          </Field>
          <Field label="Sire">
            <Select value={sire} onChange={setSire} placeholder="Unknown / off-farm" options={males.map((a) => ({ value: a.id, label: animalLabel(a) }))} />
          </Field>
        </div>
      </div>

      <div className="card stack-sm">
        <h2>Room</h2>
        <div className="chips">
          {(rooms ?? [])
            .filter((r) => r.active)
            .map((r) => (
              <button key={r.id} type="button" className="chip" aria-pressed={room === r.id} onClick={() => setRoom(room === r.id ? "" : r.id)}>
                {r.label}
              </button>
            ))}
        </div>
        {existing && room !== (existing.current_room ?? "") && room && <p className="small muted">Saving records a move to this room dated today.</p>}
      </div>

      <div className="card">
        <Field label="Notes">
          <TextArea value={notes} onChange={setNotes} />
        </Field>
      </div>

      <div className="sticky-actions">
        {error && <p className="small danger mb">{error}</p>}
        <button type="button" className="btn xl primary block" disabled={!!error || saving} onClick={submit}>
          {existing ? "Save changes" : "Add pig"}
        </button>
      </div>
    </div>
  );
}
