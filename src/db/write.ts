import { db } from "./db";
import { getDeviceId, uid } from "./device";
import type { TableName, Tables } from "./schema";

export type Insertable<T extends TableName> = Omit<Tables[T], "id" | "updated_at" | "device_id"> & {
  id?: string;
};

export function nowIso(): string {
  return new Date().toISOString();
}

/** Today's date as ISO yyyy-mm-dd, in the phone's local time. */
export function todayIso(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Write one row. Stamps updated_at and device_id, and queues the change for
 * sync. Nothing consumes the queue yet (phase 7) but every write is recorded
 * from day one, so adding a server later is an addition, not a rewrite.
 */
export async function save<T extends TableName>(table: T, rec: Insertable<T>): Promise<Tables[T]> {
  const row = {
    ...rec,
    id: rec.id ?? uid(),
    updated_at: nowIso(),
    device_id: getDeviceId(),
  } as Tables[T];
  await db.transaction("rw", db.table(table), db.sync_queue, async () => {
    const existing = await db.table(table).get(row.id);
    await db.table(table).put(row);
    await db.sync_queue.add({
      id: uid("q"),
      table_name: table,
      record_id: row.id,
      op: existing ? "update" : "insert",
      payload: JSON.stringify(row),
      queued_at: nowIso(),
    });
  });
  return row;
}

/** Patch some fields of an existing row. Fails loudly if it does not exist. */
export async function patch<T extends TableName>(
  table: T,
  id: string,
  changes: Partial<Tables[T]>,
): Promise<Tables[T]> {
  const existing = (await db.table(table).get(id)) as Tables[T] | undefined;
  if (!existing) throw new Error(`${table}/${id} not found`);
  return save(table, { ...existing, ...changes } as Insertable<T>);
}

export async function remove(table: TableName, id: string): Promise<void> {
  await db.transaction("rw", db.table(table), db.sync_queue, async () => {
    await db.table(table).delete(id);
    await db.sync_queue.add({
      id: uid("q"),
      table_name: table,
      record_id: id,
      op: "delete",
      queued_at: nowIso(),
    });
  });
}

/** Bulk insert used by the seed importer. Does not queue for sync: the
 *  historic import is uploaded in one piece when a server exists. */
export async function bulkSeed<T extends TableName>(table: T, rows: Tables[T][]): Promise<void> {
  if (!rows.length) return;
  await db.table(table).bulkPut(rows);
}
