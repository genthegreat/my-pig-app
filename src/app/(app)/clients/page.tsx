"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import type { Client, ClientType } from "@/db/schema";
import { patch, save } from "@/db/write";
import { useToast } from "@/components/AppShell";
import { Empty, Field, Page, Select, Sheet, TextArea, TextInput } from "@/components/ui";
import { fmtDate, fmtK, fmtK2, plural } from "@/domain/format";

const TYPES: { value: ClientType; label: string }[] = [
  { value: "individual", label: "Individual" },
  { value: "butchery", label: "Butchery" },
  { value: "trader", label: "Trader" },
  { value: "restaurant", label: "Restaurant" },
];

export default function ClientsPage() {
  const { toast } = useToast();
  const clients = useLiveQuery(() => db.client.toArray(), []);
  const sales = useLiveQuery(() => db.sale.toArray(), []);
  const [editing, setEditing] = useState<Client | "new" | null>(null);

  const derived = useMemo(() => {
    const m = new Map<string, { total: number; count: number; last?: string; live: number; dead: number; perKg: number[] }>();
    for (const s of sales ?? []) {
      if (!s.client_id) continue;
      const d = m.get(s.client_id) ?? { total: 0, count: 0, live: 0, dead: 0, perKg: [] };
      d.total += s.total;
      d.count++;
      d.last = !d.last || s.date > d.last ? s.date : d.last;
      if (s.channel === "live") d.live++;
      else d.dead++;
      if (s.live_equivalent_per_kg) d.perKg.push(s.live_equivalent_per_kg);
      m.set(s.client_id, d);
    }
    return m;
  }, [sales]);

  return (
    <Page
      title="Clients"
      back="/sales/"
      right={
        <button type="button" className="btn sm primary" onClick={() => setEditing("new")}>
          + Client
        </button>
      }
    >
      <div className="card tight">
        {!clients?.length ? (
          <Empty ico="🤝">No clients yet. They are created from a sale or here.</Empty>
        ) : (
          <div className="list">
            {clients.map((c) => {
              const d = derived.get(c.id);
              const avg = d?.perKg.length ? d.perKg.reduce((a, b) => a + b, 0) / d.perKg.length : undefined;
              return (
                <button key={c.id} type="button" className="row" onClick={() => setEditing(c)}>
                  <div className="body">
                    <div className="title">{c.name}</div>
                    <div className="sub">
                      {c.type ?? "—"}
                      {c.location ? ` · ${c.location}` : ""}
                      {d ? ` · ${plural(d.count, "purchase")} · prefers ${d.dead > d.live ? "dead" : "live"} weight · last ${fmtDate(d.last)}` : " · no purchases yet"}
                    </div>
                  </div>
                  <div className="trail">
                    <div className="v">{d ? fmtK(d.total) : ""}</div>
                    <div className="tiny muted">{avg ? `avg ${fmtK2(avg)}/kg live` : ""}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {editing && (
        <ClientSheet
          existing={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            toast("Saved");
            setEditing(null);
          }}
        />
      )}
    </Page>
  );
}

function ClientSheet({ existing, onClose, onDone }: { existing?: Client; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(existing?.name ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [location, setLocation] = useState(existing?.location ?? "");
  const [type, setType] = useState<ClientType | "">(existing?.type ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const submit = async () => {
    if (!name.trim()) return;
    const fields = { name: name.trim(), phone: phone.trim() || undefined, location: location.trim() || undefined, type: type || undefined, notes: notes.trim() || undefined };
    if (existing) await patch("client", existing.id, fields);
    else await save("client", fields);
    onDone();
  };
  return (
    <Sheet open onClose={onClose} title={existing ? existing.name : "New client"}>
      <Field label="Name">
        <TextInput value={name} onChange={setName} autoFocus={!existing} />
      </Field>
      <div className="grid-2">
        <Field label="Phone">
          <TextInput value={phone} onChange={setPhone} type="tel" />
        </Field>
        <Field label="Type">
          <Select value={type} onChange={setType} placeholder="—" options={TYPES} />
        </Field>
      </div>
      <Field label="Location">
        <TextInput value={location} onChange={setLocation} />
      </Field>
      <Field label="Notes">
        <TextArea value={notes} onChange={setNotes} />
      </Field>
      <button type="button" className="btn lg primary" disabled={!name.trim()} onClick={submit}>
        Save
      </button>
    </Sheet>
  );
}
