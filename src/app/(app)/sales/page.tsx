"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { useSettings } from "@/db/hooks";
import { num } from "@/db/settings";
import { ChannelBadge, Empty, Page, SectionTitle } from "@/components/ui";
import { fmtDate, fmtK, fmtK2, fmtPct, plural } from "@/domain/format";
import { meanDressing } from "@/domain/sales";

export default function SalesPage() {
  const settings = useSettings();
  const sales = useLiveQuery(() => db.sale.orderBy("date").reverse().toArray(), []);
  const clients = useLiveQuery(() => db.client.toArray(), []);
  const clientName = (id?: string) => clients?.find((c) => c.id === id)?.name;

  const stats = useMemo(() => {
    const s = sales ?? [];
    const total = s.reduce((a, x) => a + x.total, 0);
    const head = s.reduce((a, x) => a + x.head, 0);
    const live = s.filter((x) => x.channel === "live" && x.live_equivalent_per_kg).map((x) => x.live_equivalent_per_kg!);
    const dead = s.filter((x) => x.channel === "dead" && x.live_equivalent_per_kg).map((x) => x.live_equivalent_per_kg!);
    const dressing = s.filter((x) => x.dressing_pct).map((x) => x.dressing_pct!);
    return {
      total,
      head,
      bestLive: live.length ? Math.max(...live) : undefined,
      worstLive: live.length ? Math.min(...live) : undefined,
      bestDead: dead.length ? Math.max(...dead) : undefined,
      worstDead: dead.length ? Math.min(...dead) : undefined,
      dressing: meanDressing(dressing),
      dressingMin: dressing.length ? Math.min(...dressing) : undefined,
      dressingMax: dressing.length ? Math.max(...dressing) : undefined,
    };
  }, [sales]);

  return (
    <Page
      title="Sales"
      back="/more/"
      right={
        <Link href="/sales/new/" className="btn sm primary">
          + Sale
        </Link>
      }
    >
      <div className="kpis">
        <div className="kpi hero">
          <span className="k">Revenue to date</span>
          <span className="v">{fmtK(stats.total)}</span>
          <span className="n">
            {plural(sales?.length ?? 0, "sale")} · {plural(stats.head, "head")}
          </span>
        </div>
        <div className="kpi">
          <span className="k">Live sales</span>
          <span className="v">{stats.bestLive ? fmtK2(stats.bestLive) : "—"}</span>
          <span className="n">{stats.worstLive && stats.worstLive !== stats.bestLive ? `down to ${fmtK2(stats.worstLive)} per kg` : "per live kg"}</span>
        </div>
        <div className="kpi">
          <span className="k">Dead sales, live-equivalent</span>
          <span className="v">{stats.bestDead ? fmtK2(stats.bestDead) : "—"}</span>
          <span className="n">{stats.worstDead && stats.worstDead !== stats.bestDead ? `down to ${fmtK2(stats.worstDead)} per live kg` : "per live kg"}</span>
        </div>
        <div className="kpi">
          <span className="k">Dressing measured</span>
          <span className="v">{fmtPct(stats.dressing)}</span>
          <span className="n">
            {stats.dressingMin !== undefined ? `${fmtPct(stats.dressingMin)} – ${fmtPct(stats.dressingMax)}` : "needs both weights"} · default {num(settings, "dressing_pct")}%
          </span>
        </div>
      </div>
      {stats.bestDead !== undefined && stats.worstLive !== undefined && stats.worstLive > stats.bestDead && (
        <div className="card accent small">
          <b>Every live sale has beaten every dead sale.</b> The best dead-weight price came to {fmtK2(stats.bestDead)} per live kg; the weakest live sale paid {fmtK2(stats.worstLive)}.
        </div>
      )}

      <SectionTitle href="/clients/" action="Clients ›">
        All sales
      </SectionTitle>
      <div className="card tight">
        {!sales?.length ? (
          <Empty ico="🤝">No sales yet.</Empty>
        ) : (
          <div className="list">
            {sales.map((s) => (
              <Link key={s.id} href={`/sales/detail/?id=${s.id}`} className="row">
                <div className="body">
                  <div className="title">{s.description ?? `${plural(s.head, "pig")} · ${s.channel}`}</div>
                  <div className="sub hstack" style={{ gap: 6 }}>
                    <ChannelBadge channel={s.channel} />
                    <span className="ellipsis">
                      {fmtDate(s.date)}
                      {clientName(s.client_id) ? ` · ${clientName(s.client_id)}` : ""}
                      {s.payment_status && s.payment_status !== "paid" ? ` · ${s.payment_status}` : ""}
                    </span>
                  </div>
                </div>
                <div className="trail">
                  <div className="v">{fmtK(s.total)}</div>
                  <div className="tiny muted">
                    {s.live_equivalent_per_kg ? `${fmtK2(s.live_equivalent_per_kg)}/kg live${s.channel === "dead" ? " equiv." : ""}` : s.channel === "dead" ? "no live weight" : ""}
                  </div>
                </div>
                <span className="chev">›</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Page>
  );
}
