"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import type { Payroll, Schedule } from "@/db/schema";
import { patch, save, todayIso } from "@/db/write";
import { regenerateCalendar } from "@/db/calendar";
import { fmtK } from "@/domain/format";
import { payOccurrenceAmount } from "@/domain/schedule";
import { DateInput, Field, NumInput, Seg, Select, Sheet, TextInput } from "./ui";

const KIND_LABEL: Record<Payroll["kind"], string> = { salary: "Salary", advance: "Advance", bonus: "Bonus" };

/**
 * Record a payment to a worker. Writes the payroll row and the matching
 * labour cost line in one go, and — when it came from a scheduled payday —
 * marks that occurrence done so the calendar moves on.
 */
export function PaySheet({
  open,
  onClose,
  onDone,
  schedule,
  occurrence,
  employeeId,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (amount: number) => void;
  schedule?: Schedule;
  occurrence?: string; // the scheduled date being settled
  employeeId?: string;
}) {
  const employees = useLiveQuery(() => db.employee.where("status").equals("active").toArray(), []);
  const payroll = useLiveQuery(() => db.payroll.toArray(), []);
  const [employee, setEmployee] = useState(schedule?.employee_id ?? employeeId ?? "");
  const [amount, setAmount] = useState(schedule?.amount?.toString() ?? "");
  const [kind, setKind] = useState<Payroll["kind"]>(schedule?.pay_kind ?? "salary");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const [explain, setExplain] = useState<string | undefined>();
  useEffect(() => {
    if (!open) return;
    const empId = schedule?.employee_id ?? employeeId ?? employees?.[0]?.id ?? "";
    setEmployee(empId);
    const due = schedule ? payOccurrenceAmount(schedule, occurrence ?? todayIso(), employees?.find((e) => e.id === empId), payroll ?? []) : undefined;
    setAmount(due?.amount !== undefined ? String(due.amount) : (schedule?.amount?.toString() ?? ""));
    setExplain(due?.explain);
    setKind(schedule?.pay_kind ?? "salary");
    setDate(todayIso());
    setNote("");
  }, [open, schedule, occurrence, employeeId, employees, payroll]);

  const emp = employees?.find((e) => e.id === employee);
  const valid = !!employee && Number(amount) > 0 && !!date && !saving;

  const submit = async () => {
    if (!valid || !emp) return;
    setSaving(true);
    try {
      const period = (occurrence ?? date).slice(0, 7);
      const cost = await save("cost", {
        date,
        date_precision: "day",
        category: "labour",
        item: `${emp.name} ${KIND_LABEL[kind].toLowerCase()}`,
        total: Number(amount),
        recurring: kind === "salary" ? 1 : 0,
        is_capital: 0,
        allocation: "farm",
        confidence: "high",
        payment_status: "paid",
        source_note: note.trim() || (schedule ? `scheduled: ${schedule.title}` : undefined),
      });
      await save("payroll", { employee_id: emp.id, period, amount: Number(amount), kind, paid_on: date, cost_id: cost.id });
      if (schedule && occurrence && (!schedule.last_done || occurrence > schedule.last_done)) {
        await patch("schedule", schedule.id, { last_done: occurrence });
      }
      await regenerateCalendar();
      onDone(Number(amount));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={schedule ? `Record: ${schedule.title}` : "Record a payment"}>
      {(employees?.length ?? 0) > 1 || !schedule ? (
        <Field label="Who">
          <Select value={employee} onChange={setEmployee} placeholder="Pick a worker" options={(employees ?? []).map((e) => ({ value: e.id, label: e.name }))} />
        </Field>
      ) : (
        <p className="bold">{emp?.name}</p>
      )}
      <Seg
        value={kind}
        onChange={setKind}
        options={[
          { value: "salary", label: "Salary" },
          { value: "advance", label: "Advance" },
          { value: "bonus", label: "Bonus" },
        ]}
      />
      <div className="grid-2">
        <Field label="Amount" hint={explain}>
          <NumInput value={amount} onChange={setAmount} unit="K" big step={1} autoFocus={!schedule} />
        </Field>
        <Field label="Paid on">
          <DateInput value={date} onChange={setDate} />
        </Field>
      </div>
      <Field label="Note">
        <TextInput value={note} onChange={setNote} placeholder="optional" />
      </Field>
      <p className="small muted">
        Writes a labour cost line of {amount ? fmtK(Number(amount)) : "—"} as well, so cost-per-pig stays right.
        {kind === "advance" ? " Advances are pay, not salary — they are counted separately on the Pay screen." : ""}
      </p>
      <button type="button" className="btn lg primary" disabled={!valid} onClick={submit}>
        Record {KIND_LABEL[kind].toLowerCase()}
      </button>
    </Sheet>
  );
}
