"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { useAnimals, useRoomMap, useRooms, useToday } from "@/db/hooks";
import { lineAmount } from "@/domain/sales";
import { fmtK } from "@/domain/format";
import { STAGE_LABEL, STAGES, type AnimalStatus, type Stage } from "@/db/schema";
import { AnimalRow } from "@/components/AnimalRow";
import { ChannelBadge, Chips, Empty, Page, Seg, Select } from "@/components/ui";
import { plural } from "@/domain/format";

const STAGE_OPTS = STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] }));

export default function AnimalsPage() {
  return (
    <Suspense>
      <AnimalsInner />
    </Suspense>
  );
}

function AnimalsInner() {
  const params = useSearchParams();
  const today = useToday();
  const animals = useAnimals();
  const rooms = useRooms();
  const roomMap = useRoomMap();
  const [stage, setStage] = useState<Stage | "">((params.get("stage") as Stage) ?? "");
  const [room, setRoom] = useState<string>(params.get("room") ?? "");
  const [status, setStatus] = useState<AnimalStatus | "all">("active");
  const [q, setQ] = useState("");
  const sales = useLiveQuery(() => db.sale.toArray(), []);
  const saleLines = useLiveQuery(() => db.sale_line.toArray(), []);

  // What each sold pig fetched, so the list can say so without opening it.
  const soldFor = useMemo(() => {
    const m = new Map<string, { amount: number; basis: string; channel: string; date: string; saleId: string }>();
    if (!sales || !saleLines) return m;
    const byId = new Map(sales.map((x) => [x.id, x]));
    const linesBySale = new Map<string, typeof saleLines>();
    for (const l of saleLines) linesBySale.set(l.sale_id, [...(linesBySale.get(l.sale_id) ?? []), l]);
    for (const l of saleLines) {
      const sale = byId.get(l.sale_id);
      if (!sale || !l.animal_id) continue;
      const a = lineAmount(sale, l, linesBySale.get(l.sale_id) ?? []);
      m.set(l.animal_id, { amount: a.amount, basis: a.basis, channel: sale.channel, date: sale.date, saleId: sale.id });
    }
    return m;
  }, [sales, saleLines]);

  const list = useMemo(() => {
    if (!animals) return [];
    const needle = q.trim().toLowerCase();
    return animals
      .filter((a) => (status === "all" ? true : a.status === status))
      .filter((a) => (stage ? a.stage === stage : true))
      .filter((a) => (room ? a.current_room === room : true))
      .filter((a) =>
        needle
          ? [a.tag_label, a.name, a.tag_colour, a.id, a.litter_id].some((s) => s?.toLowerCase().includes(needle))
          : true,
      )
      .sort((a, b) => {
        // On-farm pigs by stage then tag; pigs that have left, newest exit first.
        const aGone = a.status !== "active";
        const bGone = b.status !== "active";
        if (aGone !== bGone) return aGone ? 1 : -1;
        if (aGone && bGone) {
          const d = (b.exit_date ?? "").localeCompare(a.exit_date ?? "");
          if (d !== 0) return d;
        } else {
          const si = STAGES.indexOf(b.stage) - STAGES.indexOf(a.stage);
          if (si !== 0) return si;
        }
        return (a.tag_label ?? a.id).localeCompare(b.tag_label ?? b.id, undefined, { numeric: true });
      });
  }, [animals, status, stage, room, q]);

  return (
    <Page
      title="Pigs"
      right={
        <Link href="/rooms/" className="btn sm soft">
          Rooms
        </Link>
      }
    >
      <div className="stack-sm">
        <input
          className="input"
          type="search"
          placeholder="Search tag, name, litter…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Chips value={stage} onChange={setStage} options={STAGE_OPTS} allLabel="All stages" />
        <div className="grid-2">
          <Select
            value={room}
            onChange={setRoom}
            placeholder="Any room"
            options={(rooms ?? []).filter((r) => r.active).map((r) => ({ value: r.id, label: r.label }))}
          />
          <Seg
            value={status}
            onChange={setStatus}
            options={[
              { value: "active", label: "On farm" },
              { value: "sold", label: "Sold" },
              { value: "all", label: "All" },
            ]}
          />
        </div>
      </div>

      <div className="between">
        <span className="muted small">
          {plural(list.length, "pig")}
          {status === "sold" && list.length ? ` · ${fmtK(list.reduce((t, a) => t + (soldFor.get(a.id)?.amount ?? 0), 0))} fetched` : ""}
        </span>
        <Link href="/animals/new/" className="btn sm primary">
          + New pig
        </Link>
      </div>

      <div className="card tight">
        {!animals ? null : list.length === 0 ? (
          <Empty>No pigs match.</Empty>
        ) : (
          <div className="list">
            {list.map((a) => {
              const sold = a.status === "sold" ? soldFor.get(a.id) : undefined;
              return (
                <AnimalRow
                  key={a.id}
                  animal={a}
                  rooms={roomMap}
                  today={today}
                  href={`/animals/detail/?id=${a.id}`}
                  trail={
                    sold ? (
                      <>
                        <div className="v">
                          {sold.basis === "exact" ? "" : "≈"}
                          {fmtK(sold.amount)}
                        </div>
                        <ChannelBadge channel={sold.channel as "live" | "dead"} />
                      </>
                    ) : undefined
                  }
                />
              );
            })}
          </div>
        )}
      </div>
    </Page>
  );
}
