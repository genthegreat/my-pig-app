// @/seed/farm is written by scripts/gen-seed.mjs: the private farm when
// private/ exists on this machine, otherwise the sample farm.
import { SEED_VERSION, seedRows, topUp } from "@/seed/farm";
import { db } from "./db";
import { seedSettings, setSetting } from "./settings";
import { bulkSeed, nowIso } from "./write";
import type { TableName } from "./schema";

export { SEED_VERSION, seedRows };

/** True once the farm has been loaded into this device's store. */
export async function isSeeded(): Promise<boolean> {
  const s = await db.setting.get("seeded_at");
  return !!s?.value;
}

/**
 * Loads the farm's seed so the app opens with a herd in it, not an empty
 * shell. Idempotent: runs once per device; later opens only top up any new
 * settings keys.
 */
export async function seedDatabase(): Promise<void> {
  await seedSettings();
  if (await isSeeded()) {
    await topUpSeed();
    return;
  }
  const rows = seedRows();
  const tables = Object.keys(rows) as TableName[];
  await db.transaction("rw", tables.map((t) => db.table(t)), async () => {
    for (const t of tables) await bulkSeed(t, rows[t]);
  });
  await setSetting("seeded_at", nowIso());
  await setSetting("seed_version", SEED_VERSION);
}

/**
 * A phone seeded by an earlier version of the same farm gets whatever that
 * farm's seed has added since, without touching anything it has recorded.
 */
async function topUpSeed(): Promise<void> {
  const current = (await db.setting.get("seed_version"))?.value;
  if (current === SEED_VERSION) return;
  await topUp(seedRows());
  await setSetting("seed_version", SEED_VERSION);
}

/** Wipe every table and reload the seed. Used from Settings, with confirmation. */
export async function resetAndReseed(): Promise<void> {
  const tables = db.tables.map((t) => t.name);
  await db.transaction("rw", tables, async () => {
    for (const t of tables) await db.table(t).clear();
  });
  await seedDatabase();
}
