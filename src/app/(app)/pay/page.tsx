"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { useToday } from "@/db/hooks";
import type { Employee, Payroll } from "@/db/schema";
import { patch, save } from "@/db/write";
import { useToast } from "@/components/AppShell";
import { PaySheet } from "@/components/PaySheet";
import { DateInput, Empty, Field, NumInput, Page, Sheet, TextInput } from "@/components/ui";
import { addMonths, monthKey } from "@/domain/dates";
import { fmtDate, fmtK, fmtMonth, plural } from "@/domain/format";
import { nextOccurrence, payOccurrenceAmount } from "@/domain/schedule";
import { daysInMonth } from "@/domain/dates";

export default function PayPage() {
  const today = useToday();
  const { toast } = useToast();
  const employees = useLiveQuery(() => db.employee.toArray(), []);
  const payroll = useLiveQuery(() => db.payroll.toArray(), []);
  const schedules = useLiveQuery(() => db.schedule.where("kind").equals("pay").toArray(), []);
  const [paying, setPaying] = useState<string | null>(null);
  const [editing, setEditing] = useState<Employee | "new" | null>(null);

  const byEmployee = useMemo(() => {
    const m = new Map<string, Payroll[]>();
    for (const p of payroll ?? []) {
      const l = m.get(p.employee_id) ?? [];
      l.push(p);
      m.set(p.employee_id, l);
    }
    for (const l of m.values()) l.sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : 0));
    return m;
  }, [payroll]);

  const months = useMemo(() => [5, 4, 3, 2, 1, 0].map((n) => addMonths(monthKey(today), -n)), [today]);

  return (
    <Page
      title="Pay"
      back="/more/"
      right={
        <button type="button" className="btn sm soft" onClick={() => setEditing("new")}>
          + Worker
        </button>
      }
    >
      {(employees ?? []).length === 0 && (
        <div className="card">
          <Empty ico="👷">No workers recorded.</Empty>
        </div>
      )}
      {(employees ?? []).map((e) => {
        const rows = byEmployee.get(e.id) ?? [];
        const thisMonth = rows.filter((p) => p.period === monthKey(today));
        const unpaid = rows.filter((p) => !p.paid_on);
        const allTime = rows.reduce((s, p) => s + p.amount, 0);
        const rules = (schedules ?? []).filter((s) => s.employee_id === e.id && s.active);
        const perMonth = months.map((m) => {
          const inMonth = rows.filter((p) => p.period === m);
          return {
            month: m,
            salary: inMonth.filter((p) => p.kind !== "advance").reduce((s, p) => s + p.amount, 0),
            advance: inMonth.filter((p) => p.kind === "advance").reduce((s, p) => s + p.amount, 0),
          };
        });
        const maxMonth = Math.max(1, ...perMonth.map((x) => x.salary + x.advance));
        return (
          <section key={e.id} className="stack">
            <div className="card">
              <div className="between">
                <div>
                  <h2 style={{ marginBottom: 2 }}>{e.name}</h2>
                  <div className="small muted">
                    {e.role ?? "—"}
                    {e.start_date ? ` · since ${fmtDate(e.start_date)}` : ""}
                    {e.pay_rate ? ` · ${fmtK(e.pay_rate)} ${e.pay_frequency ?? ""}` : ""}
                    {e.status === "former" ? " · former" : ""}
                  </div>
                </div>
                <button type="button" className="btn sm" onClick={() => setEditing(e)}>
                  Edit
                </button>
              </div>
              <div className="kpis mt">
                <div className="kpi hero">
                  <span className="k">{fmtMonth(monthKey(today))}</span>
                  <span className="v">{fmtK(thisMonth.reduce((s, p) => s + p.amount, 0))}</span>
                  <span className="n">
                    {thisMonth.length ? `${thisMonth.filter((p) => p.kind === "advance").length ? "incl. advances" : "salary"}` : "nothing recorded yet"}
                  </span>
                </div>
                <div className="kpi">
                  <span className="k">All time</span>
                  <span className="v">{fmtK(allTime)}</span>
                  <span className="n">{plural(rows.length, "payment")}</span>
                </div>
                {unpaid.length > 0 && (
                  <div className="kpi">
                    <span className="k">Still unpaid</span>
                    <span className="v danger">{fmtK(unpaid.reduce((s, p) => s + p.amount, 0))}</span>
                    <span className="n">{unpaid.map((p) => fmtMonth(p.period)).join(", ")}</span>
                  </div>
                )}
              </div>
              <button type="button" className="btn lg primary block mt" onClick={() => setPaying(e.id)}>
                Record a payment
              </button>
            </div>

            <div className="card">
              <div className="eyebrow">Last six months</div>
              <div className="stack-sm mt">
                {perMonth.map((m) => (
                  <div key={m.month} className="hstack small">
                    <span style={{ width: 64 }} className="muted">
                      {fmtMonth(m.month).slice(0, 3)}
                    </span>
                    <div className="grow" style={{ display: "flex", gap: 2 }}>
                      <span className="bar salary" style={{ width: `${(m.salary / maxMonth) * 100}%`, borderRadius: m.advance ? 0 : undefined }} />
                      {m.advance > 0 && <span className="bar advance" style={{ width: `${(m.advance / maxMonth) * 100}%` }} />}
                    </div>
                    <span className="num bold" style={{ width: 72, textAlign: "right" }}>
                      {fmtK(m.salary + m.advance)}
                    </span>
                  </div>
                ))}
                <div className="legend">
                  <span>
                    <span className="bar salary" style={{ width: 14 }} /> salary & bonus
                  </span>
                  <span>
                    <span className="bar advance" style={{ width: 14 }} /> advances
                  </span>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="between">
                <div className="eyebrow">Paydays</div>
                <Link href="/schedule/" className="small" style={{ color: "var(--accent)", fontWeight: 700 }}>
                  Edit schedule ›
                </Link>
              </div>
              {rules.length === 0 ? (
                <p className="small muted mt">No payday on the schedule.</p>
              ) : (
                <div className="small mt">
                  {e.pay_rate && (
                    <p className="muted" style={{ marginBottom: 6 }}>
                      {fmtK(e.pay_rate)} a month —{" "}
                      {rules
                        .map((s) => {
                          const day = Number(s.anchor.slice(8));
                          const when = s.cadence !== "monthly" ? s.cadence : day === daysInMonth(s.anchor) ? "the last day" : `the ${day}th`;
                          return `${s.amount_mode === "balance" ? "the balance" : fmtK(s.amount)} on ${when}`;
                        })
                        .join(", ")}
                      .
                    </p>
                  )}
                  {rules.map((s) => {
                    const next = nextOccurrence(s, today);
                    const due = next ? payOccurrenceAmount(s, next, e, rows) : { amount: s.amount };
                    return (
                      <div key={s.id} className="stat-line">
                        <span className="k">{s.title}</span>
                        <span className="v">
                          {fmtK(due.amount)} · {fmtDate(next)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <details className="plain card">
              <summary>{plural(rows.length, "payment")} on record</summary>
              <div className="small mt">
                {rows.slice(0, 60).map((p) => (
                  <div key={p.id} className="stat-line">
                    <span className="k">
                      {fmtMonth(p.period)} · {p.kind}
                      {!p.paid_on ? <span className="badge danger" style={{ marginLeft: 6 }}>unpaid</span> : ""}
                    </span>
                    <span className="v">{fmtK(p.amount)}</span>
                  </div>
                ))}
              </div>
            </details>
          </section>
        );
      })}

      <p className="tiny faint">
        Pay is labour in cost-per-pig. Domestic help is not farm labour and does not belong here.
      </p>

      <PaySheet open={!!paying} onClose={() => setPaying(null)} employeeId={paying ?? undefined} onDone={(a) => toast(`${fmtK(a)} recorded`)} />
      {editing && (
        <EmployeeSheet
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

function EmployeeSheet({ existing, onClose, onDone }: { existing?: Employee; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(existing?.name ?? "");
  const [role, setRole] = useState(existing?.role ?? "Farm worker");
  const [start, setStart] = useState(existing?.start_date ?? "");
  const [rate, setRate] = useState(existing?.pay_rate?.toString() ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [active, setActive] = useState(existing ? existing.status === "active" : true);
  const submit = async () => {
    if (!name.trim()) return;
    const fields = {
      name: name.trim(),
      role: role.trim() || undefined,
      start_date: start || undefined,
      pay_rate: rate ? Number(rate) : undefined,
      pay_frequency: "monthly",
      phone: phone.trim() || undefined,
      status: (active ? "active" : "former") as Employee["status"],
    };
    if (existing) await patch("employee", existing.id, fields);
    else await save("employee", fields);
    onDone();
  };
  return (
    <Sheet open onClose={onClose} title={existing ? existing.name : "New worker"}>
      <Field label="Name">
        <TextInput value={name} onChange={setName} autoFocus={!existing} />
      </Field>
      <div className="grid-2">
        <Field label="Role">
          <TextInput value={role} onChange={setRole} />
        </Field>
        <Field label="Started">
          <DateInput value={start} onChange={setStart} />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Monthly pay">
          <NumInput value={rate} onChange={setRate} unit="K" step={1} />
        </Field>
        <Field label="Phone">
          <TextInput value={phone} onChange={setPhone} type="tel" />
        </Field>
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Currently working here
      </label>
      <button type="button" className="btn lg primary" disabled={!name.trim()} onClick={submit}>
        Save
      </button>
    </Sheet>
  );
}
