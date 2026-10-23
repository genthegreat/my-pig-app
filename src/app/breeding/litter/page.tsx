"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { animalLabel, roomLabel, useAnimalMap, useAnimals, useRoomMap, useRooms, useToday } from "@/db/hooks";
import { litterDamName, regenerateCalendar } from "@/db/calendar";
import { STAGE_LABEL, type Animal, type Litter, type Sex } from "@/db/schema";
import { patch, save, todayIso } from "@/db/write";
import { useToast } from "@/components/AppShell";
import { AnimalRow } from "@/components/AnimalRow";
import { DateInput, Field, NumInput, Page, Seg, Select, Sheet, TextArea } from "@/components/ui";
import { fmtDate, fmtPct, plural } from "@/domain/format";
import { roomOn, sexCounts } from "@/domain/litter";

export default function LitterPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const id = useSearchParams().get("id") ?? "";
  const litter = useLiveQuery(() => db.litter.get(id), [id]);
  const animals = useAnimals();
  const animalMap = useAnimalMap();
  const rooms = useRoomMap();
  const today = useToday();
  const { toast } = useToast();
  const flags = useLiveQuery(() => db.data_flag.where("record_id").equals(id).toArray(), [id]);
  const [sheet, setSheet] = useState<"dam" | "outcome" | "wean" | "edit" | "sexes" | null>(null);

  if (!litter) return <Page title="…" back="/breeding/">{null}</Page>;
  const l = litter;
  const offspring = (animals ?? []).filter((a) => a.litter_id === l.id);
  const dam = l.dam_id ? animalMap.get(l.dam_id) : undefined;
  const sire = l.sire_id ? animalMap.get(l.sire_id) : undefined;
  const alive = offspring.filter((a) => a.status === "active");
  const sexes = sexCounts(offspring);

  return (
    <Page
      title={`Litter ${l.id}`}
      back="/breeding/"
      right={
        <button type="button" className="btn sm soft" onClick={() => setSheet("edit")}>
          Edit
        </button>
      }
    >
      {!l.dam_id && (
        <button type="button" className="card warn" style={{ textAlign: "left" }} onClick={() => setSheet("dam")}>
          <div className="bold">Which sow is &ldquo;{l.dam_label}&rdquo;?</div>
          <div className="small muted">Rooms get reused. Tap to assign her by tag so this litter follows the pig, not the pen.</div>
        </button>
      )}
      {flags?.filter((f) => !f.resolved_on && f.record_id === id && !/named only|recorded only/.test(f.issue)).map((f) => (
        <Link key={f.id} href="/flags/" className="card warn small">
          ⚠ {f.issue}
        </Link>
      ))}

      <div className="card small">
        <div className="stat-line">
          <span className="k">Dam</span>
          <span className="v">
            {dam ? (
              <Link href={`/animals/detail/?id=${dam.id}`} style={{ color: "var(--accent)" }}>
                {animalLabel(dam)}
              </Link>
            ) : (
              litterDamName(l, animalMap)
            )}
          </span>
        </div>
        <div className="stat-line">
          <span className="k">Sire</span>
          <span className="v">
            {sire ? (
              <Link href={`/animals/detail/?id=${sire.id}`} style={{ color: "var(--accent)" }}>
                {animalLabel(sire)}
              </Link>
            ) : (
              (l.sire_external ?? "unknown")
            )}
          </span>
        </div>
        <div className="stat-line">
          <span className="k">Served</span>
          <span className="v">{fmtDate(l.service_date)}</span>
        </div>
        <div className="stat-line">
          <span className="k">Expected</span>
          <span className="v">{fmtDate(l.expected_farrow)}</span>
        </div>
        <div className="stat-line">
          <span className="k">Outcome</span>
          <span className="v">
            {l.outcome === "farrowed"
              ? `Farrowed ${fmtDate(l.actual_farrow)}`
              : l.outcome === "pending"
                ? "Pending"
                : `${l.outcome === "miscarried" ? "Miscarried" : "Not pregnant"} ${fmtDate(l.outcome_date)}`}
          </span>
        </div>
        {l.outcome === "farrowed" && (
          <>
            <div className="stat-line">
              <span className="k">Born alive · stillborn</span>
              <span className="v">
                {l.born_alive ?? "?"} · {l.stillborn}
              </span>
            </div>
            <div className="stat-line">
              <span className="k">Lost before weaning</span>
              <span className="v">
                {l.died_pre_weaning}
                {l.born_alive ? ` (${fmtPct(((l.born_alive - l.died_pre_weaning) / l.born_alive) * 100)} survived)` : ""}
              </span>
            </div>
            <div className="stat-line">
              <span className="k">Sexes</span>
              <span className="v">
                {offspring.length ? (
                  <button type="button" className="computed" onClick={() => setSheet("sexes")}>
                    <span className="v">
                      {sexes.males} male · {sexes.females} female{sexes.unknown ? ` · ${sexes.unknown} not sexed` : ""}
                    </span>
                  </button>
                ) : (
                  "no piglet records"
                )}
              </span>
            </div>
            <div className="stat-line">
              <span className="k">Room at farrowing</span>
              <span className="v">
                {l.room_at_farrowing ? (
                  roomLabel(rooms, l.room_at_farrowing)
                ) : (
                  <button type="button" className="computed" onClick={() => setSheet("edit")}>
                    <span className="v">not recorded — add</span>
                  </button>
                )}
              </span>
            </div>
            <div className="stat-line">
              <span className="k">Weaned</span>
              <span className="v">{l.weaning_date ? `${l.weaned ?? "?"} on ${fmtDate(l.weaning_date)}` : "not yet"}</span>
            </div>
          </>
        )}
        {l.notes && <p className="mt muted">{l.notes}</p>}
      </div>

      {l.outcome === "pending" && (
        <div className="grid-2">
          <Link href={`/breeding/farrow/?litter=${l.id}`} className="btn lg primary">
            Farrowed
          </Link>
          <button type="button" className="btn lg" onClick={() => setSheet("outcome")}>
            Did not farrow
          </button>
        </div>
      )}
      {l.outcome === "farrowed" && !l.weaning_date && alive.length > 0 && (
        <button type="button" className="btn lg primary" onClick={() => setSheet("wean")}>
          Wean {plural(alive.length, "piglet")}
        </button>
      )}

      {offspring.length > 0 && (
        <section>
          <div className="section-title">
            <h2>{plural(offspring.length, "piglet")}</h2>
            <span className="small muted">{alive.length} on farm</span>
          </div>
          <div className="card tight mt">
            <div className="list">
              {offspring.map((a) => (
                <AnimalRow key={a.id} animal={a} rooms={rooms} today={today} href={`/animals/detail/?id=${a.id}`} />
              ))}
            </div>
          </div>
        </section>
      )}

      <AssignDamSheet open={sheet === "dam"} onClose={() => setSheet(null)} litter={l} onDone={() => toast("Sow assigned")} />
      <OutcomeSheet open={sheet === "outcome"} onClose={() => setSheet(null)} litter={l} onDone={() => toast("Recorded")} />
      <WeanSheet open={sheet === "wean"} onClose={() => setSheet(null)} litter={l} alive={alive.length} onDone={() => toast("Weaned")} />
      <SexSheet open={sheet === "sexes"} onClose={() => setSheet(null)} litter={l} piglets={offspring} onDone={() => toast("Sexes saved")} />
      <EditSheet open={sheet === "edit"} onClose={() => setSheet(null)} litter={l} onDone={() => toast("Saved")} />
    </Page>
  );
}

function AssignDamSheet({ open, onClose, litter, onDone }: { open: boolean; onClose: () => void; litter: Litter; onDone: () => void }) {
  const animals = useAnimals();
  const [dam, setDam] = useState("");
  const sows = (animals ?? []).filter((a) => a.sex === "female" && a.status === "active" && (a.stage === "sow" || a.stage === "gilt"));
  const submit = async () => {
    if (!dam) return;
    await patch("litter", litter.id, { dam_id: dam });
    for (const a of await db.animal.where("litter_id").equals(litter.id).toArray()) await patch("animal", a.id, { dam_id: dam });
    const flags = (await db.data_flag.where("record_id").equals(litter.id).toArray()).filter((f) => !f.resolved_on && /named only|recorded only/.test(f.issue));
    for (const f of flags) {
      await patch("data_flag", f.id, { resolved_on: todayIso(), resolution: `Assigned to ${animalLabel(sows.find((s) => s.id === dam))}` });
    }
    await regenerateCalendar();
    onDone();
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={`Assign the sow for ${litter.id}`}>
      <p className="small muted">Recorded as &ldquo;{litter.dam_label}&rdquo;. Pick her by tag.</p>
      <div className="chips">
        {sows.map((s) => (
          <button key={s.id} type="button" className="chip" aria-pressed={dam === s.id} onClick={() => setDam(s.id)}>
            {animalLabel(s)}
            {s.stage === "gilt" ? " (gilt)" : ""}
          </button>
        ))}
      </div>
      <button type="button" className="btn lg primary" disabled={!dam} onClick={submit}>
        Assign
      </button>
    </Sheet>
  );
}

function OutcomeSheet({ open, onClose, litter, onDone }: { open: boolean; onClose: () => void; litter: Litter; onDone: () => void }) {
  const [outcome, setOutcome] = useState<"miscarried" | "not_pregnant">("miscarried");
  const [date, setDate] = useState(todayIso());
  const submit = async () => {
    await patch("litter", litter.id, { outcome, outcome_date: date });
    await regenerateCalendar();
    onDone();
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Did not farrow">
      <div className="chips">
        <button type="button" className="chip" aria-pressed={outcome === "miscarried"} onClick={() => setOutcome("miscarried")}>
          Miscarried
        </button>
        <button type="button" className="chip" aria-pressed={outcome === "not_pregnant"} onClick={() => setOutcome("not_pregnant")}>
          Not pregnant
        </button>
      </div>
      <Field label="On">
        <DateInput value={date} onChange={setDate} />
      </Field>
      <p className="small muted">The expected farrowing comes off the calendar. She may come back on heat in about 21 days.</p>
      <button type="button" className="btn lg danger" onClick={submit}>
        Record
      </button>
    </Sheet>
  );
}

function WeanSheet({ open, onClose, litter, alive, onDone }: { open: boolean; onClose: () => void; litter: Litter; alive: number; onDone: () => void }) {
  const [date, setDate] = useState(todayIso());
  const submit = async () => {
    await patch("litter", litter.id, { weaning_date: date, weaned: alive });
    const piglets = (await db.animal.where("litter_id").equals(litter.id).toArray()).filter((a) => a.status === "active" && a.stage === "piglet_creep");
    for (const p of piglets) {
      await save("stage_change", { animal_id: p.id, from_stage: "piglet_creep", to_stage: "weaner", date, reason: "weaned" });
      await patch("animal", p.id, { stage: "weaner" });
    }
    await regenerateCalendar();
    onDone();
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={`Wean ${plural(alive, "piglet")}`}>
      <Field label="On">
        <DateInput value={date} onChange={setDate} />
      </Field>
      <p className="small muted">Every piglet becomes a weaner ({STAGE_LABEL.weaner}) as a dated stage change.</p>
      <button type="button" className="btn lg primary" onClick={submit}>
        Wean
      </button>
    </Sheet>
  );
}

function EditSheet({ open, onClose, litter, onDone }: { open: boolean; onClose: () => void; litter: Litter; onDone: () => void }) {
  const animals = useAnimals();
  const rooms = useRooms();
  const roomMap = useRoomMap();
  const farrowed = litter.outcome === "farrowed";
  const [farrowedOn, setFarrowedOn] = useState(litter.actual_farrow ?? "");
  const [room, setRoom] = useState(litter.room_at_farrowing ?? "");
  const damRooms = useLiveQuery(async () => (litter.dam_id ? await db.room_occupancy.where("animal_id").equals(litter.dam_id).toArray() : []), [litter.dam_id]);
  const [born, setBorn] = useState(litter.born_alive?.toString() ?? "");
  const [still, setStill] = useState(String(litter.stillborn));
  const [died, setDied] = useState(String(litter.died_pre_weaning));
  const [sire, setSire] = useState(litter.sire_id ?? "");
  const [notes, setNotes] = useState(litter.notes ?? "");
  const boars = (animals ?? []).filter((a) => a.sex === "male" && !a.castrated);
  // A farrowing room filled in afterwards still has to be the room that held
  // the sow that day — when her room history reaches back that far.
  const heldIn = farrowed && litter.dam_id && farrowedOn ? roomOn(damRooms ?? [], litter.dam_id, farrowedOn) : undefined;
  const roomMismatch = !!(room && heldIn && heldIn !== room);
  const submit = async () => {
    if (farrowed && farrowedOn && farrowedOn !== litter.actual_farrow) {
      // The piglets were born on the farrowing date; move their birth with it.
      for (const a of await db.animal.where("litter_id").equals(litter.id).toArray()) {
        if (a.birth_date !== litter.actual_farrow) continue;
        await patch("animal", a.id, { birth_date: farrowedOn });
        const born = (await db.stage_change.where("animal_id").equals(a.id).toArray()).find((c) => c.reason === "born" && c.date === litter.actual_farrow);
        if (born) await patch("stage_change", born.id, { date: farrowedOn });
      }
    }
    await patch("litter", litter.id, {
      ...(farrowed ? { actual_farrow: farrowedOn || litter.actual_farrow, room_at_farrowing: room || undefined } : {}),
      born_alive: born ? Number(born) : undefined,
      stillborn: Number(still) || 0,
      died_pre_weaning: Number(died) || 0,
      sire_id: sire || undefined,
      notes: notes.trim() || undefined,
    });
    await regenerateCalendar();
    onDone();
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={`Edit ${litter.id}`}>
      {farrowed && (
        <>
          <Field label="Farrowed on">
            <DateInput value={farrowedOn} onChange={setFarrowedOn} />
          </Field>
          <Field label="Room she farrowed in" hint={heldIn ? `Her room history has her in ${roomLabel(roomMap, heldIn)} on that day.` : undefined}>
            <div className="chips">
              {(rooms ?? [])
                .filter((r) => r.active || r.id === room)
                .map((r) => (
                  <button key={r.id} type="button" className="chip" aria-pressed={room === r.id} onClick={() => setRoom(room === r.id ? "" : r.id)}>
                    {r.label}
                  </button>
                ))}
            </div>
          </Field>
          {roomMismatch && (
            <div className="card danger small">
              <b>
                On {fmtDate(farrowedOn)} she was in {roomLabel(roomMap, heldIn)}, not {roomLabel(roomMap, room)}.
              </b>{" "}
              A farrowing is only accepted against the room that holds the sow.
            </div>
          )}
        </>
      )}
      <div className="grid-3">
        <Field label="Born alive">
          <NumInput value={born} onChange={setBorn} step={1} />
        </Field>
        <Field label="Stillborn">
          <NumInput value={still} onChange={setStill} step={1} />
        </Field>
        <Field label="Lost">
          <NumInput value={died} onChange={setDied} step={1} />
        </Field>
      </div>
      <Field label="Sire">
        <Select value={sire} onChange={setSire} placeholder="Unknown / off-farm" options={boars.map((b) => ({ value: b.id, label: animalLabel(b) }))} />
      </Field>
      <Field label="Notes">
        <TextArea value={notes} onChange={setNotes} />
      </Field>
      <button type="button" className="btn lg primary" disabled={roomMismatch} onClick={submit}>
        Save
      </button>
    </Sheet>
  );
}

const SEX_OPTIONS: { value: Sex | "?"; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "?", label: "?" },
];

function SexSheet({ open, onClose, litter, piglets, onDone }: { open: boolean; onClose: () => void; litter: Litter; piglets: Animal[]; onDone: () => void }) {
  const [picked, setPicked] = useState<Record<string, Sex | "?">>({});
  const sexOf = (a: Animal): Sex | "?" => picked[a.id] ?? a.sex ?? "?";
  const males = piglets.filter((a) => sexOf(a) === "male").length;
  const females = piglets.filter((a) => sexOf(a) === "female").length;
  const submit = async () => {
    for (const a of piglets) {
      const s = sexOf(a);
      if (s !== (a.sex ?? "?")) await patch("animal", a.id, { sex: s === "?" ? undefined : s });
    }
    setPicked({});
    onDone();
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={`Sexes in ${litter.id}`}>
      <p className="small muted">
        {males} male · {females} female{piglets.length - males - females ? ` · ${piglets.length - males - females} not sexed` : ""}
      </p>
      <div className="stack-sm">
        {piglets
          .slice()
          .sort((x, y) => animalLabel(x).localeCompare(animalLabel(y), undefined, { numeric: true }))
          .map((a) => (
            <div key={a.id} className="between">
              <span>
                {animalLabel(a)}
                {a.status !== "active" ? <span className="small muted"> · {a.status}</span> : null}
              </span>
              <Seg value={sexOf(a)} onChange={(v) => setPicked({ ...picked, [a.id]: v })} options={SEX_OPTIONS} />
            </div>
          ))}
      </div>
      <button type="button" className="btn lg primary" onClick={submit}>
        Save
      </button>
    </Sheet>
  );
}
