import { describe, expect, it } from "vitest";
import type { Animal } from "@/db/schema";
import { findDate, parseWeighText, roomForBirthDate } from "./weighText";

const NOTE = `Weights 17 October

Born 24/08:
13,24,12,22,23,20,16,19,13,16,16

Born 31/07:
40,40,40,35,36,36,39,36,36,27,24`;

describe("reading a weigh-in typed as a note", () => {
  it("reads the day, each group's birth date and every weight", () => {
    const r = parseWeighText(NOTE, "2026-10-19");
    expect(r.date).toBe("2026-10-17");
    expect(r.unread).toEqual([]);
    expect(r.groups).toHaveLength(2);
    expect(r.groups[0]).toMatchObject({ heading: "Born 24/08", bornOn: "2026-08-24", unread: [] });
    expect(r.groups[0].weights).toEqual([13, 24, 12, 22, 23, 20, 16, 19, 13, 16, 16]);
    expect(r.groups[1]).toMatchObject({ heading: "Born 31/07", bornOn: "2026-07-31" });
    expect(r.groups[1].weights).toHaveLength(11);
  });

  it("takes weights on the heading's line, spaces, decimals and kg", () => {
    const r = parseWeighText("Room 5: 11.5 12kg 13\n14, 15", "2026-10-19");
    expect(r.groups).toEqual([{ heading: "Room 5", bornOn: undefined, weights: [11.5, 12, 13, 14, 15], unread: [] }]);
  });

  it("hands back what is not a weight instead of dropping it", () => {
    const r = parseWeighText("Born 24/08:\n13, 14, 0, 15, 1300, 16, x", "2026-10-19");
    expect(r.groups[0].weights).toEqual([13, 14, 15, 16]);
    expect(r.groups[0].unread).toEqual(["0", "1300", "x"]);
  });
});

describe("dates without a year are never in the future", () => {
  it("a December date read in January is last year", () => {
    expect(findDate("Born 20/12", "2027-01-10")).toBe("2026-12-20");
    expect(findDate("Weights Oct 17", "2026-10-19")).toBe("2026-10-17");
    expect(findDate("17th of October 2025", "2026-10-19")).toBe("2025-10-17");
    expect(findDate("31/02", "2026-10-19")).toBeUndefined();
  });
});

describe("a group named by birth date finds its room", () => {
  const pig = (id: string, birth_date: string, current_room: string, status: Animal["status"] = "active"): Animal =>
    ({ id, birth_date, current_room, status, stage: "weaner", castrated: 0, updated_at: "", device_id: "" });
  it("picks the room holding most pigs born that day", () => {
    const animals = [pig("a", "2026-08-24", "room-6"), pig("b", "2026-08-24", "room-6"), pig("c", "2026-08-24", "room-7"), pig("d", "2026-07-31", "room-7", "sold")];
    expect(roomForBirthDate("2026-08-24", animals)).toBe("room-6");
    expect(roomForBirthDate("2026-07-31", animals)).toBeUndefined();
  });
});
