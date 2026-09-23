"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { HEALTH_TYPES, STAGE_LABEL, STAGES, type HealthEventType, type HealthProtocol, type Stage } from "@/db/schema";
import { patch, remove, save } from "@/db/write";
import { regenerateCalendar } from "@/db/calendar";
import { useToast } from "@/components/AppShell";
import { DateInput, Empty, Field, NumInput, Page, Select, Sheet, TextInput } from "@/components/ui";

export default function ProtocolsPage() {
  const { toast } = useToast();
  const protocols = useLiveQuery(() => db.health_protocol.toArray(), []);
  const [editing, setEditing] = useState<HealthProtocol | "new" | null>(null);

  return (
    <Page
      title="Health protocols"
      back="/more/"
      right={
        <button type="button" className="btn sm primary" onClick={() => setEditing("new")}>
          + Rule
        </button>
      }
    >
      <p className="small muted">
        Rules that put vaccination and deworming dates on the calendar automatically. None are on record yet — only two injections appear in sixteen months of notes.
      </p>
      <div className="card tight">
        {!protocols?.length ? (
          <Empty ico="💉">No rules yet. Add &ldquo;deworm every 12 weeks&rdquo; and the calendar does the remembering.</Empty>
        ) : (
          <div className="list">
            {protocols.map((p) => (
              <button key={p.id} type="button" className="row" onClick={() => setEditing(p)}>
                <div className="body">
                  <div className="title">
                    {p.name} {!p.active && <span className="badge">off</span>}
                  </div>
                  <div className="sub">
                    {p.type} · {p.applies_to_stage && p.applies_to_stage !== "all" ? STAGE_LABEL[p.applies_to_stage] : "all stages"} ·{" "}
                    {p.trigger === "age_days"
                      ? `at ${p.trigger_value} days old${p.interval_days ? `, then every ${p.interval_days} days` : ""}`
                      : p.trigger === "days_since_last"
                        ? `every ${p.interval_days} days`
                        : `on ${p.fixed_date}`}
                    {p.product ? ` · ${p.product}` : ""}
                  </div>
                </div>
                <span className="chev">›</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {editing && (
        <ProtocolSheet
          existing={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            toast("Saved");
            setEditing(null);
          }}
        />
      )}
    </Page>
  );
}

function ProtocolSheet({ existing, onClose, onDone }: { existing?: HealthProtocol; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(existing?.name ?? "");
  const [type, setType] = useState<HealthEventType>(existing?.type ?? "deworming");
  const [stage, setStage] = useState<Stage | "all">(existing?.applies_to_stage ?? "all");
  const [trigger, setTrigger] = useState<HealthProtocol["trigger"]>(existing?.trigger ?? "days_since_last");
  const [triggerValue, setTriggerValue] = useState(existing?.trigger_value?.toString() ?? "");
  const [interval, setInterval] = useState(existing?.interval_days?.toString() ?? "");
  const [fixed, setFixed] = useState(existing?.fixed_date ?? "");
  const [product, setProduct] = useState(existing?.product ?? "");
  const [active, setActive] = useState(existing ? !!existing.active : true);

  const valid = name.trim() && (trigger === "fixed_date" ? !!fixed : trigger === "age_days" ? !!triggerValue : !!interval);

  const submit = async () => {
    const fields = {
      name: name.trim(),
      type,
      applies_to_stage: stage,
      trigger,
      trigger_value: triggerValue ? Number(triggerValue) : undefined,
      interval_days: interval ? Number(interval) : undefined,
      fixed_date: trigger === "fixed_date" ? fixed : undefined,
      product: product.trim() || undefined,
      active: (active ? 1 : 0) as 0 | 1,
    };
    if (existing) await patch("health_protocol", existing.id, fields);
    else await save("health_protocol", fields);
    await regenerateCalendar();
    onDone();
  };

  return (
    <Sheet open onClose={onClose} title={existing ? "Edit rule" : "New rule"}>
      <Field label="Name">
        <TextInput value={name} onChange={setName} placeholder="Deworm growers" autoFocus />
      </Field>
      <div className="grid-2">
        <Field label="Type">
          <Select value={type} onChange={(v) => v && setType(v)} options={HEALTH_TYPES.map((t) => ({ value: t, label: t }))} />
        </Field>
        <Field label="Applies to">
          <Select value={stage} onChange={(v) => v && setStage(v)} options={[{ value: "all" as const, label: "All stages" }, ...STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] }))]} />
        </Field>
      </div>
      <Field label="When">
        <div className="chips">
          <button type="button" className="chip" aria-pressed={trigger === "days_since_last"} onClick={() => setTrigger("days_since_last")}>
            Every N days
          </button>
          <button type="button" className="chip" aria-pressed={trigger === "age_days"} onClick={() => setTrigger("age_days")}>
            At an age
          </button>
          <button type="button" className="chip" aria-pressed={trigger === "fixed_date"} onClick={() => setTrigger("fixed_date")}>
            On a date
          </button>
        </div>
      </Field>
      {trigger === "age_days" && (
        <Field label="Age">
          <NumInput value={triggerValue} onChange={setTriggerValue} unit="days" step={1} />
        </Field>
      )}
      {trigger !== "fixed_date" ? (
        <Field label={trigger === "age_days" ? "Then repeat every (optional)" : "Every"}>
          <NumInput value={interval} onChange={setInterval} unit="days" step={1} />
        </Field>
      ) : (
        <Field label="Date">
          <DateInput value={fixed} onChange={setFixed} />
        </Field>
      )}
      <Field label="Product">
        <TextInput value={product} onChange={setProduct} placeholder="optional" />
      </Field>
      <label className="checkbox">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
      </label>
      <div className="actions">
        {existing && (
          <button
            type="button"
            className="btn lg danger"
            onClick={async () => {
              await remove("health_protocol", existing.id);
              await regenerateCalendar();
              onDone();
            }}
          >
            Delete
          </button>
        )}
        <button type="button" className="btn lg primary" disabled={!valid} onClick={submit}>
          Save
        </button>
      </div>
    </Sheet>
  );
}
