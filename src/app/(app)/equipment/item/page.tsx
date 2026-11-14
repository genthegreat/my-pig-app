"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import {
  EQUIPMENT_CATEGORY_LABEL,
  EQUIPMENT_CONDITION_LABEL,
  EQUIPMENT_STATUS_LABEL,
  type Cost,
  type Equipment,
  type EquipmentCategory,
  type EquipmentCondition,
  type EquipmentStatus,
} from "@/db/schema";
import { patch, save, todayIso } from "@/db/write";
import { useToast } from "@/components/AppShell";
import { Checkbox, Confirm, DateInput, Field, NumInput, Page, Select, Sheet, TextArea, TextInput } from "@/components/ui";
import { fmtDate, fmtK, fmtMonth, plural } from "@/domain/format";

export default function EquipmentItemPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const id = useSearchParams().get("id");
  const existing = useLiveQuery(async () => (id ? await db.equipment.get(id) : undefined), [id]);
  const costs = useLiveQuery(async (): Promise<Cost[]> => (id ? await db.cost.where("equipment_id").equals(id).toArray() : []), [id]);
  if (id && !existing) return <Page title="…" back="/equipment/">{null}</Page>;
  return <Form key={existing?.id ?? "new"} existing={existing} costs={(costs ?? []).sort((a, b) => (a.date < b.date ? 1 : -1))} />;
}

function Form({ existing, costs }: { existing?: Equipment; costs: Cost[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(existing?.name ?? "");
  const [category, setCategory] = useState<EquipmentCategory>(existing?.category ?? "tool");
  const [quantity, setQuantity] = useState(existing?.quantity?.toString() ?? "1");
  const [bought, setBought] = useState(existing?.bought_on ?? todayIso());
  const [cost, setCost] = useState(existing?.cost?.toString() ?? "");
  const [supplier, setSupplier] = useState(existing?.supplier ?? "");
  const [condition, setCondition] = useState<EquipmentCondition>(existing?.condition ?? "good");
  const [status, setStatus] = useState<EquipmentStatus>(existing?.status ?? "in_use");
  const [location, setLocation] = useState(existing?.location ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [recordCost, setRecordCost] = useState(!existing);
  const [repair, setRepair] = useState<{ what: string; amount: string; date: string } | null>(null);
  const [confirmDispose, setConfirmDispose] = useState(false);

  const purchase = costs.find((c) => c.id === existing?.cost_id);
  const repairs = costs.filter((c) => c.id !== existing?.cost_id);
  const valid = name.trim() && Number(quantity) > 0;

  const submit = async () => {
    if (!valid) return;
    const fields = {
      name: name.trim(),
      category,
      quantity: Number(quantity),
      bought_on: bought || undefined,
      date_precision: existing?.date_precision === "month" && bought === existing.bought_on ? ("month" as const) : ("day" as const),
      cost: cost ? Number(cost) : undefined,
      supplier: supplier.trim() || undefined,
      condition,
      status,
      location: location.trim() || undefined,
      last_checked: todayIso(),
      notes: notes.trim() || undefined,
    };
    if (existing) {
      await patch("equipment", existing.id, fields);
      toast("Saved");
      router.push("/equipment/");
      return;
    }
    let costId: string | undefined;
    if (recordCost && cost) {
      const c = await save("cost", {
        date: bought || todayIso(),
        date_precision: "day",
        category: "equipment",
        item: `${name.trim()}${Number(quantity) > 1 ? ` × ${quantity}` : ""}`,
        quantity: Number(quantity),
        total: Number(cost),
        supplier: supplier.trim() || undefined,
        recurring: 0,
        is_capital: 0,
        allocation: "farm",
        confidence: "high",
        payment_status: "paid",
        source_note: "equipment register",
      });
      costId = c.id;
    }
    const item = await save("equipment", { ...fields, cost_id: costId });
    if (costId) await patch("cost", costId, { equipment_id: item.id });
    toast("Added to the register");
    router.push("/equipment/");
  };

  const logRepair = async () => {
    if (!existing || !repair || !repair.what.trim() || !(Number(repair.amount) > 0)) return;
    await save("cost", {
      date: repair.date,
      date_precision: "day",
      category: "equipment",
      item: `${existing.name} — ${repair.what.trim()}`,
      total: Number(repair.amount),
      recurring: 0,
      is_capital: 0,
      allocation: "farm",
      confidence: "high",
      payment_status: "paid",
      equipment_id: existing.id,
      source_note: "repair logged from the equipment register",
    });
    if (condition === "needs_repair" || condition === "broken") {
      setCondition("good");
      await patch("equipment", existing.id, { condition: "good", last_checked: repair.date });
    }
    setRepair(null);
    toast(`${fmtK(Number(repair.amount))} repair recorded`);
  };

  return (
    <Page title={existing ? existing.name : "New item"} back="/equipment/">
      <div className="card stack-sm">
        <Field label="What">
          <TextInput value={name} onChange={setName} placeholder="Wheelbarrow, sprayer, 100 kg scale…" autoFocus={!existing} />
        </Field>
        <Field label="Kind">
          <div className="chips">
            {(Object.keys(EQUIPMENT_CATEGORY_LABEL) as EquipmentCategory[]).map((c) => (
              <button key={c} type="button" className="chip" aria-pressed={category === c} onClick={() => setCategory(c)}>
                {EQUIPMENT_CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid-3">
          <Field label="How many">
            <NumInput value={quantity} onChange={setQuantity} step={1} />
          </Field>
          <Field label="Cost">
            <NumInput value={cost} onChange={setCost} unit="K" step={1} />
          </Field>
          <Field label="Bought" hint={existing?.date_precision === "month" ? "month only" : undefined}>
            <DateInput value={bought} onChange={setBought} />
          </Field>
        </div>
        <Field label="Supplier">
          <TextInput value={supplier} onChange={setSupplier} placeholder="optional" />
        </Field>
        {!existing && (
          <Checkbox checked={recordCost} onChange={setRecordCost}>
            Also record the purchase as an equipment cost
          </Checkbox>
        )}
        {existing && purchase && (
          <p className="small muted">
            Bought on cost line &ldquo;{purchase.item}&rdquo;, {fmtMonth(purchase.date)} — {fmtK(purchase.total)}.
          </p>
        )}
      </div>

      <div className="card stack-sm">
        <Field label="Condition">
          <div className="chips">
            {(Object.keys(EQUIPMENT_CONDITION_LABEL) as EquipmentCondition[]).map((c) => (
              <button key={c} type="button" className="chip" aria-pressed={condition === c} onClick={() => setCondition(c)}>
                {EQUIPMENT_CONDITION_LABEL[c]}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid-2">
          <Field label="Status">
            <Select value={status} onChange={(v) => v && setStatus(v)} options={(Object.keys(EQUIPMENT_STATUS_LABEL) as EquipmentStatus[]).map((s) => ({ value: s, label: EQUIPMENT_STATUS_LABEL[s] }))} />
          </Field>
          <Field label="Kept where">
            <TextInput value={location} onChange={setLocation} placeholder="Store room, Room 4…" />
          </Field>
        </div>
        <Field label="Notes">
          <TextArea value={notes} onChange={setNotes} />
        </Field>
        {existing?.last_checked && <p className="tiny faint">Last checked {fmtDate(existing.last_checked)}.</p>}
      </div>

      {existing && (
        <div className="card">
          <div className="between">
            <h3>Repairs</h3>
            <button type="button" className="btn sm" onClick={() => setRepair({ what: "", amount: "", date: todayIso() })}>
              + Log repair
            </button>
          </div>
          {repairs.length === 0 ? (
            <p className="small muted mt">None recorded.</p>
          ) : (
            <div className="small mt">
              {repairs.map((c) => (
                <Link key={c.id} href={`/costs/new/?id=${c.id}`} className="stat-line">
                  <span className="k">
                    {c.date_precision === "month" ? fmtMonth(c.date) : fmtDate(c.date)} · {c.item}
                  </span>
                  <span className="v">{fmtK(c.total)}</span>
                </Link>
              ))}
              <div className="stat-line">
                <span className="k bold">{plural(repairs.length, "repair")}</span>
                <span className="v">{fmtK(repairs.reduce((s, c) => s + c.total, 0))}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="actions">
        {existing && existing.status !== "disposed" && (
          <button type="button" className="btn lg" onClick={() => setConfirmDispose(true)}>
            Disposed / sold
          </button>
        )}
        <button type="button" className="btn lg primary" disabled={!valid} onClick={submit}>
          {existing ? "Save" : "Add to register"}
        </button>
      </div>

      <Sheet open={!!repair} onClose={() => setRepair(null)} title={`Repair — ${existing?.name ?? ""}`}>
        {repair && (
          <>
            <Field label="What was done">
              <TextInput value={repair.what} onChange={(v) => setRepair({ ...repair, what: v })} placeholder="Welding, new wheel…" autoFocus />
            </Field>
            <div className="grid-2">
              <Field label="Cost">
                <NumInput value={repair.amount} onChange={(v) => setRepair({ ...repair, amount: v })} unit="K" step={1} />
              </Field>
              <Field label="Date">
                <DateInput value={repair.date} onChange={(v) => setRepair({ ...repair, date: v })} />
              </Field>
            </div>
            <p className="small muted">Recorded as an equipment cost line attached to this item.</p>
            <button type="button" className="btn lg primary" disabled={!repair.what.trim() || !(Number(repair.amount) > 0)} onClick={logRepair}>
              Record repair
            </button>
          </>
        )}
      </Sheet>
      <Confirm
        open={confirmDispose}
        onClose={() => setConfirmDispose(false)}
        title="Mark as disposed?"
        body="It stays in the register with its history, but leaves the owned list and the total."
        confirmLabel="Disposed"
        onConfirm={async () => {
          if (existing) await patch("equipment", existing.id, { status: "disposed", last_checked: todayIso() });
          setConfirmDispose(false);
          toast("Marked disposed");
          router.push("/equipment/");
        }}
      />
    </Page>
  );
}
