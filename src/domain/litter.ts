// Litter details: the sexes of the piglets born, and which room held the sow
// on a given day.

import type { Animal, RoomOccupancy, Sex } from "@/db/schema";

export interface SexSplit {
  males: number;
  females: number;
  unknown: number; // born alive but not yet sexed
  error?: string;
}

/**
 * Split a litter's born-alive count by sex. Either count may be left blank:
 * with one given, the rest are the other sex; with neither, all are unknown.
 */
export function splitSexes(bornAlive: number, males: string, females: string): SexSplit {
  const m = males.trim() === "" ? undefined : Number(males);
  const f = females.trim() === "" ? undefined : Number(females);
  if ((m !== undefined && !(m >= 0)) || (f !== undefined && !(f >= 0))) return { males: 0, females: 0, unknown: bornAlive, error: "Counts must be 0 or more." };
  const mm = m ?? (f !== undefined ? bornAlive - f : 0);
  const ff = f ?? (m !== undefined ? bornAlive - m : 0);
  if (mm > bornAlive || ff > bornAlive) return { males: mm, females: ff, unknown: 0, error: `${Math.max(mm, ff)} is more than the ${bornAlive} born alive.` };
  if (mm + ff > bornAlive) return { males: mm, females: ff, unknown: 0, error: `${mm} males and ${ff} females is more than the ${bornAlive} born alive.` };
  if (m !== undefined && f !== undefined && mm + ff < bornAlive) {
    return { males: mm, females: ff, unknown: 0, error: `${mm} males and ${ff} females is ${bornAlive - mm - ff} short of the ${bornAlive} born alive.` };
  }
  return { males: mm, females: ff, unknown: bornAlive - mm - ff };
}

/** The sex for the i-th piglet (from 0) of a split: males first, then females. */
export function sexOfPiglet(split: SexSplit, i: number): Sex | undefined {
  if (i < split.males) return "male";
  if (i < split.males + split.females) return "female";
  return undefined;
}

export function sexCounts(piglets: Animal[]): SexSplit {
  const males = piglets.filter((a) => a.sex === "male").length;
  const females = piglets.filter((a) => a.sex === "female").length;
  return { males, females, unknown: piglets.length - males - females };
}

/**
 * The room the records place an animal in on `date`, or undefined when its
 * room history does not reach back that far.
 */
export function roomOn(occupancy: RoomOccupancy[], animalId: string, date: string): string | undefined {
  return occupancy.find((o) => o.animal_id === animalId && o.moved_in <= date && (!o.moved_out || o.moved_out > date))?.room_id;
}
