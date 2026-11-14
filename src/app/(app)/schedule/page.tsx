"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { useAnimals, useSettings, useToday } from "@/db/hooks";
import { CADENCE_LABEL, type Cadence, type Schedule } from "@/db/schema";
import { patch, remove, save, todayIso } from "@/db/write";
import { regenerateCalendar } from "@/db/calendar";
import { useToast } from "@/components/AppShell";
import { PaySheet } from "@/components/PaySheet";
import { Checkbox, Computed, DateInput, Empty, Field, NumInput, Page, SectionTitle, Seg, Select, Sheet, TextInput } from "@/components/ui";
import { addDays } from "@/domain/dates";
import { fmtDate, fmtDayMonth, fmtK, fmtKg, fmtNum, plural } from "@/domain/format";
import { bagsForOccurrence, feedNeedByProduct, nextOccurrence, productRunOut, type ProductNeed } from "@/domain/schedule";

export default function SchedulePage() {
  const today = useToday();
  const { toast } = useToast();
  const settings = useSettings();
  const animals = useAnimals();
  const schedules = useLiveQuery(() => db.schedule.toArray(), []);
  const products = useLiveQuery(() => db.feed_product.toArray(), []);
  const rations = useLiveQuery(() => db.ration.toArray(), []);
  const groups = useLiveQuery(() => db.group.toArray(), []);
  const litters = useLiveQuery(() => db.litter.toArray(), []);
  const employees = useLiveQuery(() => db.employee.toArray(), []);
  const entries = useLiveQuery(() => db.calendar_entry.where("source").equals("schedule").toArray(), []);
  const [editing, setEditing] = useState<Schedule | "new" | null>(null);
  const [paying, setPaying] = useState<{ schedule: Schedule; occurrence: string } | null>(null);

  const productMap = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);
  const need = useMemo<Map<string, ProductNeed>>(
    () => (rations && groups && animals && litters ? feedNeedByProduct(rations, productMap, groups, animals, litters, settings, today) : new Map()),
    [rations, groups, animals, litters, productMap, settings, today],
  );

  // The cash plan: what the schedule says leaves the farm in the next 30 days.
  const horizon = addDays(today, 30);
  const upcoming = (entries ?? [])
    .filter((e) => !e.done && e.date <= horizon)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const planTotal = upcoming.reduce((s, e) => s + (e.amount ?? 0), 0);
  const payTotal = upcoming.filter((e) => e.short === "Pay").reduce((s, e) => s + (e.amount ?? 0), 0);
  const feedTotal = planTotal - payTotal;

  const scheduleById = new Map((schedules ?? []).map((s) => [s.id, s]));

  return (
    <Page
      title="Pay & feed schedule"
      back="/more/"
      right={
        <button type="button" className="btn sm primary" onClick={() => setEditing("new")}>
          + Rule
        </button>
      }
    >
      <section>
        <SectionTitle action={<span className="small muted">next 30 days</span>}>Cash plan</SectionTitle>
        <div className="kpis mt">
          <div className="kpi hero">
            <span className="k">Leaving the farm</span>
            <span className="v">{fmtK(planTotal)}</span>
            <span className="n">by {fmtDate(horizon)}</span>
          </div>
          <div className="kpi">
            <span className="k">Pay</span>
            <span className="v">{fmtK(payTotal)}</span>
          </div>
          <div className="kpi">
            <span className="k">Feed</span>
            <span className="v">{fmtK(feedTotal)}</span>
          </div>
        </div>
        <div className="card tight mt">
          {upcoming.length === 0 ? (
            <Empty ico="📆">Nothing scheduled in the next 30 days.</Empty>
          ) : (
            <div className="list">
              {upcoming.map((e) => {
                const s = e.schedule_id ? scheduleById.get(e.schedule_id) : undefined;
                const overdue = e.date < today;
                return (
                  <div key={e.id} className="row">
                    <div style={{ width: 52 }}>
                      <div className={`bold ${overdue ? "danger" : ""}`}>{fmtDayMonth(e.date)}</div>
                    </div>
                    <div className="body">
                      <div className="title" style={{ whiteSpace: "normal" }}>
                        {e.title}
                      </div>
                      {e.notes && <div className="sub" style={{ whiteSpace: "normal" }}>{e.notes}</div>}
                    </div>
                    {s?.kind === "pay" ? (
                      <button type="button" className="btn sm primary" onClick={() => setPaying({ schedule: s, occurrence: e.date })}>
                        Record
                      </button>
                    ) : s?.kind === "feed" ? (
                      <Link href={`/feed/purchase/?product=${s.product_id ?? ""}&bags=${bagsForOccurrence(s, need.get(s.product_id ?? "")) ?? ""}&schedule=${s.id}&occ=${e.date}`} className="btn sm primary">
                        Bought
                      </Link>
                    ) : (
                      <button type="button" className="btn sm" onClick={() => patch("calendar_entry", e.id, { done: 1, done_date: todayIso() })}>
                        Done
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section>
        <SectionTitle>Rules</SectionTitle>
        <div className="card tight mt">
          {(schedules ?? []).length === 0 ? (
            <Empty ico="🗓">No rules yet.</Empty>
          ) : (
            <div className="list">
              {(schedules ?? [])
                .slice()
                .sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title))
                .map((s) => {
                  const product = s.product_id ? productMap.get(s.product_id) : undefined;
                  const n = s.product_id ? need.get(s.product_id) : undefined;
                  const bags = s.kind === "feed" ? bagsForOccurrence(s, n) : undefined;
                  const unit = product?.unit_label === "bucket" ? "bucket" : "bag";
                  const runOut = product && n ? productRunOut(product, n, today) : undefined;
                  const next = nextOccurrence(s, today);
                  const late = runOut && next && runOut.date < next;
                  return (
                    <button key={s.id} type="button" className="row" onClick={() => setEditing(s)} style={{ alignItems: "flex-start" }}>
                      <div className="body">
                        <div className="title">
                          {s.title}
                          {!s.active && <span className="badge" style={{ marginLeft: 6 }}>off</span>}
                        </div>
                        <div className="sub" style={{ whiteSpace: "normal" }}>
                          {CADENCE_LABEL[s.cadence].toLowerCase()}
                          {next ? ` · next ${fmtDate(next)}` : ""}
                          {s.kind === "pay" ? (s.amount_mode === "balance" ? ` · balance of ${fmtK(employees?.find((e) => e.id === s.employee_id)?.pay_rate)} a month` : ` · ${fmtK(s.amount)}`) : ""}
                          {s.kind === "feed" && product
                            ? ` · ${bags !== undefined ? `${bags} ${unit}s` : "quantity not set"}${n ? ` for ${plural(n.head, "pig")}` : " — no ration uses it"}`
                            : ""}
                        </div>
                        {late && (
                          <div className="sub danger" style={{ whiteSpace: "normal" }}>
                            ⚠ {product?.name} runs out ~{fmtDate(runOut.date)}, before the next buy on {fmtDate(next)}.
                          </div>
                        )}
                      </div>
                      <span className="chev">›</span>
                    </button>
                  );
                })}
            </div>
          )}
        </div>
        <p className="tiny faint mt">
          Feed quantities come from the rations the herd is on today: {fmtKg([...need.values()].reduce((s, n) => s + n.kgPerDay, 0), 1)} a day across{" "}
          {plural(new Set([...need.values()].flatMap((n) => n.via.map((v) => v.groupName))).size, "group")}. Fix the bags on a rule if you buy a set amount.
        </p>
      </section>

      {editing && (
        <RuleSheet
          existing={editing === "new" ? undefined : editing}
          products={products ?? []}
          employees={employees ?? []}
          need={need}
          onClose={() => setEditing(null)}
          onDone={() => {
            toast("Saved");
            setEditing(null);
          }}
        />
      )}
      <PaySheet
        open={!!paying}
        onClose={() => setPaying(null)}
        schedule={paying?.schedule}
        occurrence={paying?.occurrence}
        onDone={(a) => toast(`${fmtK(a)} recorded`)}
      />
    </Page>
  );
}

function RuleSheet({
  existing,
  products,
  employees,
  need,
  onClose,
  onDone,
}: {
  existing?: Schedule;
  products: { id: string; name: string; unit_label?: string; current_price_per_bag?: number; kind: string }[];
  employees: { id: string; name: string; pay_rate?: number }[];
  need: Map<string, { unitsPerDay: number; head: number; kgPerDay: number }>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [kind, setKind] = useState<Schedule["kind"]>(existing?.kind ?? "feed");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [cadence, setCadence] = useState<Cadence>(existing?.cadence ?? "fortnightly");
  const [anchor, setAnchor] = useState(existing?.anchor ?? todayIso());
  const [amount, setAmount] = useState(existing?.amount?.toString() ?? "");
  const [employee, setEmployee] = useState(existing?.employee_id ?? employees[0]?.id ?? "");
  const [payKind, setPayKind] = useState<NonNullable<Schedule["pay_kind"]>>(existing?.pay_kind ?? "salary");
  const [amountMode, setAmountMode] = useState<"fixed" | "balance">(existing?.amount_mode ?? "fixed");
  const [product, setProduct] = useState(existing?.product_id ?? "");
  const [bags, setBags] = useState(existing?.bags?.toString() ?? "");
  const [active, setActive] = useState(existing ? !!existing.active : true);
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const p = products.find((x) => x.id === product);
  const n = product ? need.get(product) : undefined;
  const computedBags = n ? Math.ceil(n.unitsPerDay * (cadence === "weekly" ? 7 : cadence === "fortnightly" ? 14 : 30.44)) : undefined;
  const unit = p?.unit_label === "bucket" ? "bucket" : "bag";

  const autoTitle =
    kind === "feed" ? (p ? `Buy ${p.name}` : "") : kind === "pay" ? `${employees.find((e) => e.id === employee)?.name ?? "Pay"} — ${payKind}` : "";
  const payee = employees.find((e) => e.id === employee);
  const valid = !!anchor && (kind === "feed" ? !!product : kind === "pay" ? !!employee && (amountMode === "balance" ? !!payee?.pay_rate : Number(amount) > 0) : !!title.trim());

  const submit = async () => {
    if (!valid) return;
    const fields = {
      kind,
      title: title.trim() || autoTitle,
      cadence,
      anchor,
      amount: kind === "pay" ? (amountMode === "balance" ? (payee?.pay_rate ?? (Number(amount) || undefined)) : Number(amount)) : amount ? Number(amount) : undefined,
      amount_mode: kind === "pay" ? amountMode : undefined,
      employee_id: kind === "pay" ? employee : undefined,
      pay_kind: kind === "pay" ? payKind : undefined,
      product_id: kind === "feed" ? product : undefined,
      bags: kind === "feed" && bags ? Number(bags) : undefined,
      active: (active ? 1 : 0) as 0 | 1,
      notes: notes.trim() || undefined,
    };
    if (existing) await patch("schedule", existing.id, fields);
    else await save("schedule", fields);
    await regenerateCalendar();
    onDone();
  };

  return (
    <Sheet open onClose={onClose} title={existing ? "Edit rule" : "New rule"}>
      <Seg
        value={kind}
        onChange={setKind}
        options={[
          { value: "feed", label: "Feed buying" },
          { value: "pay", label: "Payday" },
          { value: "other", label: "Other" },
        ]}
      />
      {kind === "feed" && (
        <>
          <Field label="Product">
            <Select value={product} onChange={setProduct} placeholder="Which feed?" options={products.filter((x) => x.kind !== "additive").map((x) => ({ value: x.id, label: x.name }))} />
          </Field>
          <Field
            label={`${unit === "bucket" ? "Buckets" : "Bags"} per purchase`}
            hint={
              n
                ? `Leave empty to buy what the herd needs: ${computedBags} ${unit}s per ${CADENCE_LABEL[cadence].toLowerCase().replace("every ", "")} (${n.unitsPerDay.toFixed(2)} a day for ${n.head} pigs)`
                : p
                  ? "No active ration uses this product, so the need cannot be computed — set the quantity."
                  : undefined
            }
          >
            <NumInput value={bags} onChange={setBags} step={1} placeholder={computedBags !== undefined ? String(computedBags) : ""} />
          </Field>
        </>
      )}
      {kind === "pay" && (
        <>
          <Field label="Who">
            <Select value={employee} onChange={setEmployee} placeholder="Pick a worker" options={employees.map((e) => ({ value: e.id, label: e.name }))} />
          </Field>
          <Field label="Kind">
            <Select value={payKind} onChange={(v) => v && setPayKind(v)} options={[{ value: "salary" as const, label: "Salary" }, { value: "advance" as const, label: "Advance" }, { value: "bonus" as const, label: "Bonus" }]} />
          </Field>
          <Field label="Amount">
            <Seg
              value={amountMode}
              onChange={setAmountMode}
              options={[
                { value: "fixed", label: "Fixed amount" },
                { value: "balance", label: "Balance of monthly pay" },
              ]}
            />
          </Field>
          {amountMode === "fixed" ? (
            <NumInput value={amount} onChange={setAmount} unit="K" step={1} />
          ) : (
            <p className="small muted">
              {payee?.pay_rate
                ? `${payee.name} is on ${fmtK(payee.pay_rate)} a month; this payday pays what is left after the advances already taken that month.`
                : "Set the worker's monthly pay under Pay first."}
            </p>
          )}
        </>
      )}
      {kind === "other" && (
        <div className="grid-2">
          <Field label="What">
            <TextInput value={title} onChange={setTitle} placeholder="Electricity, rent…" />
          </Field>
          <Field label="Amount">
            <NumInput value={amount} onChange={setAmount} unit="K" step={1} />
          </Field>
        </div>
      )}
      <div className="grid-2">
        <Field label="How often">
          <Select value={cadence} onChange={(v) => v && setCadence(v)} options={(Object.keys(CADENCE_LABEL) as Cadence[]).map((c) => ({ value: c, label: CADENCE_LABEL[c] }))} />
        </Field>
        <Field label={cadence === "monthly" ? "First date (its day repeats)" : "First date"} hint={cadence === "monthly" ? "The last day of a month means month end." : undefined}>
          <DateInput value={anchor} onChange={setAnchor} />
        </Field>
      </div>
      {kind !== "other" && (
        <Field label="Name">
          <TextInput value={title} onChange={setTitle} placeholder={autoTitle} />
        </Field>
      )}
      <Field label="Notes">
        <TextInput value={notes} onChange={setNotes} />
      </Field>
      <Checkbox checked={active} onChange={setActive}>
        Active
      </Checkbox>
      {kind === "feed" && p?.current_price_per_bag && (computedBags || bags) && (
        <p className="small muted">
          About{" "}
          <Computed
            value={fmtK((Number(bags) || computedBags || 0) * p.current_price_per_bag)}
            formula={`${unit}s × price per ${unit}`}
            inputs={[
              { label: `${unit}s`, value: fmtNum(Number(bags) || computedBags || 0) },
              { label: `Price per ${unit}`, value: fmtK(p.current_price_per_bag) },
            ]}
          />{" "}
          each time.
        </p>
      )}
      <div className="actions">
        {existing && (
          <button
            type="button"
            className="btn lg danger"
            onClick={async () => {
              await remove("schedule", existing.id);
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
