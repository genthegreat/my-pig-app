"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { FEED_KIND_LABEL, type DataFlag, type FeedKind, type FeedProduct } from "@/db/schema";
import { patch, save, todayIso } from "@/db/write";
import { regenerateCalendar } from "@/db/calendar";
import { useToast } from "@/components/AppShell";
import { Checkbox, DateInput, Field, NumInput, Page, Seg, TextArea, TextInput } from "@/components/ui";
import { fmtK2 } from "@/domain/format";

const KINDS = Object.keys(FEED_KIND_LABEL) as FeedKind[];

export default function ProductPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const id = useSearchParams().get("id");
  const existing = useLiveQuery(async () => (id ? await db.feed_product.get(id) : undefined), [id]);
  const flags = useLiveQuery(async (): Promise<DataFlag[]> => (id ? await db.data_flag.where("record_id").equals(id).toArray() : []), [id]);
  if (id && !existing) return <Page title="…" back="/feed/">{null}</Page>;
  return <Form key={existing?.id ?? "new"} existing={existing} flags={(flags ?? []).filter((f) => !f.resolved_on)} />;
}

function Form({ existing, flags }: { existing?: FeedProduct; flags: { id: string; issue: string }[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(existing?.name ?? "");
  const [kind, setKind] = useState<FeedKind>(existing?.kind ?? "concentrate");
  const [bag, setBag] = useState(existing?.bag_size_kg?.toString() ?? "50");
  const [unit, setUnit] = useState<"bag" | "bucket">((existing?.unit_label as "bag" | "bucket") ?? "bag");
  const [price, setPrice] = useState(existing?.current_price_per_bag?.toString() ?? "");
  const [mj, setMj] = useState(existing?.mj_per_kg?.toString() ?? "");
  const [protein, setProtein] = useState(existing?.protein_pct?.toString() ?? "");
  const [inclusion, setInclusion] = useState(existing?.stated_inclusion ?? "");
  const [onHand, setOnHand] = useState(existing?.bags_on_hand?.toString() ?? "");
  const [countedOn, setCountedOn] = useState(existing?.stock_counted_on ?? todayIso());
  const [active, setActive] = useState(existing ? !!existing.active : true);
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const valid = name.trim() && Number(bag) > 0;

  const submit = async () => {
    if (!valid) return;
    const fields = {
      name: name.trim(),
      kind,
      bag_size_kg: Number(bag),
      unit_label: unit,
      current_price_per_bag: price ? Number(price) : undefined,
      mj_per_kg: mj ? Number(mj) : undefined,
      protein_pct: protein ? Number(protein) : undefined,
      stated_inclusion: inclusion.trim() || undefined,
      bags_on_hand: onHand !== "" ? Number(onHand) : undefined,
      stock_counted_on: onHand !== "" ? countedOn : undefined,
      active: (active ? 1 : 0) as 0 | 1,
      notes: notes.trim() || undefined,
    };
    if (existing) await patch("feed_product", existing.id, fields);
    else await save("feed_product", fields);
    await regenerateCalendar();
    toast("Saved");
    router.push("/feed/");
  };

  return (
    <Page title={existing ? existing.name : "New feed product"} back="/feed/">
      {flags.map((f) => (
        <Link key={f.id} href="/flags/" className="card warn small">
          ⚠ {f.issue}
        </Link>
      ))}
      <div className="card stack-sm">
        <Field label="Name">
          <TextInput value={name} onChange={setName} placeholder="Grower concentrate" />
        </Field>
        <Field label="Kind" hint="Complete feeds are balanced already and must not be diluted. Concentrates are designed to be.">
          <div className="chips">
            {KINDS.map((k) => (
              <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
                {FEED_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid-2">
          <Field label="Size" hint="Meal 3 and creep 25 kg; concentrates and pellets 50 kg">
            <NumInput value={bag} onChange={setBag} unit="kg" big />
          </Field>
          <Field label="Sold as">
            <Seg
              value={unit}
              onChange={setUnit}
              options={[
                { value: "bag", label: "Bag" },
                { value: "bucket", label: "Bucket" },
              ]}
            />
          </Field>
        </div>
        <Field label={`Price per ${unit}`} hint={price && Number(bag) ? `${fmtK2(Number(price) / Number(bag))}/kg` : undefined}>
          <NumInput value={price} onChange={setPrice} unit="K" step={1} />
        </Field>
      </div>
      <div className="card stack-sm">
        <h3>Nutrition</h3>
        <div className="grid-2">
          <Field label="Energy">
            <NumInput value={mj} onChange={setMj} unit="MJ/kg" step={0.1} />
          </Field>
          <Field label="Protein">
            <NumInput value={protein} onChange={setProtein} unit="%" step={0.5} />
          </Field>
        </div>
        <Field label="Stated inclusion on the bag" hint="Read it off the bag — it decides the right maize ratio.">
          <TextInput value={inclusion} onChange={setInclusion} placeholder="e.g. 1:3 with maize meal" />
        </Field>
      </div>
      <div className="card stack-sm">
        <h3>Stock on hand</h3>
        <div className="grid-2">
          <Field label={unit === "bucket" ? "Buckets" : "Bags"}>
            <NumInput value={onHand} onChange={setOnHand} step={1} big />
          </Field>
          <Field label="Counted on">
            <DateInput value={countedOn} onChange={setCountedOn} />
          </Field>
        </div>
        <p className="small muted">Used with the herd&apos;s daily requirement to put &ldquo;feed runs out&rdquo; on the calendar.</p>
      </div>
      <div className="card stack-sm">
        <Checkbox checked={active} onChange={setActive}>
          In use
        </Checkbox>
        <Field label="Notes">
          <TextArea value={notes} onChange={setNotes} />
        </Field>
      </div>
      <button type="button" className="btn xl primary block" disabled={!valid} onClick={submit}>
        Save
      </button>
    </Page>
  );
}
