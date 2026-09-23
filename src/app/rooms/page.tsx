"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { useActiveAnimals, useRooms } from "@/db/hooks";
import { STAGE_LABEL, STAGE_PLURAL, type Stage } from "@/db/schema";
import { save } from "@/db/write";
import { Field, Page, Sheet, TextInput } from "@/components/ui";
import { weighSessions } from "@/domain/growth";
import { fmtDayMonth, fmtKg, plural } from "@/domain/format";

export default function RoomsPage() {
  const rooms = useRooms();
  const animals = useActiveAnimals();
  const weights = useLiveQuery(() => db.weight.toArray(), []);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");

  const byRoom = useMemo(() => {
    const m = new Map<string, { count: number; stages: Map<Stage, number> }>();
    for (const a of animals ?? []) {
      const key = a.current_room ?? "";
      const e = m.get(key) ?? { count: 0, stages: new Map() };
      e.count++;
      e.stages.set(a.stage, (e.stages.get(a.stage) ?? 0) + 1);
      m.set(key, e);
    }
    return m;
  }, [animals]);

  const latestByRoom = useMemo(() => {
    const m = new Map<string, ReturnType<typeof weighSessions>[number]>();
    for (const s of weighSessions(weights ?? [])) {
      if (s.roomId && !m.has(s.roomId)) m.set(s.roomId, s);
    }
    return m;
  }, [weights]);

  const unassigned = byRoom.get("");

  const addRoom = async () => {
    if (!label.trim()) return;
    const sort = Math.max(0, ...(rooms ?? []).map((r) => r.sort)) + 1;
    await save("room", { label: label.trim(), active: 1, sort });
    setLabel("");
    setAdding(false);
  };

  return (
    <Page
      title="Rooms"
      back="/animals/"
      right={
        <button type="button" className="btn sm soft" onClick={() => setAdding(true)}>
          + Room
        </button>
      }
    >
      <p className="small muted">Ten pens in 6 m × 12 m. Rooms get reused, so a room is never a pig&apos;s identity.</p>
      <div className="card tight">
        <div className="list">
          {(rooms ?? [])
            .filter((r) => r.active)
            .map((r) => {
              const occ = byRoom.get(r.id);
              const w = latestByRoom.get(r.id);
              const stages = occ
                ? [...occ.stages.entries()].map(([s, n]) => `${n} ${n === 1 ? STAGE_LABEL[s].toLowerCase() : STAGE_PLURAL[s]}`).join(", ")
                : "empty";
              return (
                <Link key={r.id} href={`/rooms/detail/?id=${r.id}`} className="row">
                  <div className="body">
                    <div className="title">{r.label}</div>
                    <div className="sub">{stages}</div>
                  </div>
                  <div className="trail">
                    <div className="v">{occ ? plural(occ.count, "pig") : "—"}</div>
                    {w && (
                      <div className="tiny muted">
                        avg {fmtKg(w.avgKg)} · {fmtDayMonth(w.date)}
                      </div>
                    )}
                  </div>
                  <span className="chev">›</span>
                </Link>
              );
            })}
        </div>
      </div>

      {unassigned && (
        <Link href="/rooms/detail/?id=none" className="card warn between">
          <div>
            <div className="bold">{plural(unassigned.count, "pig")} with no room recorded</div>
            <div className="small muted">Tap to put them where they stand.</div>
          </div>
          <span style={{ fontSize: 24 }}>›</span>
        </Link>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="New room">
        <Field label="Label">
          <TextInput value={label} onChange={setLabel} placeholder="Room 10" autoFocus />
        </Field>
        <button type="button" className="btn lg primary" onClick={addRoom} disabled={!label.trim()}>
          Add
        </button>
      </Sheet>
    </Page>
  );
}
