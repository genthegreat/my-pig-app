"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { patch, save, todayIso } from "@/db/write";
import { regenerateCalendar } from "@/db/calendar";
import { useToast } from "@/components/AppShell";
import { Checkbox, DateInput, Field, NumInput, Page, Select, TextInput } from "@/components/ui";
import { fmtK, fmtK2, fmtKg } from "@/domain/format";

export default function FeedPurchasePage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const products = useLiveQuery(() => db.feed_product.filter((p) => !!p.active).toArray(), []);
  const scheduleId = params.get("schedule") ?? undefined;
  const occurrence = params.get("occ") ?? undefined;
  const schedule = useLiveQuery(async () => (scheduleId ? await db.schedule.get(scheduleId) : undefined), [scheduleId]);
  const [productId, setProductId] = useState(params.get("product") ?? "");
  const [bags, setBags] = useState(params.get("bags") ?? "");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(todayIso());
  const [supplier, setSupplier] = useState("");
  const [addToStock, setAddToStock] = useState(true);

  const product = useMemo(() => products?.find((p) => p.id === productId), [products, productId]);
  useEffect(() => {
    if (product?.current_price_per_bag) setPrice(String(product.current_price_per_bag));
  }, [product]);

  const n = Number(bags) || 0;
  const p = Number(price) || 0;
  const total = n * p;
  const kg = product ? n * product.bag_size_kg : 0;
  const valid = product && n > 0 && p > 0;

  const submit = async () => {
    if (!product || !valid) return;
    const cost = await save("cost", {
      date,
      date_precision: "day",
      category: "feed",
      item: `${product.name} × ${n}`,
      quantity: n,
      unit: product.unit_label ?? "bag",
      unit_cost: p,
      total,
      supplier: supplier.trim() || undefined,
      recurring: 0,
      is_capital: 0,
      allocation: "farm",
      confidence: "high",
      source_note: "feed purchase",
    });
    await save("feed_purchase", {
      date,
      product_id: product.id,
      bags: n,
      bag_size_kg: product.bag_size_kg, // copied at purchase — history must not change if the bag does
      price_per_bag: p,
      total,
      supplier: supplier.trim() || undefined,
      cost_id: cost.id,
    });
    await patch("feed_product", product.id, {
      current_price_per_bag: p,
      bags_on_hand: addToStock ? (product.bags_on_hand ?? 0) + n : product.bags_on_hand,
      stock_counted_on: addToStock ? date : product.stock_counted_on,
    });
    if (schedule && occurrence && (!schedule.last_done || occurrence > schedule.last_done)) {
      await patch("schedule", schedule.id, { last_done: occurrence });
    }
    await regenerateCalendar();
    toast(`${fmtKg(kg, 0)} of ${product.name} for ${fmtK(total)}`);
    router.push(schedule ? "/schedule/" : "/feed/");
  };

  return (
    <Page title="Feed purchase" back={schedule ? "/schedule/" : "/feed/"}>
      {schedule && occurrence && (
        <div className="card accent small">
          Scheduled buy: <b>{schedule.title}</b>, {occurrence}. Saving settles it and the calendar moves to the next one.
        </div>
      )}
      <div className="card stack-sm">
        <Field label="Product">
          <Select
            value={productId}
            onChange={setProductId}
            placeholder="Which feed?"
            options={(products ?? []).map((x) => ({ value: x.id, label: `${x.name} · ${x.bag_size_kg} kg ${x.unit_label ?? "bag"}` }))}
          />
        </Field>
        <div className="grid-2">
          <Field label={product?.unit_label === "bucket" ? "Buckets" : "Bags"} hint={product ? `${product.bag_size_kg} kg each` : undefined}>
            <NumInput value={bags} onChange={setBags} big step={1} />
          </Field>
          <Field label={`Price per ${product?.unit_label ?? "bag"}`} hint={product?.current_price_per_bag ? `last ${fmtK(product.current_price_per_bag)}` : undefined}>
            <NumInput value={price} onChange={setPrice} unit="K" step={1} />
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Date">
            <DateInput value={date} onChange={setDate} />
          </Field>
          <Field label="Supplier">
            <TextInput value={supplier} onChange={setSupplier} placeholder="optional" />
          </Field>
        </div>
        <Checkbox checked={addToStock} onChange={setAddToStock}>
          Add to bags on hand
        </Checkbox>
      </div>
      <div className="kpis">
        <div className="kpi hero">
          <span className="k">Total</span>
          <span className="v">{fmtK(total)}</span>
          <span className="n">recorded as a feed cost</span>
        </div>
        <div className="kpi">
          <span className="k">Kilograms</span>
          <span className="v">{fmtKg(kg, 0)}</span>
          <span className="n">{kg ? `${fmtK2(total / kg)}/kg` : "—"}</span>
        </div>
      </div>
      <button type="button" className="btn xl primary block" disabled={!valid} onClick={submit}>
        Record purchase
      </button>
    </Page>
  );
}
