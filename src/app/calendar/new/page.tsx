"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CalendarKind } from "@/db/schema";
import { save, todayIso } from "@/db/write";
import { useToast } from "@/components/AppShell";
import { DateInput, Field, Page, TextArea, TextInput } from "@/components/ui";

const KINDS: { value: CalendarKind; label: string }[] = [
  { value: "manual", label: "Task" },
  { value: "health", label: "Health" },
  { value: "weighing", label: "Weighing" },
  { value: "sale", label: "Sale" },
  { value: "breeding", label: "Breeding" },
  { value: "finance", label: "Money" },
];

export default function CalendarNewPage() {
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
  const [date, setDate] = useState(params.get("d") ?? todayIso());
  const [kind, setKind] = useState<CalendarKind>("manual");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");

  const submit = async () => {
    if (!title.trim() || !date) return;
    await save("calendar_entry", { date, kind, source: "manual", title: title.trim(), short: title.trim().slice(0, 12), done: 0, notes: notes.trim() || undefined });
    toast("Added");
    router.push(`/calendar/?d=${date}`);
  };

  return (
    <Page title="Calendar entry" back={true}>
      <div className="card stack-sm">
        <Field label="What">
          <TextInput value={title} onChange={setTitle} placeholder="Feed delivery, payday, weigh Room 4…" autoFocus />
        </Field>
        <Field label="Date">
          <DateInput value={date} onChange={setDate} />
        </Field>
        <Field label="Colour">
          <div className="chips">
            {KINDS.map((k) => (
              <button key={k.value} type="button" className="chip" aria-pressed={kind === k.value} onClick={() => setKind(k.value)}>
                <span className={`dot k-${k.value}`} /> {k.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Notes">
          <TextArea value={notes} onChange={setNotes} />
        </Field>
      </div>
      <button type="button" className="btn xl primary block" disabled={!title.trim()} onClick={submit}>
        Add to calendar
      </button>
    </Page>
  );
}
