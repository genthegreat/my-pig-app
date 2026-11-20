"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { animalLabel, useActiveAnimals, useDefaultWorker, useRooms } from "@/db/hooks";
import { HEALTH_TYPES, type HealthEventType } from "@/db/schema";
import { patch, save, todayIso } from "@/db/write";
import { regenerateCalendar } from "@/db/calendar";
import { useToast } from "@/components/AppShell";
import { DateInput, Field, NumInput, Page, Select, TextArea, TextInput } from "@/components/ui";

const TYPE_LABEL: Record<HealthEventType, string> = {
  vaccination: "Vaccination",
  deworming: "Deworming",
  injection: "Injection",
  treatment: "Treatment",
  incident: "Incident",
  mortality: "Death",
};

export default function HealthNewPage() {
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
  const animals = useActiveAnimals();
  const rooms = useRooms();
  const [type, setType] = useState<HealthEventType>("treatment");
  const [scope, setScope] = useState<"animal" | "room">(params.get("animal") ? "animal" : params.get("room") ? "room" : "animal");
  const [animal, setAnimal] = useState(params.get("animal") ?? "");
  const [room, setRoom] = useState(params.get("room") ?? "");
  const [date, setDate] = useState(todayIso());
  const [product, setProduct] = useState("");
  const [dose, setDose] = useState("");
  const [cost, setCost] = useState("");
  const worker = useDefaultWorker();
  const [byEdit, setBy] = useState<string>();
  const by = byEdit ?? worker ?? "";
  const [nextDue, setNextDue] = useState("");
  const [notes, setNotes] = useState("");

  const target = scope === "animal" ? animal : room;
  const submit = async () => {
    if (!target) return;
    const ev = await save("health_event", {
      animal_id: scope === "animal" ? animal : undefined,
      room_id: scope === "room" ? room : undefined,
      type,
      product: product.trim() || undefined,
      dose: dose.trim() || undefined,
      date,
      next_due_date: nextDue || undefined,
      cost: cost ? Number(cost) : undefined,
      administered_by: by.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    if (cost) {
      await save("cost", {
        date,
        category: "veterinary",
        item: `${TYPE_LABEL[type]}${product ? ` · ${product}` : ""}`,
        total: Number(cost),
        recurring: 0,
        is_capital: 0,
        allocation: scope === "animal" ? animal : "farm",
        confidence: "high",
        source_note: `health event ${ev.id}`,
      });
    }
    if (type === "mortality" && scope === "animal") {
      await patch("animal", animal, { status: "died", exit_date: date, exit_reason: notes.trim() || undefined, current_room: undefined });
    }
    if (nextDue) {
      await save("calendar_entry", {
        date: nextDue,
        kind: "health",
        source: "manual",
        title: `${TYPE_LABEL[type]} due${product ? ` · ${product}` : ""}${scope === "animal" ? ` · ${animalLabel(animals?.find((a) => a.id === animal))}` : ` · ${rooms?.find((r) => r.id === room)?.label ?? ""}`}`,
        short: TYPE_LABEL[type].slice(0, 8),
        animal_id: scope === "animal" ? animal : undefined,
        room_id: scope === "room" ? room : undefined,
        done: 0,
      });
    }
    await regenerateCalendar();
    toast("Logged");
    router.back();
  };

  return (
    <Page title="Quick log" back={true}>
      <div className="chips">
        {HEALTH_TYPES.map((t) => (
          <button key={t} type="button" className="chip" aria-pressed={type === t} onClick={() => setType(t)}>
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      <div className="card stack-sm">
        <div className="seg">
          <button type="button" aria-pressed={scope === "animal"} onClick={() => setScope("animal")}>
            One pig
          </button>
          <button type="button" aria-pressed={scope === "room"} onClick={() => setScope("room")}>
            Whole pen
          </button>
        </div>
        {scope === "animal" ? (
          <Select value={animal} onChange={setAnimal} placeholder="Which pig?" options={(animals ?? []).map((a) => ({ value: a.id, label: animalLabel(a) }))} />
        ) : (
          <Select value={room} onChange={setRoom} placeholder="Which room?" options={(rooms ?? []).filter((r) => r.active).map((r) => ({ value: r.id, label: r.label }))} />
        )}
        <Field label="Date">
          <DateInput value={date} onChange={setDate} />
        </Field>
        {type !== "incident" && type !== "mortality" && (
          <div className="grid-2">
            <Field label="Product">
              <TextInput value={product} onChange={setProduct} placeholder="Dewormer, iron…" />
            </Field>
            <Field label="Dose">
              <TextInput value={dose} onChange={setDose} placeholder="2 ml" />
            </Field>
          </div>
        )}
        <div className="grid-2">
          <Field label="Cost" hint="Adds a vet cost line">
            <NumInput value={cost} onChange={setCost} unit="K" step={1} />
          </Field>
          <Field label="By">
            <TextInput value={by} onChange={setBy} />
          </Field>
        </div>
        {type !== "incident" && type !== "mortality" && (
          <Field label="Next due" hint="Puts a reminder on the calendar">
            <DateInput value={nextDue} onChange={setNextDue} />
          </Field>
        )}
        <Field label={type === "mortality" ? "Cause" : "Notes"}>
          <TextArea value={notes} onChange={setNotes} />
        </Field>
      </div>
      <button type="button" className="btn xl primary block" disabled={!target} onClick={submit}>
        Save
      </button>
    </Page>
  );
}
