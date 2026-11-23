"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { CAPITAL_CATEGORIES, COST_CATEGORIES, COST_CATEGORY_LABEL, type Cost, type CostCategory } from "@/db/schema";
import { patch, remove, save, todayIso } from "@/db/write";
import { useToast } from "@/components/AppShell";
import { Checkbox, Confirm, DateInput, Field, NumInput, Page, Select, TextArea, TextInput } from "@/components/ui";
import { fmtK } from "@/domain/format";

export default function CostNewPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const params = useSearchParams();
  const id = params.get("id");
  const existing = useLiveQuery(async () => (id ? await db.cost.get(id) : undefined), [id]);
  if (id && !existing) return <Page title="…" back="/costs/">{null}</Page>;
  return <Form key={existing?.id ?? "new"} existing={existing} />;
}

function Form({ existing }: { existing?: Cost }) {
  const router = useRouter();
  const { toast } = useToast();
  const [date, setDate] = useState(existing?.date ?? todayIso());
  const [category, setCategory] = useState<CostCategory>(existing?.category ?? "feed");
  const [item, setItem] = useState(existing?.item ?? "");
  const [qty, setQty] = useState(existing?.quantity?.toString() ?? "");
  const [unit, setUnit] = useState(existing?.unit ?? "");
  const [unitCost, setUnitCost] = useState(existing?.unit_cost?.toString() ?? "");
  const [total, setTotal] = useState(existing?.total?.toString() ?? "");
  const [supplier, setSupplier] = useState(existing?.supplier ?? "");
  const [capital, setCapital] = useState(existing ? !!existing.is_capital : false);
  const [recurring, setRecurring] = useState(existing ? !!existing.recurring : false);
  const [paid, setPaid] = useState(existing ? existing.payment_status !== "pending" : true);
  const [notes, setNotes] = useState(existing?.source_note ?? "");
  const [equipmentId, setEquipmentId] = useState(existing?.equipment_id ?? "");
  const equipment = useLiveQuery(() => db.equipment.toArray(), []);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [touchedCapital, setTouchedCapital] = useState(!!existing);

  useEffect(() => {
    if (!touchedCapital) setCapital(CAPITAL_CATEGORIES.includes(category));
  }, [category, touchedCapital]);

  useEffect(() => {
    if (qty && unitCost) setTotal((Number(qty) * Number(unitCost)).toFixed(2).replace(/\.00$/, ""));
  }, [qty, unitCost]);

  const valid = item.trim() && total && Number(total) > 0;
  const isSeed = existing?.device_id === "seed";

  const submit = async () => {
    if (!valid) return;
    const fields = {
      date,
      date_precision: "day" as const,
      category,
      item: item.trim(),
      quantity: qty ? Number(qty) : undefined,
      unit: unit.trim() || undefined,
      unit_cost: unitCost ? Number(unitCost) : undefined,
      total: Number(total),
      supplier: supplier.trim() || undefined,
      recurring: (recurring ? 1 : 0) as 0 | 1,
      is_capital: (capital ? 1 : 0) as 0 | 1,
      allocation: existing?.allocation ?? "farm",
      confidence: existing?.confidence ?? ("high" as const),
      payment_status: (paid ? "paid" : "pending") as "paid" | "pending",
      equipment_id: category === "equipment" && equipmentId ? equipmentId : undefined,
      source_note: notes.trim() || undefined,
    };
    if (existing) {
      await patch("cost", existing.id, { ...fields, date_precision: existing.date_precision === "month" && date === existing.date ? "month" : "day" });
      toast("Saved");
    } else {
      await save("cost", fields);
      toast(`${fmtK(Number(total))} recorded`);
    }
    router.push(`/costs/?m=${date.slice(0, 7)}`);
  };

  return (
    <Page title={existing ? "Edit cost" : "Add a cost"} back="/costs/">
      {category === "feed" && !existing && (
        <Link href="/feed/purchase/" className="card accent small">
          Buying feed? <b>Record it as a feed purchase</b> so the bags and kilograms are kept with the price. ›
        </Link>
      )}
      <div className="card stack-sm">
        <Field label="What">
          <TextInput value={item} onChange={setItem} placeholder="Meal 3 x16, worker salary, saw dust…" autoFocus={!existing} />
        </Field>
        <Field label="Category">
          <div className="chips">
            {COST_CATEGORIES.map((c) => (
              <button key={c} type="button" className="chip" aria-pressed={category === c} onClick={() => setCategory(c)}>
                {COST_CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid-3">
          <Field label="Quantity">
            <NumInput value={qty} onChange={setQty} />
          </Field>
          <Field label="Unit">
            <TextInput value={unit} onChange={setUnit} placeholder="bags" />
          </Field>
          <Field label="Each">
            <NumInput value={unitCost} onChange={setUnitCost} unit="K" />
          </Field>
        </div>
        {category === "equipment" && (
          <Field label="For which item" hint="A repair or part attaches to the item; a new item is better added under Equipment">
            <Select value={equipmentId} onChange={setEquipmentId} placeholder="Not an existing item" options={(equipment ?? []).filter((e) => e.status !== "disposed").map((e) => ({ value: e.id, label: e.name }))} />
          </Field>
        )}
        <Field label="Total">
          <NumInput value={total} onChange={setTotal} unit="K" big step={1} />
        </Field>
        <div className="grid-2">
          <Field label="Date" hint={existing?.date_precision === "month" ? "Historic line: month only" : undefined}>
            <DateInput value={date} onChange={setDate} />
          </Field>
          <Field label="Supplier">
            <TextInput value={supplier} onChange={setSupplier} placeholder="optional" />
          </Field>
        </div>
      </div>
      <div className="card stack-sm">
        <Checkbox
          checked={capital}
          onChange={(v) => {
            setTouchedCapital(true);
            setCapital(v);
          }}
        >
          Capital (construction, breeding stock) — kept out of cost-per-pig
        </Checkbox>
        <Checkbox checked={recurring} onChange={setRecurring}>
          Recurring every month
        </Checkbox>
        <Checkbox checked={paid} onChange={setPaid}>
          Paid
        </Checkbox>
        <Field label="Note / source">
          <TextArea value={notes} onChange={setNotes} placeholder="Where this number came from" />
        </Field>
        {isSeed && <p className="small muted">Imported with the farm's history. Editing keeps the original source note.</p>}
      </div>
      <div className="actions">
        {existing && (
          <button type="button" className="btn lg danger" onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        )}
        <button type="button" className="btn lg primary" disabled={!valid} onClick={submit}>
          {existing ? "Save" : "Record"}
        </button>
      </div>
      <Confirm
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this cost line?"
        body="If it is wrong rather than duplicated, prefer editing it or raising a flag — the history is what the app exists to keep."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          if (existing) await remove("cost", existing.id);
          toast("Deleted");
          router.push("/costs/");
        }}
      />
    </Page>
  );
}
