"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { useAnimalMap, useToday } from "@/db/hooks";
import { litterDamName } from "@/db/calendar";
import type { Litter } from "@/db/schema";
import { Empty, Page, SectionTitle } from "@/components/ui";
import { daysBetween } from "@/domain/dates";
import { fmtDate, fmtPct, plural } from "@/domain/format";

export default function BreedingPage() {
  const today = useToday();
  const animals = useAnimalMap();
  const litters = useLiveQuery(() => db.litter.toArray(), []);
  const pending = (litters ?? []).filter((l) => l.outcome === "pending").sort((a, b) => ((a.expected_farrow ?? "") < (b.expected_farrow ?? "") ? -1 : 1));
  const farrowed = (litters ?? []).filter((l) => l.outcome === "farrowed").sort((a, b) => ((a.actual_farrow ?? "") < (b.actual_farrow ?? "") ? 1 : -1));
  const lost = (litters ?? []).filter((l) => l.outcome === "miscarried" || l.outcome === "not_pregnant");

  const born = farrowed.reduce((s, l) => s + (l.born_alive ?? 0), 0);
  const died = farrowed.reduce((s, l) => s + (l.died_pre_weaning ?? 0), 0);

  const damLabel = (l: Litter) => litterDamName(l, animals);

  return (
    <Page title="Breeding" back="/more/">
      <div className="grid-2">
        <Link href="/breeding/service/" className="btn lg primary">
          Sow served
        </Link>
        <Link href="/breeding/farrow/" className="btn lg">
          Farrowed
        </Link>
      </div>

      <section>
        <SectionTitle>Due to farrow</SectionTitle>
        <div className="card tight mt">
          {pending.length === 0 ? (
            <Empty ico="🐷">No sow is recorded as served.</Empty>
          ) : (
            <div className="list">
              {pending.map((l) => {
                const days = l.expected_farrow ? daysBetween(today, l.expected_farrow) : undefined;
                return (
                  <Link key={l.id} href={`/breeding/litter/?id=${l.id}`} className="row">
                    <div className="body">
                      <div className="title">{damLabel(l)}</div>
                      <div className="sub">
                        {l.id} · served {fmtDate(l.service_date)} · due {fmtDate(l.expected_farrow)}
                      </div>
                    </div>
                    <div className="trail">
                      <div className={`v ${days !== undefined && days < 0 ? "danger" : ""}`}>
                        {days === undefined ? "—" : days < 0 ? `${-days} d over` : days === 0 ? "today" : `${days} d`}
                      </div>
                      {!l.dam_id && <span className="badge warn">assign sow</span>}
                    </div>
                    <span className="chev">›</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section>
        <SectionTitle
          action={
            <span className="small muted">
              {born} born · {fmtPct(born ? ((born - died) / born) * 100 : undefined)} survived
            </span>
          }
        >
          Farrowed
        </SectionTitle>
        <div className="card tight mt">
          <div className="list">
            {farrowed.map((l) => (
              <Link key={l.id} href={`/breeding/litter/?id=${l.id}`} className="row">
                <div className="body">
                  <div className="title">
                    {l.id} · {damLabel(l)}
                  </div>
                  <div className="sub">
                    {fmtDate(l.actual_farrow)}
                    {l.weaning_date ? ` · weaned ${fmtDate(l.weaning_date)}` : ""}
                  </div>
                </div>
                <div className="trail">
                  <div className="v">{l.born_alive ?? "?"} born</div>
                  <div className="tiny muted">{l.died_pre_weaning ? `${l.died_pre_weaning} lost` : "none lost"}</div>
                </div>
                <span className="chev">›</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {lost.length > 0 && (
        <section>
          <SectionTitle>Did not farrow</SectionTitle>
          <div className="card tight mt">
            <div className="list">
              {lost.map((l) => (
                <Link key={l.id} href={`/breeding/litter/?id=${l.id}`} className="row">
                  <div className="body">
                    <div className="title">
                      {l.id} · {damLabel(l)}
                    </div>
                    <div className="sub">
                      {l.outcome === "miscarried" ? "Miscarried" : "Not pregnant"} {fmtDate(l.outcome_date)} · was due {fmtDate(l.expected_farrow)}
                    </div>
                  </div>
                  <span className="chev">›</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <p className="tiny faint">
        Gestation 114 days has predicted every farrowing to within two days. {plural(farrowed.length, "litter")} on record, average{" "}
        {farrowed.length ? (born / farrowed.length).toFixed(1) : "—"} born alive.
      </p>
    </Page>
  );
}
