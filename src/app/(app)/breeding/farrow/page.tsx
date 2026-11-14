"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { animalLabel, roomLabel, useAnimalMap, useRoomMap, useRooms } from "@/db/hooks";
import { litterDamName, regenerateCalendar } from "@/db/calendar";
import { patch, save, todayIso } from "@/db/write";
import { useToast } from "@/components/AppShell";
import { moveAnimal } from "@/components/sheets";
import { DateInput, Field, NumInput, Page, Select, TextArea } from "@/components/ui";
import { fmtDate } from "@/domain/format";
import { sexOfPiglet, splitSexes } from "@/domain/litter";

export default function FarrowPage() {
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
  const animals = useAnimalMap();
  const rooms = useRooms();
  const roomMap = useRoomMap();
  const litters = useLiveQuery(() => db.litter.where("outcome").equals("pending").toArray(), []);
  const [litterId, setLitterId] = useState(params.get("litter") ?? "");
  const [date, setDate] = useState(todayIso());
  const [born, setBorn] = useState("");
  const [still, setStill] = useState("0");
  const [males, setMales] = useState("");
  const [females, setFemales] = useState("");
  const [room, setRoom] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const litter = (litters ?? []).find((l) => l.id === litterId);
  const dam = litter?.dam_id ? animals.get(litter.dam_id) : undefined;

  // The tag is the pig; the room is where it stands. A farrowing recorded
  // against a room that does not hold the sow is how litters end up on the
  // wrong mother, so it is refused here.
  const roomMismatch = !!(dam && room && dam.current_room !== room);
  const damHasNoRoom = !!(dam && !dam.current_room);

  const sexes = splitSexes(Number(born) || 0, males, females);

  const canSave = !!litter && !!dam && !!date && Number(born) >= 0 && born !== "" && !!room && !roomMismatch && !sexes.error && !saving;

  const submit = async (moveHerFirst = false) => {
    if (!litter || !dam) return;
    setSaving(true);
    try {
      if (moveHerFirst || damHasNoRoom) await moveAnimal(dam.id, room, date);
      await patch("litter", litter.id, {
        actual_farrow: date,
        born_alive: Number(born),
        stillborn: Number(still) || 0,
        room_at_farrowing: room,
        outcome: "farrowed",
        notes: [litter.notes, notes.trim()].filter(Boolean).join(" ") || undefined,
      });
      if (dam.stage === "gilt") {
        await save("stage_change", { animal_id: dam.id, from_stage: "gilt", to_stage: "sow", date, reason: `first farrowing (${litter.id})` });
        await patch("animal", dam.id, { stage: "sow" });
      }
      const n = Number(born);
      for (let i = 1; i <= n; i++) {
        const a = await save("animal", {
          tag_label: `${litter.id} piglet ${i}`,
          sex: sexOfPiglet(sexes, i - 1),
          castrated: 0,
          birth_date: date,
          litter_id: litter.id,
          dam_id: dam.id,
          sire_id: litter.sire_id,
          origin: "born_on_farm",
          stage: "piglet_creep",
          current_room: room,
          status: "active",
        });
        await save("stage_change", { animal_id: a.id, to_stage: "piglet_creep", date, reason: "born" });
        await save("room_occupancy", { animal_id: a.id, room_id: room, moved_in: date });
      }
      await regenerateCalendar();
      toast(`${litter.id}: ${n} born alive`);
      router.push(`/breeding/litter/?id=${litter.id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page title="Farrowed" back="/breeding/">
      <div className="card stack-sm">
        <Field label="Litter">
          <Select
            value={litterId}
            onChange={setLitterId}
            placeholder="Which sow farrowed?"
            options={(litters ?? []).map((l) => ({ value: l.id, label: `${l.id} · ${litterDamName(l, animals)} · due ${fmtDate(l.expected_farrow)}` }))}
          />
        </Field>
        {litter && !dam && (
          <div className="card warn small">
            The sow for {litter.id} is recorded only as &ldquo;{litter.dam_label}&rdquo;.{" "}
            <Link href={`/breeding/litter/?id=${litter.id}`} style={{ color: "var(--accent)", fontWeight: 700 }}>
              Assign her by tag first
            </Link>
            , then record the farrowing.
          </div>
        )}
        {(litters ?? []).length === 0 && (
          <p className="small muted">
            No pending litter. <Link href="/breeding/service/" style={{ color: "var(--accent)", fontWeight: 700 }}>Record the service first</Link> so the farrowing traces back to it.
          </p>
        )}
        <Field label="Farrowed on">
          <DateInput value={date} onChange={setDate} />
        </Field>
        <div className="grid-2">
          <Field label="Born alive">
            <NumInput value={born} onChange={setBorn} step={1} big />
          </Field>
          <Field label="Stillborn">
            <NumInput value={still} onChange={setStill} step={1} big />
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Males">
            <NumInput value={males} onChange={setMales} step={1} />
          </Field>
          <Field label="Females">
            <NumInput value={females} onChange={setFemales} step={1} />
          </Field>
        </div>
        {sexes.error ? (
          <p className="small danger">{sexes.error}</p>
        ) : (
          <p className="small muted">
            {sexes.unknown && !males && !females
              ? "Of those born alive. Fill one and the rest are the other sex, or leave both blank to sex them later."
              : `${sexes.males} male, ${sexes.females} female${sexes.unknown ? `, ${sexes.unknown} not sexed` : ""}.`}
          </p>
        )}
      </div>

      <div className="card stack-sm">
        <Field label="Room she farrowed in" hint={dam ? `${animalLabel(dam)} is recorded in ${roomLabel(roomMap, dam.current_room)}.` : undefined}>
          <div className="chips">
            {(rooms ?? [])
              .filter((r) => r.active)
              .map((r) => (
                <button key={r.id} type="button" className="chip" aria-pressed={room === r.id} onClick={() => setRoom(r.id)}>
                  {r.label}
                </button>
              ))}
          </div>
        </Field>
        {roomMismatch && dam && (
          <div className="card danger small">
            <b>
              {animalLabel(dam)} is in {roomLabel(roomMap, dam.current_room)}, not {roomLabel(roomMap, room)}.
            </b>{" "}
            A farrowing is only accepted against the room that holds the sow. Either pick {roomLabel(roomMap, dam.current_room)}, or move her first.
            <div className="mt">
              <button type="button" className="btn sm" onClick={() => submit(true)} disabled={saving || born === "" || !!sexes.error}>
                Move her to {roomLabel(roomMap, room)} on {fmtDate(date)} and record
              </button>
            </div>
          </div>
        )}
        {damHasNoRoom && room && <p className="small muted">She has no room recorded; saving puts her in {roomLabel(roomMap, room)}.</p>}
        <Field label="Notes">
          <TextArea value={notes} onChange={setNotes} placeholder="Males castrated, any losses…" />
        </Field>
      </div>

      <p className="small muted">
        Each piglet gets its own record from today, in this room, with dam and sire attached. Tag colours can be added later.
      </p>
      <button type="button" className="btn xl primary block" disabled={!canSave} onClick={() => submit(false)}>
        Record farrowing
      </button>
    </Page>
  );
}
