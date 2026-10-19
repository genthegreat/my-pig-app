"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useActiveAnimals, useRooms, useSettings } from "@/db/hooks";
import { WEIGHT_METHOD_LABEL, type WeightMethod } from "@/db/schema";
import { setSetting } from "@/db/settings";
import { save, todayIso } from "@/db/write";
import { uid } from "@/db/device";
import { regenerateCalendar } from "@/db/calendar";
import { useToast } from "@/components/AppShell";
import { DateInput, Field, Page, TextArea } from "@/components/ui";
import { ageDays, fmtAge } from "@/domain/dates";
import { fmtDate, fmtKg, plural } from "@/domain/format";
import { parseWeighText, roomForBirthDate } from "@/domain/weighText";

const METHODS = Object.keys(WEIGHT_METHOD_LABEL) as WeightMethod[];

// A weigh-in written down as a note — a heading per pen and its weights —
// read in one go instead of typed again pig by pig.
export default function PasteWeighPage() {
  const router = useRouter();
  const { toast } = useToast();
  const settings = useSettings();
  const rooms = useRooms();
  const animals = useActiveAnimals();
  const today = todayIso();
  const [text, setText] = useState("");
  const [dateOverride, setDateOverride] = useState<string>();
  const [method, setMethod] = useState<WeightMethod>("spring_scale");
  // Room per group, by index; "" means leave the group out.
  const [roomPick, setRoomPick] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings?.last_weigh_method) setMethod(settings.last_weigh_method as WeightMethod);
  }, [settings]);

  const parsed = useMemo(() => parseWeighText(text, today), [text, today]);
  const date = dateOverride ?? parsed.date ?? today;
  const groups = parsed.groups.filter((g) => g.weights.length);
  const roomOf = (i: number) => roomPick[i] ?? roomForBirthDate(groups[i].bornOn, animals ?? []) ?? "";
  const toSave = groups.map((g, i) => ({ g, room: roomOf(i) })).filter((x) => x.room);
  const pigCount = toSave.reduce((n, x) => n + x.g.weights.length, 0);

  const onText = (v: string) => {
    setText(v);
    setRoomPick({});
    setDateOverride(undefined);
  };

  const saveAll = async () => {
    setSaving(true);
    for (const { g, room } of toSave) {
      const batch = uid("wb");
      for (const kg of g.weights) await save("weight", { room_id: room, date, weight_kg: kg, basis: "live", method, batch_id: batch });
    }
    await setSetting("last_weigh_method", method);
    await regenerateCalendar();
    toast(`${plural(pigCount, "weight")} saved`);
    router.push(toSave.length === 1 ? `/rooms/detail/?id=${toSave[0].room}` : "/rooms/");
  };

  return (
    <Page title="Paste weights" back="/weigh/">
      <Field label="Your note" hint="A heading for each pen, then its weights separated by commas. A date line on top sets the day.">
        <TextArea value={text} onChange={onText} placeholder={"Weights 17 October\n\nBorn 24/08:\n13,24,12,22\n\nBorn 31/07:\n40,40,35,36"} />
      </Field>

      {text.trim() && (
        <>
          <div className="grid-2">
            <Field label="Weighed on" hint={parsed.date ? undefined : "No date in the note — set it here."}>
              <DateInput value={date} onChange={setDateOverride} />
            </Field>
            <Field label="Method">
              <select className="select" value={method} onChange={(e) => setMethod(e.target.value as WeightMethod)}>
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {WEIGHT_METHOD_LABEL[m]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {!groups.length && <p className="muted small">No weights found yet. Put each pen&apos;s weights on the line under its heading.</p>}

          {groups.map((g, i) => {
            const kgs = g.weights;
            const avg = kgs.reduce((a, b) => a + b, 0) / kgs.length;
            const room = roomOf(i);
            const inRoom = (animals ?? []).filter((a) => a.current_room === room).length;
            const age = ageDays(g.bornOn, date);
            return (
              <div key={i} className={`card ${room ? "" : "soft"}`}>
                <div className="between">
                  <b>{g.heading || `Group ${i + 1}`}</b>
                  <span className="small muted">
                    {g.bornOn && `born ${fmtDate(g.bornOn)}${age !== undefined ? ` · ${fmtAge(age)}` : ""}`}
                  </span>
                </div>
                <div className="small">
                  <b className="num">{kgs.length}</b> weighed · avg <b className="num">{fmtKg(avg)}</b> · {fmtKg(Math.min(...kgs), 0)}–{fmtKg(Math.max(...kgs), 0)}
                </div>
                <div className="small muted num">{kgs.join(", ")}</div>
                {g.unread.length > 0 && (
                  <div className="small warn">
                    Not read as weights: {g.unread.join(", ")}. Check the note — these are left out.
                  </div>
                )}
                <select className="select" value={room} onChange={(e) => setRoomPick({ ...roomPick, [i]: e.target.value })} style={{ marginTop: 8 }}>
                  <option value="">Don&apos;t save this group</option>
                  {(rooms ?? [])
                    .filter((r) => r.active)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                </select>
                {room && inRoom > 0 && inRoom !== kgs.length && (
                  <div className="small warn">
                    This room holds {plural(inRoom, "pig")} on record; the note has {plural(kgs.length, "weight")}.
                  </div>
                )}
                {!room && g.bornOn && <div className="small muted">No room holds pigs born {fmtDate(g.bornOn)} — pick one.</div>}
              </div>
            );
          })}

          {parsed.unread.length > 0 && <p className="small muted">Lines not used: {parsed.unread.join(" · ")}</p>}

          <div className="actions">
            <button type="button" className="btn lg primary" disabled={!pigCount || saving} onClick={saveAll}>
              {pigCount ? `Save ${plural(pigCount, "weight")} · ${fmtDate(date)}` : "Pick a room to save"}
            </button>
          </div>
        </>
      )}
    </Page>
  );
}
