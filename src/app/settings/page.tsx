"use client";

import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { getDeviceId } from "@/db/device";
import { useSettings } from "@/db/hooks";
import { resetAndReseed } from "@/db/seed";
import { SETTING_DEFS, dailyCost, setSetting, type SettingDef } from "@/db/settings";
import { regenerateCalendar } from "@/db/calendar";
import { useToast } from "@/components/AppShell";
import { Confirm, Page, SectionTitle } from "@/components/ui";
import { fmtDate, fmtK2, plural } from "@/domain/format";

const GROUPS: { key: SettingDef["group"]; title: string; blurb?: string }[] = [
  { key: "money", title: "Running cost per pig per day", blurb: "The most load-bearing number in the app. It drives break-even, hold-or-sell and margin." },
  { key: "sale", title: "Selling" },
  { key: "biology", title: "Breeding" },
  { key: "growth", title: "Growth" },
  { key: "feed", title: "Feed" },
  { key: "farm", title: "The farm" },
];

export default function SettingsPage() {
  const { toast } = useToast();
  const settings = useSettings();
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useLiveQuery(async () => (await db.sync_queue.toArray()).filter((q) => !q.synced_at).length, []);
  const c = dailyCost(settings);

  const exportBackup = async () => {
    setBusy(true);
    try {
      const dump: Record<string, unknown[]> = {};
      for (const t of db.tables) dump[t.name] = await t.toArray();
      const blob = new Blob([JSON.stringify({ app: "my-pigs", exported_at: new Date().toISOString(), device_id: getDeviceId(), tables: dump }, null, 1)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `my-pigs-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast("Backup saved to downloads");
    } finally {
      setBusy(false);
    }
  };

  const importBackup = async (file: File) => {
    setBusy(true);
    try {
      const parsed = JSON.parse(await file.text()) as { app?: string; tables?: Record<string, unknown[]> };
      if (parsed.app !== "my-pigs" || !parsed.tables) throw new Error("Not a My Pigs backup");
      const names = db.tables.map((t) => t.name);
      await db.transaction("rw", names, async () => {
        for (const name of names) {
          const rows = parsed.tables![name];
          if (!rows) continue;
          await db.table(name).clear();
          await db.table(name).bulkPut(rows);
        }
      });
      await regenerateCalendar();
      toast("Backup restored");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not read that file", "error");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Page title="Settings" back="/more/">
      <div className="card accent">
        <div className="eyebrow">Cost per pig per day in use</div>
        <div style={{ fontSize: 32, fontWeight: 800 }}>{fmtK2(c.total)}</div>
        <div className="small muted">
          feed {fmtK2(c.feed)} + labour {fmtK2(c.labour)} + bedding, vet & power {fmtK2(c.other)}
        </div>
      </div>

      {GROUPS.map((g) => (
        <section key={g.key}>
          <SectionTitle>{g.title}</SectionTitle>
          {g.blurb && <p className="small muted mt" style={{ marginTop: 4 }}>{g.blurb}</p>}
          <div className="card tight mt">
            <div className="list">
              {SETTING_DEFS.filter((d) => d.group === g.key).map((d) => (
                <SettingRow key={d.key} def={d} value={settings?.[d.key] ?? d.value} onSaved={() => toast("Saved")} />
              ))}
            </div>
          </div>
        </section>
      ))}

      <section>
        <SectionTitle>This phone</SectionTitle>
        <div className="card small mt">
          <div className="stat-line">
            <span className="k">Device</span>
            <span className="v">{getDeviceId()}</span>
          </div>
          <div className="stat-line">
            <span className="k">Farm data loaded</span>
            <span className="v">{settings?.seeded_at ? fmtDate(settings.seeded_at.slice(0, 10)) : "—"} (seed {settings?.seed_version ?? "—"})</span>
          </div>
          <div className="stat-line">
            <span className="k">Waiting for sync</span>
            <span className="v">{plural(pending ?? 0, "change")} — no server yet</span>
          </div>
        </div>
        <div className="grid-2 mt">
          <button type="button" className="btn lg" disabled={busy} onClick={exportBackup}>
            Export backup
          </button>
          <button type="button" className="btn lg" disabled={busy} onClick={() => fileRef.current?.click()}>
            Restore backup
          </button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])} />
        </div>
        <p className="tiny faint mt">Everything lives in this phone&apos;s browser storage until sync arrives. Export a backup now and then — a lost phone is a lost farm record otherwise.</p>
        <button type="button" className="btn ghost mt" onClick={() => setConfirmReset(true)}>
          Reset to the seeded data
        </button>
      </section>

      <Confirm
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Throw away everything recorded on this phone?"
        body="The farm is reloaded exactly as it was first seeded. Anything you have recorded since is lost unless you exported a backup."
        confirmLabel="Reset"
        danger
        onConfirm={async () => {
          setConfirmReset(false);
          setBusy(true);
          await resetAndReseed();
          await regenerateCalendar();
          setBusy(false);
          toast("Reloaded the seeded data");
        }}
      />
    </Page>
  );
}

function SettingRow({ def, value, onSaved }: { def: SettingDef; value: string; onSaved: () => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const editable = def.editable !== false;
  const shown = draft ?? value;
  const dirty = draft !== null && draft !== value;
  return (
    <div className="row" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
      <div className="body" style={{ flexBasis: "100%" }}>
        <div className="title" style={{ whiteSpace: "normal" }}>
          {def.label}
        </div>
        <div className="sub" style={{ whiteSpace: "normal" }}>
          {def.source}
        </div>
      </div>
      <div className="hstack" style={{ flexBasis: "100%" }}>
        {editable ? (
          <div className="input-unit grow">
            <input
              className="input num"
              inputMode="decimal"
              type="number"
              step={def.step ?? "any"}
              value={shown}
              placeholder="not set"
              onChange={(e) => setDraft(e.target.value)}
            />
            {def.unit && <span className="unit">{def.unit}</span>}
          </div>
        ) : (
          <div className="grow bold num">
            {value === "" ? "—" : value} {def.unit}
          </div>
        )}
        {dirty && (
          <button
            type="button"
            className="btn sm primary"
            onClick={async () => {
              await setSetting(def.key, draft ?? "");
              await regenerateCalendar();
              setDraft(null);
              onSaved();
            }}
          >
            Save
          </button>
        )}
      </div>
    </div>
  );
}
