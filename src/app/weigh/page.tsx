"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { animalLabel, useActiveAnimals, useRooms, useSettings } from "@/db/hooks";
import { WEIGHT_METHOD_LABEL, type Weight, type WeightMethod } from "@/db/schema";
import { setSetting } from "@/db/settings";
import { remove, save, todayIso } from "@/db/write";
import { uid } from "@/db/device";
import { regenerateCalendar } from "@/db/calendar";
import { useToast } from "@/components/AppShell";
import { NumberPad } from "@/components/NumberPad";
import { DateInput, Page, Seg } from "@/components/ui";
import { fmtKg, plural } from "@/domain/format";

const METHODS = (Object.keys(WEIGHT_METHOD_LABEL) as WeightMethod[]).map((m) => ({ value: m, label: WEIGHT_METHOD_LABEL[m] }));

export default function WeighPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const settings = useSettings();
  const rooms = useRooms();
  const animals = useActiveAnimals();
  const [room, setRoom] = useState<string | undefined>(params.get("room") ?? undefined);
  const [animalId, setAnimalId] = useState<string | undefined>(params.get("animal") ?? undefined);
  const [date, setDate] = useState(todayIso());
  const [method, setMethod] = useState<WeightMethod>("spring_scale");
  const [value, setValue] = useState("");
  const [batch] = useState(() => uid("wb"));
  const [tagEach, setTagEach] = useState(!!params.get("animal"));
  const [zeroChecked, setZeroChecked] = useState(false);

  // Defaults pre-filled from the last entry.
  useEffect(() => {
    if (!settings) return;
    if (!room && !params.get("room") && settings.last_weigh_room) setRoom(settings.last_weigh_room);
    if (settings.last_weigh_method) setMethod(settings.last_weigh_method as WeightMethod);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const occupants = useMemo(() => (animals ?? []).filter((a) => a.current_room === room), [animals, room]);
  const entered = useLiveQuery(() => db.weight.where("batch_id").equals(batch).toArray(), [batch]) ?? [];
  const sorted = useMemo(() => entered.slice().sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1)), [entered]);
  const total = sorted.reduce((s, w) => s + w.weight_kg, 0);
  const weighedIds = new Set(sorted.map((w) => w.animal_id).filter(Boolean));
  const roomLabel = rooms?.find((r) => r.id === room)?.label;

  const onEnter = async (kg: number) => {
    const row: Omit<Weight, "id" | "updated_at" | "device_id"> = {
      room_id: room,
      animal_id: tagEach ? animalId : undefined,
      date,
      weight_kg: kg,
      basis: "live",
      method,
      batch_id: batch,
    };
    await save("weight", row); // saved before the thumb leaves the screen
    setValue("");
    if (tagEach) {
      // advance to the next pig in the pen that has no weight yet
      const next = occupants.find((a) => a.id !== animalId && !weighedIds.has(a.id));
      setAnimalId(next?.id);
      if (params.get("animal") && !next) toast(`${fmtKg(kg)} saved`);
    }
    if (navigator.vibrate) navigator.vibrate(15);
  };

  const undo = async () => {
    const last = sorted[sorted.length - 1];
    if (!last) return;
    await remove("weight", last.id);
    if (last.animal_id) setAnimalId(last.animal_id);
  };

  const done = async () => {
    if (room) await setSetting("last_weigh_room", room);
    await setSetting("last_weigh_method", method);
    await regenerateCalendar();
    toast(sorted.length ? `${plural(sorted.length, "weight")} saved` : "Nothing recorded");
    router.push(room ? `/rooms/detail/?id=${room}` : "/");
  };

  if (!room) {
    return (
      <Page title="Weigh a pen" back="/">
        <p className="muted">Which room?</p>
        <div className="grid-2">
          {(rooms ?? [])
            .filter((r) => r.active)
            .map((r) => {
              const n = (animals ?? []).filter((a) => a.current_room === r.id).length;
              return (
                <button key={r.id} type="button" className={`btn lg ${n ? "" : "soft"}`} onClick={() => setRoom(r.id)}>
                  {r.label}
                  <span className="muted small">{n ? ` · ${n}` : ""}</span>
                </button>
              );
            })}
        </div>
      </Page>
    );
  }

  return (
    <Page
      title={`Weigh · ${roomLabel ?? room}`}
      back={true}
      right={
        <button type="button" className="btn sm soft" onClick={() => setRoom(undefined)}>
          Change room
        </button>
      }
    >
      <div className="grid-2">
        <DateInput value={date} onChange={setDate} />
        <select className="select" value={method} onChange={(e) => setMethod(e.target.value as WeightMethod)}>
          {METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="between">
        <div className="small muted">
          {sorted.length ? (
            <>
              <b className="num">{sorted.length}</b> weighed · avg <b className="num">{fmtKg(total / sorted.length)}</b> · total {fmtKg(total, 0)}
            </>
          ) : (
            <>{plural(occupants.length, "pig")} in this pen</>
          )}
        </div>
        <Seg
          value={tagEach ? "each" : "pen"}
          onChange={(v) => {
            const each = v === "each";
            setTagEach(each);
            if (each && !animalId) setAnimalId(occupants.find((a) => !weighedIds.has(a.id))?.id);
          }}
          options={[
            { value: "pen", label: "Pen" },
            { value: "each", label: "By tag" },
          ]}
        />
      </div>

      {tagEach && (
        <div className="weights-strip" style={{ gap: 8 }}>
          {occupants.map((a) => (
            <button
              key={a.id}
              type="button"
              className="chip"
              aria-pressed={animalId === a.id}
              style={{ opacity: weighedIds.has(a.id) ? 0.5 : 1 }}
              onClick={() => setAnimalId(a.id)}
            >
              {animalLabel(a)}
              {weighedIds.has(a.id) ? " ✓" : ""}
            </button>
          ))}
          {!occupants.length && <span className="small muted">No pigs recorded in this room — weights go against the pen.</span>}
        </div>
      )}

      {/* A scale that does not start at zero spoils the whole session, and nobody notices until the gains look wrong. */}
      {!zeroChecked && !sorted.length && (method === "spring_scale" || method === "digital_scale") && (
        <div className="card between">
          <span className="small">
            <b>Scale zeroed?</b> It should read 0 with nothing on it.
          </span>
          <button type="button" className="btn sm" onClick={() => setZeroChecked(true)}>
            Reads 0
          </button>
        </div>
      )}

      {sorted.length > 0 && (
        <div className="weights-strip">
          {sorted.map((w, i) => (
            <span key={w.id} className={`w ${i === sorted.length - 1 ? "last" : ""}`}>
              {w.weight_kg}
            </span>
          ))}
        </div>
      )}

      <NumberPad value={value} onChange={setValue} onEnter={onEnter} enterLabel={tagEach && animalId ? `Save for ${animalLabel(occupants.find((a) => a.id === animalId))}` : "Next pig"} />

      <div className="actions">
        <button type="button" className="btn lg" onClick={undo} disabled={!sorted.length}>
          Undo last
        </button>
        <button type="button" className="btn lg primary" onClick={done}>
          Done
        </button>
      </div>
    </Page>
  );
}
