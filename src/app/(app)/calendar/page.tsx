"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { useToday } from "@/db/hooks";
import type { CalendarEntry, Schedule } from "@/db/schema";
import { PaySheet } from "@/components/PaySheet";
import { bagsForOccurrence, feedNeedByProduct } from "@/domain/schedule";
import type { ProductNeed } from "@/domain/schedule";
import { useAnimals, useSettings } from "@/db/hooks";
import { patch, remove, save, todayIso } from "@/db/write";
import { regenerateCalendar } from "@/db/calendar";
import { useToast } from "@/components/AppShell";
import { Confirm, KindBadge, Page } from "@/components/ui";
import { addMonths, daysInMonth, monthKey, monthStart, parseIso, toIso } from "@/domain/dates";
import { MONTH_NAMES, fmtDate, plural } from "@/domain/format";

const DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** Which mark an entry gets: pay and feed buys are told apart, tasks share a neutral. */
function toneOf(e: CalendarEntry): string {
  if (e.source === "schedule") return e.short === "Pay" ? "pay" : "feed";
  if (e.source === "feed_forecast") return "feed";
  return e.kind;
}
const TONES: { tone: string; label: string }[] = [
  { tone: "pay", label: "pay" },
  { tone: "feed", label: "feed" },
  { tone: "breeding", label: "farrowing" },
  { tone: "sale", label: "sale-ready" },
  { tone: "health", label: "health" },
  { tone: "weighing", label: "weighing" },
  { tone: "manual", label: "task" },
  { tone: "overdue", label: "overdue" },
];

export default function CalendarPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const params = useSearchParams();
  const today = useToday();
  const { toast } = useToast();
  const [selected, setSelected] = useState(params.get("d") ?? today);
  const [month, setMonth] = useState(monthKey(params.get("d") ?? today));
  const [pending, setPending] = useState<CalendarEntry | null>(null);
  const [paying, setPaying] = useState<{ schedule: Schedule; occurrence: string } | null>(null);
  const entries = useLiveQuery(() => db.calendar_entry.toArray(), []);
  const schedules = useLiveQuery(() => db.schedule.toArray(), []);
  const settings = useSettings();
  const animals = useAnimals();
  const feedData = useLiveQuery(async () => ({
    products: await db.feed_product.toArray(),
    rations: await db.ration.toArray(),
    groups: await db.group.toArray(),
    litters: await db.litter.toArray(),
  }), []);
  const need = useMemo<Map<string, ProductNeed>>(
    () => (feedData && animals ? feedNeedByProduct(feedData.rations, new Map(feedData.products.map((p) => [p.id, p])), feedData.groups, animals, feedData.litters, settings, today) : new Map()),
    [feedData, animals, settings, today],
  );
  const scheduleFor = (e: CalendarEntry) => (e.schedule_id ? schedules?.find((s) => s.id === e.schedule_id) : undefined);

  const byDate = useMemo(() => {
    const m = new Map<string, CalendarEntry[]>();
    for (const e of entries ?? []) {
      const l = m.get(e.date) ?? [];
      l.push(e);
      m.set(e.date, l);
    }
    for (const l of m.values()) l.sort((a, b) => a.kind.localeCompare(b.kind));
    return m;
  }, [entries]);

  const overdue = useMemo(() => (entries ?? []).filter((e) => !e.done && e.date < today).sort((a, b) => (a.date < b.date ? -1 : 1)), [entries, today]);

  // Grid cells: Monday-first, padded with the neighbouring months.
  const cells = useMemo(() => {
    const first = parseIso(monthStart(month));
    const lead = (first.getDay() + 6) % 7;
    const n = daysInMonth(month);
    const out: { iso: string; inMonth: boolean }[] = [];
    for (let i = -lead; i < n + ((7 - ((lead + n) % 7)) % 7); i++) {
      const d = new Date(first);
      d.setDate(first.getDate() + i);
      out.push({ iso: toIso(d), inMonth: i >= 0 && i < n });
    }
    return out;
  }, [month]);

  const dayEntries = byDate.get(selected) ?? [];
  const [y, m] = month.split("-").map(Number);

  const markDone = async (e: CalendarEntry) => {
    if (e.source === "protocol" && e.notes) {
      // Doing a protocol item means recording the event for each pig it covered.
      const ids = e.notes.split(",").filter(Boolean);
      const protocolId = e.id.split(":")[2];
      const p = await db.health_protocol.get(protocolId);
      const worker = (await db.employee.where("status").equals("active").first())?.name;
      for (const animalId of ids) {
        await save("health_event", { animal_id: animalId, room_id: e.room_id, type: p?.type ?? "treatment", product: p?.product, date: todayIso(), administered_by: worker });
      }
      toast(`Recorded for ${plural(ids.length, "pig")}`);
      await regenerateCalendar();
      return;
    }
    await patch("calendar_entry", e.id, { done: e.done ? 0 : 1, done_date: e.done ? undefined : todayIso() });
  };

  return (
    <Page
      title="Calendar"
      right={
        <Link href={`/calendar/new/?d=${selected}`} className="btn sm primary">
          + Entry
        </Link>
      }
    >
      {overdue.length > 0 && (
        <div className="card danger">
          <div className="bold">{plural(overdue.length, "item")} overdue</div>
          <div className="small">
            {overdue.slice(0, 4).map((e) => (
              <button key={e.id} type="button" className="stat-line" style={{ width: "100%", background: "none", border: 0, padding: "6px 0", textAlign: "left" }} onClick={() => { setSelected(e.date); setMonth(monthKey(e.date)); }}>
                <span className="k danger bold">{fmtDate(e.date)}</span>
                <span className="v" style={{ fontWeight: 500 }}>{e.title}</span>
              </button>
            ))}
            {overdue.length > 4 && <div className="tiny muted">…and {overdue.length - 4} more. They stay red until done.</div>}
          </div>
        </div>
      )}

      <div className="between">
        <button type="button" className="btn sm" onClick={() => setMonth(addMonths(month, -1))}>
          ‹
        </button>
        <h2>
          {MONTH_NAMES[m - 1]} {y}
        </h2>
        <button type="button" className="btn sm" onClick={() => setMonth(addMonths(month, 1))}>
          ›
        </button>
      </div>

      <div className="cal-head">
        {DOW.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="cal-grid">
        {cells.map((c) => {
          const list = byDate.get(c.iso) ?? [];
          const shown = list.slice(0, 8);
          return (
            <button
              key={c.iso}
              type="button"
              className={`cal-day ${c.inMonth ? "" : "other"} ${c.iso === today ? "today" : ""} ${c.iso === selected ? "selected" : ""}`}
              onClick={() => setSelected(c.iso)}
            >
              <span className="d">{Number(c.iso.slice(8))}</span>
              <span className="dots">
                {shown.map((e) => (
                  <span
                    key={e.id}
                    className={`mark ${toneOf(e)} ${!e.done && e.date < today ? "overdue" : ""} ${e.done ? "done" : ""}`}
                    title={e.title}
                  />
                ))}
                {list.length > shown.length && <span className="more">+{list.length - shown.length}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <div className="section-title">
        <h2>{fmtDate(selected)}</h2>
        <span className="small muted">{selected === today ? "today" : ""}</span>
      </div>
      <div className="card tight">
        {dayEntries.length === 0 ? (
          <div className="empty small">Nothing on this day.</div>
        ) : (
          <div className="list">
            {dayEntries.map((e) => {
              const isOverdue = !e.done && e.date < today;
              return (
                <div key={e.id} className="row" style={{ alignItems: "flex-start" }}>
                  <span className={`mark lg ${toneOf(e)} ${isOverdue ? "overdue" : ""}`} style={{ marginTop: 8 }} />
                  <div className="body">
                    <div className="title" style={{ whiteSpace: "normal", textDecoration: e.done ? "line-through" : undefined }}>
                      {e.title}
                    </div>
                    <div className="sub hstack wrap" style={{ gap: 6 }}>
                      <KindBadge kind={e.kind} overdue={isOverdue}>
                        {isOverdue ? "overdue" : (TONES.find((t) => t.tone === toneOf(e))?.label ?? e.kind)}
                      </KindBadge>
                      <span className="tiny">{e.source === "manual" ? "entered" : `from ${e.source}`}</span>
                      {e.litter_id && (
                        <Link href={`/breeding/litter/?id=${e.litter_id}`} className="tiny" style={{ color: "var(--accent)", fontWeight: 700 }}>
                          litter ›
                        </Link>
                      )}
                      {e.room_id && (
                        <Link href={`/rooms/detail/?id=${e.room_id}`} className="tiny" style={{ color: "var(--accent)", fontWeight: 700 }}>
                          room ›
                        </Link>
                      )}
                    </div>
                  </div>
                  <div className="stack-sm" style={{ gap: 4 }}>
                    {e.source === "schedule" && scheduleFor(e)?.kind === "pay" ? (
                      <button type="button" className="btn sm primary" onClick={() => setPaying({ schedule: scheduleFor(e)!, occurrence: e.date })}>
                        Record pay
                      </button>
                    ) : e.source === "schedule" && scheduleFor(e)?.kind === "feed" ? (
                      <Link
                        href={`/feed/purchase/?product=${scheduleFor(e)!.product_id ?? ""}&bags=${bagsForOccurrence(scheduleFor(e)!, need.get(scheduleFor(e)!.product_id ?? "")) ?? ""}&schedule=${e.schedule_id}&occ=${e.date}`}
                        className="btn sm primary"
                      >
                        Bought
                      </Link>
                    ) : e.source === "breeding" && e.id.includes(":farrow:") ? (
                      <Link href={`/breeding/farrow/?litter=${e.litter_id}`} className="btn sm primary">
                        Farrowed
                      </Link>
                    ) : e.source === "projection" ? (
                      <Link href={`/offer/?room=${e.room_id}`} className="btn sm">
                        Offer
                      </Link>
                    ) : e.source === "feed_forecast" ? (
                      <Link href="/feed/purchase/" className="btn sm">
                        Buy
                      </Link>
                    ) : (
                      <button type="button" className={`btn sm ${e.done ? "" : "primary"}`} onClick={() => markDone(e)}>
                        {e.done ? "Undo" : "Done"}
                      </button>
                    )}
                    {e.source === "manual" && (
                      <button type="button" className="btn sm ghost" onClick={() => setPending(e)}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="legend">
        {TONES.map((t) => (
          <span key={t.tone}>
            <span className={`mark ${t.tone}`} /> {t.label}
          </span>
        ))}
      </div>

      <PaySheet open={!!paying} onClose={() => setPaying(null)} schedule={paying?.schedule} occurrence={paying?.occurrence} onDone={() => toast("Pay recorded")} />
      <Confirm
        open={!!pending}
        onClose={() => setPending(null)}
        title="Delete this entry?"
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          if (pending) await remove("calendar_entry", pending.id);
          setPending(null);
        }}
      />
    </Page>
  );
}
