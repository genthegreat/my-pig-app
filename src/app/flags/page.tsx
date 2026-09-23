"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import type { DataFlag } from "@/db/schema";
import { patch, save, todayIso } from "@/db/write";
import { useToast } from "@/components/AppShell";
import { Empty, Field, Page, Sheet, TextArea, TextInput } from "@/components/ui";
import { fmtDate, plural } from "@/domain/format";

const TABLE_LINK: Record<string, (id?: string) => string | undefined> = {
  cost: (id) => (id ? `/costs/new/?id=${id}` : "/costs/"),
  litter: (id) => (id ? `/breeding/litter/?id=${id}` : "/breeding/"),
  animal: (id) => (id ? `/animals/detail/?id=${id}` : "/animals/"),
  feed_product: (id) => (id ? `/feed/product/?id=${id}` : "/feed/"),
  sale: (id) => (id ? `/sales/detail/?id=${id}` : "/sales/"),
  weight: () => "/rooms/",
};

export default function FlagsPage() {
  const { toast } = useToast();
  const flags = useLiveQuery(() => db.data_flag.toArray(), []);
  const [resolving, setResolving] = useState<DataFlag | null>(null);
  const [raising, setRaising] = useState(false);
  const [resolution, setResolution] = useState("");
  const [issue, setIssue] = useState("");
  const [about, setAbout] = useState("");
  const open = (flags ?? []).filter((f) => !f.resolved_on).sort((a, b) => (a.raised_on < b.raised_on ? -1 : 1));
  const done = (flags ?? []).filter((f) => f.resolved_on).sort((a, b) => (a.resolved_on! < b.resolved_on! ? 1 : -1));

  return (
    <Page
      title="Flags"
      back="/more/"
      right={
        <button type="button" className="btn sm primary" onClick={() => setRaising(true)}>
          + Flag
        </button>
      }
    >
      <p className="small muted">
        Records that do not reconcile. They are never deleted or quietly cleaned up — each one is resolved with a note saying what was decided, so the decision can be traced later.
      </p>

      <div className="section-title">
        <h2>{plural(open.length, "open item")}</h2>
      </div>
      <div className="stack">
        {open.length === 0 && (
          <div className="card">
            <Empty ico="✅">Everything reconciles.</Empty>
          </div>
        )}
        {open.map((f) => {
          const href = TABLE_LINK[f.table_name]?.(f.record_id);
          return (
            <div key={f.id} className="card warn">
              <div className="between" style={{ alignItems: "flex-start" }}>
                <span className="badge">{f.table_name.replace("_", " ")}</span>
                <span className="tiny muted">raised {fmtDate(f.raised_on)}</span>
              </div>
              <p className="mt" style={{ marginTop: 8 }}>
                {f.issue}
              </p>
              <div className="actions mt">
                {href && (
                  <Link href={href} className="btn sm">
                    Open record
                  </Link>
                )}
                <button
                  type="button"
                  className="btn sm primary"
                  onClick={() => {
                    setResolution("");
                    setResolving(f);
                  }}
                >
                  Resolve
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {done.length > 0 && (
        <details className="plain">
          <summary>{plural(done.length, "resolved item")}</summary>
          <div className="stack mt">
            {done.map((f) => (
              <div key={f.id} className="card soft small">
                <div className="muted">{f.issue}</div>
                <div className="mt bold">
                  {fmtDate(f.resolved_on)}: {f.resolution}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      <Sheet open={!!resolving} onClose={() => setResolving(null)} title="Resolve">
        <p className="small muted">{resolving?.issue}</p>
        <Field label="What was decided" hint="Kept with the record forever.">
          <TextArea value={resolution} onChange={setResolution} placeholder="Checked the receipt — it was 15 bags at K90." />
        </Field>
        <button
          type="button"
          className="btn lg primary"
          disabled={!resolution.trim()}
          onClick={async () => {
            if (!resolving) return;
            await patch("data_flag", resolving.id, { resolved_on: todayIso(), resolution: resolution.trim() });
            setResolving(null);
            toast("Resolved");
          }}
        >
          Mark resolved
        </button>
      </Sheet>

      <Sheet open={raising} onClose={() => setRaising(false)} title="Raise a flag">
        <Field label="What doesn't add up">
          <TextArea value={issue} onChange={setIssue} />
        </Field>
        <Field label="About" hint="Optional: the record it concerns">
          <TextInput value={about} onChange={setAbout} placeholder="e.g. Room 7 weigh-in, July feed bill" />
        </Field>
        <button
          type="button"
          className="btn lg primary"
          disabled={!issue.trim()}
          onClick={async () => {
            await save("data_flag", { table_name: about.trim() ? about.trim() : "note", issue: issue.trim(), raised_on: todayIso() });
            setIssue("");
            setAbout("");
            setRaising(false);
            toast("Flagged");
          }}
        >
          Raise
        </button>
      </Sheet>
    </Page>
  );
}
