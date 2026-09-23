"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { useActiveAnimals, useOpenFlagCount, useRoomMap, useToday } from "@/db/hooks";
import { STAGE_LABEL, STAGE_PLURAL, STAGES, type Stage } from "@/db/schema";
import { herdCounts } from "@/domain/herd";
import { addDays } from "@/domain/dates";
import { fmtDate, fmtDayMonth, fmtK, fmtK2, fmtKg, plural } from "@/domain/format";
import { weighSessions } from "@/domain/growth";
import { ChannelBadge, Page, KindBadge, SectionTitle } from "@/components/ui";

export default function Home() {
  const today = useToday();
  const animals = useActiveAnimals();
  const rooms = useRoomMap();
  const flags = useOpenFlagCount();
  const counts = animals ? herdCounts(animals) : undefined;

  const due = useLiveQuery(async () => {
    const until = addDays(today, 7);
    const all = await db.calendar_entry.where("date").belowOrEqual(until).toArray();
    return all
      .filter((e) => !e.done)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(0, 6);
  }, [today]);

  const lastWeigh = useLiveQuery(async () => {
    const ws = await db.weight.orderBy("date").reverse().limit(60).toArray();
    return weighSessions(ws)[0];
  }, []);
  const lastSale = useLiveQuery(() => db.sale.orderBy("date").reverse().first(), []);
  const pending = useLiveQuery(async () => (await db.sync_queue.toArray()).filter((q) => !q.synced_at).length, []);

  return (
    <Page title="My Pigs" right={<span className="small muted nowrap">{fmtDate(today)}</span>}>
      <Link href="/animals/" className="card accent">
        <div className="between">
          <div>
            <div className="eyebrow">Herd today</div>
            <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.05 }} className="num">
              {counts ? counts.total : "…"} <span style={{ fontSize: 20, fontWeight: 700 }}>head</span>
            </div>
          </div>
          <span style={{ fontSize: 44 }} aria-hidden>
            🐖
          </span>
        </div>
        {counts && (
          <div className="chips mt" style={{ gap: 6 }}>
            {STAGES.filter((s) => counts.byStage[s] > 0).map((s: Stage) => (
              <span key={s} className="chip sm">
                {counts.byStage[s]} {counts.byStage[s] === 1 ? STAGE_LABEL[s].toLowerCase() : STAGE_PLURAL[s]}
              </span>
            ))}
          </div>
        )}
      </Link>

      <div className="grid-2">
        <Link href="/weigh/" className="btn tile primary">
          <span className="ico">⚖️</span>
          <span className="lbl">Weigh a pen</span>
        </Link>
        <Link href="/offer/" className="btn tile">
          <span className="ico">💰</span>
          <span className="lbl">Offer calculator</span>
        </Link>
        <Link href="/costs/new/" className="btn tile">
          <span className="ico">🧾</span>
          <span className="lbl">Add a cost</span>
        </Link>
        <Link href="/health/new/" className="btn tile">
          <span className="ico">💉</span>
          <span className="lbl">Quick log</span>
        </Link>
      </div>

      {flags > 0 && (
        <Link href="/flags/" className="card warn between">
          <div>
            <div className="bold">{plural(flags, "record needs", "records need")} a decision</div>
            <div className="small muted">Things that did not reconcile. Kept visible, never cleaned away.</div>
          </div>
          <span className="chev" style={{ fontSize: 24 }}>
            ›
          </span>
        </Link>
      )}

      <section>
        <SectionTitle href="/calendar/" action="Calendar ›">
          Due soon
        </SectionTitle>
        <div className="card tight mt">
          {!due?.length ? (
            <div className="empty small">Nothing due in the next 7 days.</div>
          ) : (
            <div className="list">
              {due.map((e) => {
                const overdue = e.date < today;
                return (
                  <Link key={e.id} href={`/calendar/?d=${e.date}`} className="row">
                    <div className="trail" style={{ width: 52, textAlign: "left" }}>
                      <div className={`bold ${overdue ? "danger" : ""}`}>{fmtDayMonth(e.date)}</div>
                    </div>
                    <div className="body">
                      <div className="title">{e.title}</div>
                      <div className="sub">
                        <KindBadge kind={e.kind} overdue={overdue}>
                          {overdue ? "overdue" : e.kind}
                        </KindBadge>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section>
        <SectionTitle>Latest</SectionTitle>
        <div className="card tight mt">
          <div className="list">
            {lastWeigh ? (
              <Link href={`/rooms/detail/?id=${lastWeigh.roomId ?? ""}`} className="row">
                <span className="ico" style={{ fontSize: 22 }}>
                  ⚖️
                </span>
                <div className="body">
                  <div className="title">
                    {lastWeigh.roomId ? (rooms.get(lastWeigh.roomId)?.label ?? lastWeigh.roomId) : "Weigh-in"} · {plural(lastWeigh.count, "pig")}
                  </div>
                  <div className="sub">
                    {fmtDate(lastWeigh.date)} · avg {fmtKg(lastWeigh.avgKg)} · {fmtKg(lastWeigh.minKg, 0)}–{fmtKg(lastWeigh.maxKg, 0)}
                  </div>
                </div>
                <span className="chev">›</span>
              </Link>
            ) : null}
            {lastSale ? (
              <Link href={`/sales/detail/?id=${lastSale.id}`} className="row">
                <span className="ico" style={{ fontSize: 22 }}>
                  🤝
                </span>
                <div className="body">
                  <div className="title">
                    {fmtK(lastSale.total)} · {lastSale.description ?? plural(lastSale.head, "pig")}
                  </div>
                  <div className="sub hstack" style={{ gap: 6 }}>
                    <ChannelBadge channel={lastSale.channel} />
                    <span className="ellipsis">
                      {fmtDate(lastSale.date)}
                      {lastSale.live_equivalent_per_kg ? ` · ${fmtK2(lastSale.live_equivalent_per_kg)}/kg live` : ""}
                    </span>
                  </div>
                </div>
                <span className="chev">›</span>
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <p className="tiny faint center">
        {pending ? `${plural(pending, "change")} recorded on this phone, waiting for sync (no server yet).` : "All records live on this phone."}
      </p>
    </Page>
  );
}
