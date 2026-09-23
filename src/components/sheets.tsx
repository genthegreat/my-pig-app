"use client";

import { useState } from "react";
import { db } from "@/db/db";
import { animalLabel } from "@/db/hooks";
import { STAGE_LABEL, STAGES, type Animal, type AnimalStatus, type Stage } from "@/db/schema";
import { patch, save, todayIso } from "@/db/write";
import { regenerateCalendar } from "@/db/calendar";
import { plural } from "@/domain/format";
import { DateInput, Field, Seg, Sheet, TextInput } from "./ui";

/** Close any open occupancy for the animal and open a new one. An event, not an edit. */
export async function moveAnimal(animalId: string, roomId: string, date: string) {
  const open = (await db.room_occupancy.where("animal_id").equals(animalId).toArray()).filter((o) => !o.moved_out);
  for (const o of open) await patch("room_occupancy", o.id, { moved_out: date });
  await save("room_occupancy", { animal_id: animalId, room_id: roomId, moved_in: date });
  await patch("animal", animalId, { current_room: roomId });
}

export function MoveSheet({
  open,
  onClose,
  animal,
  animals,
  rooms,
  roomMap,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  animal?: Animal;
  animals?: Animal[];
  rooms: { id: string; label: string; active: number }[];
  roomMap: Map<string, { label: string }>;
  onDone: () => void;
}) {
  const [room, setRoom] = useState("");
  const [date, setDate] = useState(todayIso());
  const targets = animals ?? (animal ? [animal] : []);
  const submit = async () => {
    if (!room) return;
    for (const a of targets) await moveAnimal(a.id, room, date);
    await regenerateCalendar();
    onDone();
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={targets.length === 1 ? `Move ${animalLabel(targets[0])}` : `Move ${plural(targets.length, "pig")}`}>
      <Field label="To room">
        <div className="chips">
          {rooms
            .filter((r) => r.active)
            .map((r) => (
              <button key={r.id} type="button" className="chip" aria-pressed={room === r.id} onClick={() => setRoom(r.id)}>
                {r.label}
              </button>
            ))}
        </div>
      </Field>
      <Field label="On">
        <DateInput value={date} onChange={setDate} />
      </Field>
      {animal?.current_room && <p className="small muted">Currently in {roomMap.get(animal.current_room)?.label}.</p>}
      <button type="button" className="btn lg primary" disabled={!room} onClick={submit}>
        Move
      </button>
    </Sheet>
  );
}

export function StageSheet({
  open,
  onClose,
  animal,
  animals,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  animal?: Animal;
  animals?: Animal[];
  onDone: () => void;
}) {
  const targets = animals ?? (animal ? [animal] : []);
  const [stage, setStage] = useState<Stage | "">(targets.length === 1 ? targets[0].stage : "");
  const [date, setDate] = useState(todayIso());
  const [reason, setReason] = useState("");
  const submit = async () => {
    if (!stage) return;
    for (const a of targets) {
      if (a.stage === stage) continue;
      await save("stage_change", { animal_id: a.id, from_stage: a.stage, to_stage: stage, date, reason: reason || undefined });
      await patch("animal", a.id, { stage });
    }
    await regenerateCalendar();
    onDone();
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={targets.length === 1 ? "Change stage" : `Change stage of ${plural(targets.length, "pig")}`}>
      <p className="small muted">A dated event, so cost per stage stays possible later.</p>
      <div className="chips">
        {STAGES.map((s) => (
          <button key={s} type="button" className="chip" aria-pressed={stage === s} onClick={() => setStage(s)}>
            {STAGE_LABEL[s]}
          </button>
        ))}
      </div>
      <Field label="On">
        <DateInput value={date} onChange={setDate} />
      </Field>
      <Field label="Reason">
        <TextInput value={reason} onChange={setReason} placeholder="weaned, promoted to sow…" />
      </Field>
      <button type="button" className="btn lg primary" disabled={!stage} onClick={submit}>
        Save
      </button>
    </Sheet>
  );
}

export function ExitSheet({
  open,
  onClose,
  animal,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  animal: Animal;
  onDone: (s: AnimalStatus) => void;
}) {
  const [status, setStatus] = useState<AnimalStatus>("sold");
  const [date, setDate] = useState(todayIso());
  const [reason, setReason] = useState("");
  const submit = async () => {
    const open = (await db.room_occupancy.where("animal_id").equals(animal.id).toArray()).filter((o) => !o.moved_out);
    for (const o of open) await patch("room_occupancy", o.id, { moved_out: date });
    await patch("animal", animal.id, { status, exit_date: date, exit_reason: reason || undefined, current_room: undefined });
    if (status === "died") {
      await save("health_event", { animal_id: animal.id, type: "mortality", date, notes: reason || undefined });
    }
    await regenerateCalendar();
    onDone(status);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={`${animalLabel(animal)} left the farm`}>
      <Seg
        value={status}
        onChange={setStatus}
        options={[
          { value: "sold", label: "Sold" },
          { value: "died", label: "Died" },
          { value: "culled", label: "Culled" },
        ]}
      />
      <Field label="On">
        <DateInput value={date} onChange={setDate} />
      </Field>
      <Field label={status === "died" ? "Cause" : "Notes"}>
        <TextInput value={reason} onChange={setReason} />
      </Field>
      <button type="button" className="btn lg danger" onClick={submit}>
        Record
      </button>
    </Sheet>
  );
}
