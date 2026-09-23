"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import {
  EQUIPMENT_CATEGORY_LABEL,
  EQUIPMENT_CONDITION_LABEL,
  EQUIPMENT_STATUS_LABEL,
  type Equipment,
  type EquipmentStatus,
} from "@/db/schema";
import { Chips, Empty, Page } from "@/components/ui";
import { fmtDate, fmtK, fmtMonth, plural } from "@/domain/format";

const CONDITION_BADGE: Record<Equipment["condition"], string> = {
  good: "accent",
  worn: "",
  needs_repair: "warn",
  broken: "danger",
  lost: "danger",
};

export default function EquipmentPage() {
  const items = useLiveQuery(() => db.equipment.toArray(), []);
  const costs = useLiveQuery(() => db.cost.filter((c) => !!c.equipment_id).toArray(), []);
  const [status, setStatus] = useState<EquipmentStatus | "">("");

  const repairsBy = useMemo(() => {
    const m = new Map<string, number>();
    const purchaseIds = new Set((items ?? []).map((i) => i.cost_id).filter(Boolean));
    for (const c of costs ?? []) {
      if (!c.equipment_id || purchaseIds.has(c.id)) continue;
      m.set(c.equipment_id, (m.get(c.equipment_id) ?? 0) + c.total);
    }
    return m;
  }, [costs, items]);

  const list = (items ?? [])
    .filter((i) => (status ? i.status === status : i.status !== "disposed"))
    .sort((a, b) => (a.category + a.name).localeCompare(b.category + b.name));
  const owned = (items ?? []).filter((i) => i.status !== "disposed");
  const value = owned.reduce((s, i) => s + (i.cost ?? 0), 0);
  const repairs = [...repairsBy.values()].reduce((s, v) => s + v, 0);
  const attention = owned.filter((i) => i.condition === "needs_repair" || i.condition === "broken" || i.condition === "lost");

  return (
    <Page
      title="Equipment"
      back="/more/"
      right={
        <Link href="/equipment/item/" className="btn sm primary">
          + Item
        </Link>
      }
    >
      <div className="kpis">
        <div className="kpi hero">
          <span className="k">Owned</span>
          <span className="v">{plural(owned.reduce((s, i) => s + i.quantity, 0), "item")}</span>
          <span className="n">bought for {fmtK(value)}</span>
        </div>
        <div className="kpi">
          <span className="k">Repairs to date</span>
          <span className="v">{fmtK(repairs)}</span>
          <span className="n">attached to items</span>
        </div>
        {attention.length > 0 && (
          <div className="kpi">
            <span className="k">Needs attention</span>
            <span className="v danger">{attention.length}</span>
            <span className="n">{attention.map((i) => i.name).join(", ")}</span>
          </div>
        )}
      </div>

      <Chips
        value={status}
        onChange={setStatus}
        allLabel="Owned"
        options={(Object.keys(EQUIPMENT_STATUS_LABEL) as EquipmentStatus[]).map((s) => ({ value: s, label: EQUIPMENT_STATUS_LABEL[s] }))}
      />

      <div className="card tight">
        {!items ? null : list.length === 0 ? (
          <Empty ico="🧰">Nothing here.</Empty>
        ) : (
          <div className="list">
            {list.map((i) => (
              <Link key={i.id} href={`/equipment/item/?id=${i.id}`} className="row">
                <div className="body">
                  <div className="title">
                    {i.quantity > 1 ? `${i.quantity} × ` : ""}
                    {i.name}
                  </div>
                  <div className="sub">
                    {EQUIPMENT_CATEGORY_LABEL[i.category]}
                    {i.bought_on ? ` · bought ${i.date_precision === "month" ? fmtMonth(i.bought_on) : fmtDate(i.bought_on)}` : ""}
                    {i.location ? ` · ${i.location}` : ""}
                    {repairsBy.get(i.id) ? ` · repairs ${fmtK(repairsBy.get(i.id))}` : ""}
                  </div>
                </div>
                <div className="trail">
                  <div className="v">{fmtK(i.cost)}</div>
                  <span className={`badge ${CONDITION_BADGE[i.condition]}`}>{EQUIPMENT_CONDITION_LABEL[i.condition]}</span>
                </div>
                <span className="chev">›</span>
              </Link>
            ))}
          </div>
        )}
      </div>
      <p className="tiny faint">
        Every item traces to the cost line it was bought on. Repairs are cost lines attached to the item, so a wheelbarrow&apos;s welding bills sit with the wheelbarrow, not lost in &ldquo;equipment&rdquo;.
      </p>
    </Page>
  );
}
