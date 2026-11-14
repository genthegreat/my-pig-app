"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { useActiveAnimals, useRoomMap, useRooms, useToday } from "@/db/hooks";
import type { RoomOccupancy, Weight } from "@/db/schema";
import { patch } from "@/db/write";
import { regenerateCalendar } from "@/db/calendar";
import { useToast } from "@/components/AppShell";
import { AnimalRow } from "@/components/AnimalRow";
import { MoveSheet, StageSheet } from "@/components/sheets";
import { Computed, Confirm, Field, Page, TextInput } from "@/components/ui";
import { measuredAdg, weighSessions, type WeighSession } from "@/domain/growth";
import { fmtDate, fmtKg, plural } from "@/domain/format";

export default function RoomDetailPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const id = useSearchParams().get("id") ?? "none";
  const isNone = id === "none";
  const rooms = useRooms();
  const roomMap = useRoomMap();
  const room = roomMap.get(id);
  const today = useToday();
  const animals = useActiveAnimals();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<"move" | "stage" | "rename" | "retire" | null>(null);
  const [label, setLabel] = useState("");
  const [leaveOut, setLeaveOut] = useState<WeighSession | null>(null);
  const [reason, setReason] = useState("");

  const occupants = useMemo(
    () => (animals ?? []).filter((a) => (isNone ? !a.current_room : a.current_room === id)),
    [animals, id, isNone],
  );
  const weights = useLiveQuery(async (): Promise<Weight[]> => (isNone ? [] : await db.weight.where("room_id").equals(id).toArray()), [id, isNone]);
  const occupancy = useLiveQuery(async (): Promise<RoomOccupancy[]> => (isNone ? [] : await db.room_occupancy.where("room_id").equals(id).toArray()), [id, isNone]);

  // Only weigh-ins since the current occupants moved in describe these pigs.
  const since = useMemo(() => {
    const ids = new Set(occupants.map((a) => a.id));
    const dates = (occupancy ?? []).filter((o) => !o.moved_out && ids.has(o.animal_id)).map((o) => o.moved_in).sort();
    return dates[0];
  }, [occupants, occupancy]);
  const allSessions = useMemo(() => weighSessions(weights ?? []), [weights]);
  const current = useMemo(() => allSessions.filter((s) => !since || s.date >= since), [allSessions, since]);
  const earlier = useMemo(() => allSessions.filter((s) => since && s.date < since), [allSessions, since]);
  const notCounted = useMemo(() => weighSessions(weights ?? [], { invalid: true }), [weights]);
  const adg = measuredAdg(current);

  // A weigh-in that cannot be trusted is kept on record but left out of every gain and projection.
  const setInvalid = async (s: WeighSession, why: string | undefined) => {
    for (const w of s.weights) await patch("weight", w.id, { invalid_reason: why });
    await regenerateCalendar();
  };

  const toggle = (aid: string) => {
    const n = new Set(selected);
    if (n.has(aid)) n.delete(aid);
    else n.add(aid);
    setSelected(n);
  };
  const selectedAnimals = occupants.filter((a) => selected.has(a.id));
  const title = isNone ? "No room recorded" : (room?.label ?? "Room");

  return (
    <Page
      title={title}
      back="/rooms/"
      right={
        !isNone && room ? (
          <button
            type="button"
            className="btn sm soft"
            onClick={() => {
              setLabel(room.label);
              setSheet("rename");
            }}
          >
            Rename
          </button>
        ) : undefined
      }
    >
      {!isNone && (
        <div className="grid-2">
          <Link href={`/weigh/?room=${id}`} className="btn lg primary">
            ⚖️ Weigh this pen
          </Link>
          <Link href={`/animals/new/?room=${id}`} className="btn lg">
            + Pig here
          </Link>
        </div>
      )}

      {!isNone && (
        <section className="card">
          <h2>Weigh-ins</h2>
          {!current.length ? (
            <p className="muted small">Not weighed since the current pigs moved in.</p>
          ) : (
            <>
              <div className="kpis">
                <div className="kpi hero">
                  <span className="k">Latest average</span>
                  <span className="v">{fmtKg(current[0].avgKg)}</span>
                  <span className="n">
                    {fmtDate(current[0].date)} · {plural(current[0].count, "pig")} · {fmtKg(current[0].minKg, 0)}–{fmtKg(current[0].maxKg, 0)}
                  </span>
                </div>
                {adg && (
                  <div className="kpi">
                    <span className="k">Daily gain</span>
                    <span className="v">
                      <Computed
                        value={`${adg.kgPerDay.toFixed(3)} kg`}
                        formula="(latest avg − previous avg) ÷ days"
                        inputs={[
                          { label: "Previous", value: `${fmtKg(adg.fromKg)} on ${fmtDate(adg.fromDate)}` },
                          { label: "Latest", value: `${fmtKg(adg.toKg)} on ${fmtDate(adg.toDate)}` },
                          { label: "Days", value: String(adg.days) },
                        ]}
                        note="Pen averages. If pigs were sold or moved between the two weighings, the figure is off."
                      />
                    </span>
                    <span className="n">pen average</span>
                  </div>
                )}
              </div>
              <div className="mt small">
                {current.map((s) => (
                  <div key={s.date} className="stat-line">
                    <span className="k">{fmtDate(s.date)}</span>
                    <span className="v">
                      avg {fmtKg(s.avgKg)} of {s.count} · {s.weights.map((w) => w.weight_kg).join(", ")}
                    </span>
                    <button
                      type="button"
                      className="btn sm soft"
                      style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                      onClick={() => {
                        setReason("");
                        setLeaveOut(s);
                      }}
                    >
                      Not valid
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
          {notCounted.length > 0 && (
            <details className="plain mt">
              <summary>{plural(notCounted.length, "weigh-in")} not counted</summary>
              <div className="small">
                {notCounted.map((s) => (
                  <div key={s.date} className="stat-line">
                    <span className="k">{fmtDate(s.date)}</span>
                    <span className="v">
                      avg {fmtKg(s.avgKg)} of {s.count} · {s.weights[0].invalid_reason}
                    </span>
                    <button
                      type="button"
                      className="btn sm soft"
                      style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                      onClick={async () => {
                        await setInvalid(s, undefined);
                        toast("Weigh-in counted again");
                      }}
                    >
                      Count it
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}
          {earlier.length > 0 && (
            <details className="plain mt">
              <summary>{plural(earlier.length, "earlier weigh-in")} of previous occupants</summary>
              <div className="small">
                {earlier.map((s) => (
                  <div key={s.date} className="stat-line">
                    <span className="k">{fmtDate(s.date)}</span>
                    <span className="v">
                      avg {fmtKg(s.avgKg)} of {s.count}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      <section>
        <div className="section-title">
          <h2>{plural(occupants.length, "pig")}</h2>
          {occupants.length > 0 && (
            <button type="button" className="link" onClick={() => setSelected(selected.size === occupants.length ? new Set() : new Set(occupants.map((a) => a.id)))}>
              {selected.size === occupants.length ? "Clear" : "Select all"}
            </button>
          )}
        </div>
        <div className="card tight mt">
          {occupants.length === 0 ? (
            <div className="empty small">Nobody here.</div>
          ) : (
            <div className="list">
              {occupants.map((a) => (
                <AnimalRow key={a.id} animal={a} rooms={roomMap} today={today} onClick={() => toggle(a.id)} selected={selected.has(a.id)} />
              ))}
            </div>
          )}
        </div>
        {selected.size > 0 && (
          <div className="sticky-actions actions">
            <button type="button" className="btn lg primary" onClick={() => setSheet("move")}>
              Move {selected.size}
            </button>
            <button type="button" className="btn lg" onClick={() => setSheet("stage")}>
              Stage
            </button>
            <Link href={`/animals/detail/?id=${[...selected][0]}`} className="btn lg" style={{ display: selected.size === 1 ? undefined : "none" }}>
              Open
            </Link>
          </div>
        )}
      </section>

      {!isNone && room && occupants.length === 0 && (
        <button type="button" className="btn ghost" onClick={() => setSheet("retire")}>
          Retire this room
        </button>
      )}

      <MoveSheet
        open={sheet === "move"}
        onClose={() => setSheet(null)}
        animals={selectedAnimals}
        rooms={rooms ?? []}
        roomMap={roomMap}
        onDone={() => {
          toast(`Moved ${plural(selectedAnimals.length, "pig")}`);
          setSelected(new Set());
        }}
      />
      <StageSheet
        open={sheet === "stage"}
        onClose={() => setSheet(null)}
        animals={selectedAnimals}
        onDone={() => {
          toast("Stage updated");
          setSelected(new Set());
        }}
      />
      <Confirm
        open={sheet === "rename"}
        onClose={() => setSheet(null)}
        title="Rename room"
        confirmLabel="Save"
        body={
          <Field label="Label">
            <TextInput value={label} onChange={setLabel} autoFocus />
          </Field>
        }
        onConfirm={async () => {
          if (label.trim()) await patch("room", id, { label: label.trim() });
          setSheet(null);
        }}
      />
      <Confirm
        open={!!leaveOut}
        onClose={() => setLeaveOut(null)}
        title="Leave this weigh-in out?"
        confirmLabel="Leave it out"
        body={
          <>
            <p className="small muted">
              {leaveOut && `${fmtDate(leaveOut.date)}, ${plural(leaveOut.count, "weight")}. `}
              It stays on record, but no daily gain or sale projection uses it.
            </p>
            <Field label="Why?">
              <TextInput value={reason} onChange={setReason} placeholder="e.g. scale not zeroed" autoFocus />
            </Field>
          </>
        }
        onConfirm={async () => {
          if (!leaveOut) return;
          await setInvalid(leaveOut, reason.trim() || "No reason given");
          setLeaveOut(null);
          toast("Weigh-in left out");
        }}
      />
      <Confirm
        open={sheet === "retire"}
        onClose={() => setSheet(null)}
        title="Retire this room?"
        body="It stays in the history of every pig that stood here, but disappears from the pickers."
        confirmLabel="Retire"
        danger
        onConfirm={async () => {
          await patch("room", id, { active: 0 });
          setSheet(null);
          toast("Room retired");
        }}
      />
    </Page>
  );
}
