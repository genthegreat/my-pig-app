import { describe, expect, it } from "vitest";
import type { RoomOccupancy } from "@/db/schema";
import { roomOn, sexOfPiglet, splitSexes } from "./litter";

describe("splitting a litter by sex", () => {
  it("fills in the other sex when only one count is given", () => {
    expect(splitSexes(9, "5", "")).toEqual({ males: 5, females: 4, unknown: 0 });
    expect(splitSexes(9, "", "6")).toEqual({ males: 3, females: 6, unknown: 0 });
  });
  it("leaves the litter unsexed when neither count is given", () => {
    expect(splitSexes(9, "", "")).toEqual({ males: 0, females: 0, unknown: 9 });
  });
  it("refuses counts that do not add up to born alive", () => {
    expect(splitSexes(9, "6", "5").error).toMatch(/more than the 9/);
    expect(splitSexes(9, "4", "4").error).toMatch(/1 short/);
    expect(splitSexes(9, "10", "").error).toMatch(/more than/);
  });
  it("gives males to the first piglets, then females", () => {
    const s = splitSexes(4, "1", "2");
    expect(s.error).toMatch(/short/);
    const ok = splitSexes(3, "1", "");
    expect([0, 1, 2].map((i) => sexOfPiglet(ok, i))).toEqual(["male", "female", "female"]);
  });
});

describe("which room held the sow on a day", () => {
  const o = (room_id: string, moved_in: string, moved_out?: string): RoomOccupancy =>
    ({ id: `${room_id}-${moved_in}`, animal_id: "sow-a", room_id, moved_in, moved_out, updated_at: "", device_id: "" });
  const history = [o("room-2", "2026-01-01", "2026-05-01"), o("room-3", "2026-05-01")];
  it("follows her moves, and knows nothing before her history starts", () => {
    expect(roomOn(history, "sow-a", "2026-03-10")).toBe("room-2");
    expect(roomOn(history, "sow-a", "2026-05-01")).toBe("room-3");
    expect(roomOn(history, "sow-a", "2025-12-31")).toBeUndefined();
    expect(roomOn(history, "sow-b", "2026-03-10")).toBeUndefined();
  });
});
