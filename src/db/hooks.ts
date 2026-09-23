"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { db } from "./db";
import type { Animal, Room } from "./schema";
import type { SettingsMap } from "./settings";
import { todayIso } from "./write";

export function useSettings(): SettingsMap | undefined {
  const rows = useLiveQuery(() => db.setting.toArray(), []);
  return useMemo(() => (rows ? Object.fromEntries(rows.map((s) => [s.key, s.value])) : undefined), [rows]);
}

export function useAnimals(): Animal[] | undefined {
  return useLiveQuery(() => db.animal.toArray(), []);
}

export function useActiveAnimals(): Animal[] | undefined {
  return useLiveQuery(() => db.animal.where("status").equals("active").toArray(), []);
}

export function useAnimal(id: string | null | undefined): Animal | undefined | null {
  return useLiveQuery(async () => (id ? ((await db.animal.get(id)) ?? null) : null), [id]);
}

export function useAnimalMap(): Map<string, Animal> {
  const animals = useAnimals();
  return useMemo(() => new Map((animals ?? []).map((a) => [a.id, a])), [animals]);
}

export function useRooms(): Room[] | undefined {
  const rooms = useLiveQuery(() => db.room.toArray(), []);
  return useMemo(() => rooms?.slice().sort((a, b) => a.sort - b.sort), [rooms]);
}

export function useRoomMap(): Map<string, Room> {
  const rooms = useRooms();
  return useMemo(() => new Map((rooms ?? []).map((r) => [r.id, r])), [rooms]);
}

export function useOpenFlagCount(): number {
  return useLiveQuery(async () => (await db.data_flag.toArray()).filter((f) => !f.resolved_on).length, []) ?? 0;
}

/** The worker who usually does the job — the first active employee. */
export function useDefaultWorker(): string | undefined {
  return useLiveQuery(async () => (await db.employee.where("status").equals("active").first())?.name, []);
}

export function useToday(): string {
  return todayIso();
}

/** Label for an animal: tag, then name, then id. */
export function animalLabel(a: Animal | undefined | null): string {
  if (!a) return "—";
  return a.tag_label ?? a.name ?? a.id;
}

export function roomLabel(rooms: Map<string, Room>, id?: string): string {
  if (!id) return "No room";
  return rooms.get(id)?.label ?? id;
}
