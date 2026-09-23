// Generates the calendar from four sources — health protocols, breeding,
// growth projections and the feed forecast — and materialises the entries so
// the month grid renders offline without recomputing every rule on paint.
// Manual entries are never touched. Generated entries keep their `done`
// state across regenerations because their ids are deterministic.

import type { Animal, CalendarEntry, HealthProtocol, Litter } from "./schema";
import { STAGE_PLURAL } from "./schema";
import { db } from "./db";
import { num, type SettingsMap } from "./settings";
import { nowIso, todayIso } from "./write";
import { addDays, daysBetween } from "@/domain/dates";
import { fmtKg, plural } from "@/domain/format";
import { measuredAdg, projectSaleDate, weighSessions, type Adg } from "@/domain/growth";
import { feedForecast, feedRequirement } from "@/domain/herd";
import { bagsForOccurrence, feedNeedByProduct, occurrenceAmount, occurrences, payOccurrenceAmount } from "@/domain/schedule";
import { fmtK } from "@/domain/format";

type Gen = Omit<CalendarEntry, "updated_at" | "device_id" | "done" | "done_date">;

const HORIZON_DAYS = 180;

export function litterDamName(l: Litter, animals: Map<string, Animal>): string {
  if (l.dam_id) {
    const a = animals.get(l.dam_id);
    if (a) return a.tag_label ?? a.name ?? a.id;
  }
  return l.dam_label ? `${l.dam_label} (unassigned)` : "unknown sow";
}

function protocolEntries(
  protocols: HealthProtocol[],
  animals: Animal[],
  events: { animal_id?: string; room_id?: string; type: string; product?: string; date: string }[],
  rooms: Map<string, string>,
  today: string,
): Gen[] {
  const out: Gen[] = [];
  const horizon = addDays(today, HORIZON_DAYS);
  for (const p of protocols) {
    if (!p.active) continue;
    if (p.trigger === "fixed_date") {
      if (!p.fixed_date) continue;
      const done = events.some((e) => e.type === p.type && e.date >= p.fixed_date! && (!p.product || e.product === p.product));
      if (done) continue;
      out.push({
        id: `gen:protocol:${p.id}:fixed`,
        date: p.fixed_date,
        kind: "health",
        source: "protocol",
        title: `${p.name}${p.product ? ` — ${p.product}` : ""}`,
        short: p.name.slice(0, 10),
      });
      continue;
    }
    // Per animal, then grouped by room and date so a pen is one line.
    const byKey = new Map<string, { date: string; room?: string; ids: string[] }>();
    for (const a of animals) {
      if (a.status !== "active") continue;
      if (p.applies_to_stage && p.applies_to_stage !== "all" && a.stage !== p.applies_to_stage) continue;
      const mine = events
        .filter((e) => e.type === p.type && (e.animal_id === a.id || (e.room_id && e.room_id === a.current_room)))
        .filter((e) => !p.product || e.product === p.product)
        .map((e) => e.date)
        .sort();
      const last = mine[mine.length - 1];
      let due: string | undefined;
      if (p.trigger === "age_days") {
        if (!a.birth_date) continue;
        const first = addDays(a.birth_date, p.trigger_value ?? 0);
        if (!last) due = first;
        else if (p.interval_days) due = addDays(last, p.interval_days);
        else continue; // one-off, already done
      } else {
        // days_since_last
        if (!last) due = today;
        else if (p.interval_days) due = addDays(last, p.interval_days);
        else continue;
      }
      if (due > horizon) continue;
      const key = `${due}|${a.current_room ?? "-"}`;
      const g = byKey.get(key) ?? { date: due, room: a.current_room, ids: [] };
      g.ids.push(a.id);
      byKey.set(key, g);
    }
    for (const g of byKey.values()) {
      const where = g.room ? (rooms.get(g.room) ?? g.room) : "no room";
      out.push({
        id: `gen:protocol:${p.id}:${g.room ?? "none"}:${g.date}`,
        date: g.date,
        kind: "health",
        source: "protocol",
        title: `${p.name} — ${where} (${plural(g.ids.length, "pig")})${p.product ? ` · ${p.product}` : ""}`,
        short: p.name.slice(0, 10),
        room_id: g.room,
        notes: g.ids.join(","),
      });
    }
  }
  return out;
}

export async function regenerateCalendar(today = todayIso()): Promise<void> {
  const [animals, litters, protocols, events, weights, rooms, products, settingRows, existing, occupancy, schedules, rations, groups, employees, payroll] =
    await Promise.all([
      db.animal.toArray(),
      db.litter.toArray(),
      db.health_protocol.toArray(),
      db.health_event.toArray(),
      db.weight.toArray(),
      db.room.toArray(),
      db.feed_product.toArray(),
      db.setting.toArray(),
      db.calendar_entry.toArray(),
      db.room_occupancy.toArray(),
      db.schedule.toArray(),
      db.ration.toArray(),
      db.group.toArray(),
      db.employee.toArray(),
      db.payroll.toArray(),
    ]);
  const settings: SettingsMap = Object.fromEntries(settingRows.map((s) => [s.key, s.value]));
  const animalMap = new Map(animals.map((a) => [a.id, a]));
  const roomLabel = new Map(rooms.map((r) => [r.id, r.label]));
  const gen: Gen[] = [];

  // 1. Health protocols
  gen.push(...protocolEntries(protocols, animals, events, roomLabel, today));

  // 2. Breeding: service + gestation = farrowing; farrowing + weaning age = weaning
  const gestation = num(settings, "gestation_days");
  const weaningAge = num(settings, "weaning_age_days");
  for (const l of litters) {
    if (l.outcome === "pending") {
      const due = l.expected_farrow ?? (l.service_date ? addDays(l.service_date, gestation) : undefined);
      if (!due) continue;
      const dam = litterDamName(l, animalMap);
      const overdue = daysBetween(due, today);
      gen.push({
        id: `gen:breeding:farrow:${l.id}`,
        date: due,
        kind: "breeding",
        source: "breeding",
        title: overdue > 2 ? `${dam} — farrowing was due ${overdue} days ago. Farrowed, or not pregnant?` : `Farrowing due — ${dam}`,
        short: "Farrow",
        litter_id: l.id,
        animal_id: l.dam_id,
      });
    } else if (l.outcome === "farrowed" && l.actual_farrow && !l.weaning_date && !Number.isNaN(weaningAge)) {
      const alive = animals.filter((a) => a.litter_id === l.id && a.status === "active" && a.stage === "piglet_creep").length;
      if (!alive) continue;
      gen.push({
        id: `gen:breeding:wean:${l.id}`,
        date: addDays(l.actual_farrow, weaningAge),
        kind: "breeding",
        source: "breeding",
        title: `Wean ${l.id} — ${litterDamName(l, animalMap)} (${plural(alive, "piglet")})`,
        short: "Wean",
        litter_id: l.id,
        animal_id: l.dam_id,
      });
    }
  }

  // 3. Projection: each pen of growing stock reaches the target weight when?
  const target = num(settings, "target_market_weight_kg");
  const defaultAdg = num(settings, "default_adg_kg");
  const growing = new Set(["weaner", "grower", "finisher"]);
  const roomsWithGrowers = new Map<string, Animal[]>();
  for (const a of animals) {
    if (a.status !== "active" || !a.current_room || !growing.has(a.stage)) continue;
    const list = roomsWithGrowers.get(a.current_room) ?? [];
    list.push(a);
    roomsWithGrowers.set(a.current_room, list);
  }
  for (const [roomId, occupants] of roomsWithGrowers) {
    // Rooms get reused. Only weigh-ins taken since the current occupants
    // moved in describe these pigs — anything earlier belongs to whoever
    // stood here before.
    const ids = new Set(occupants.map((a) => a.id));
    const movedIn = occupancy
      .filter((o) => o.room_id === roomId && !o.moved_out && ids.has(o.animal_id))
      .map((o) => o.moved_in)
      .sort()[0];
    const since = movedIn ?? occupants.map((a) => a.birth_date ?? "").sort()[0] ?? "";
    const sessions = weighSessions(weights.filter((w) => w.room_id === roomId && w.date >= since));
    if (!sessions.length) continue;
    const latest = sessions[0];
    if (daysBetween(latest.date, today) > 120) continue; // stale — weigh again first
    const measured = measuredAdg(sessions);
    const adg: Adg =
      measured && measured.kgPerDay > 0
        ? measured
        : {
            kgPerDay: defaultAdg,
            fromDate: latest.date,
            toDate: latest.date,
            fromKg: latest.avgKg,
            toKg: latest.avgKg,
            days: 0,
            basis: "assumed",
          };
    const proj = projectSaleDate(latest.avgKg, latest.date, target, adg);
    if (!proj) continue;
    const label = roomLabel.get(roomId) ?? roomId;
    const stage = occupants[0].stage;
    gen.push({
      id: `gen:projection:${roomId}`,
      date: proj.days === 0 ? today : proj.date,
      kind: "sale",
      source: "projection",
      title:
        proj.days === 0
          ? `${label} is at market weight — avg ${fmtKg(latest.avgKg)} on ${latest.date}`
          : `${label} ${STAGE_PLURAL[stage]} reach ~${fmtKg(target, 0)} (avg ${fmtKg(latest.avgKg)} at ${adg.kgPerDay.toFixed(3)} kg/day, ${adg.basis})`,
      short: `~${target} kg`,
      room_id: roomId,
    });
  }

  // 4. Feed forecast
  const req = feedRequirement(animals, litters, settings, today);
  const fc = feedForecast(products, req.kgPerDay, today);
  if (fc.runsOutOn) {
    gen.push({
      id: "gen:feed:runout",
      date: fc.runsOutOn,
      kind: "finance",
      source: "feed_forecast",
      title: `Feed runs out — ${fmtKg(fc.kgOnHand, 0)} on hand at ${fmtKg(req.kgPerDay, 1)}/day`,
      short: "Feed out",
    });
  }

  // 5. Pay and feed-buying schedule. Feed quantities come from the rations
  //    and the herd as they stand today, unless the rule fixes the bags.
  const productMap = new Map(products.map((p) => [p.id, p]));
  const need = feedNeedByProduct(rations, productMap, groups, animals, litters, settings, today);
  const windowFrom = addDays(today, -45); // older missed occurrences are let go, not piled up
  const windowTo = addDays(today, HORIZON_DAYS);
  for (const s of schedules) {
    if (!s.active) continue;
    const product = s.product_id ? productMap.get(s.product_id) : undefined;
    const productNeed = s.product_id ? need.get(s.product_id) : undefined;
    const employee = s.employee_id ? employees.find((e) => e.id === s.employee_id) : undefined;
    for (const date of occurrences(s, windowFrom, windowTo)) {
      const pay = s.kind === "pay" ? payOccurrenceAmount(s, date, employee, payroll) : undefined;
      const amount = pay ? pay.amount : occurrenceAmount(s, productNeed);
      let title: string;
      let notes: string | undefined;
      if (s.kind === "feed") {
        const bags = bagsForOccurrence(s, productNeed);
        const unit = product?.unit_label === "bucket" ? "bucket" : "bag";
        title = product
          ? `Buy ${product.name} — ${bags !== undefined ? `${bags} ${unit}${bags === 1 ? "" : "s"}` : "quantity not set"}${amount ? ` (~${fmtK(amount)})` : ""}`
          : s.title;
        notes = productNeed
          ? `${productNeed.unitsPerDay.toFixed(2)} ${unit}s/day for ${productNeed.head} pigs on ${productNeed.via.map((v) => v.groupName).join(", ")}${s.bags ? "; quantity fixed on the rule" : `; ${s.cadence} → ${bags} ${unit}s`}`
          : "No active ration uses this product, so the quantity cannot be computed — set the bags on the rule.";
      } else {
        title = `${s.kind === "pay" ? "Pay " : ""}${employee?.name ?? s.title}${s.pay_kind ? ` — ${s.pay_kind}` : ""}${amount ? ` ${fmtK(amount)}` : ""}`;
        notes = pay?.explain;
      }
      gen.push({
        id: `gen:schedule:${s.id}:${date}`,
        date,
        kind: "finance",
        source: "schedule",
        title,
        short: s.kind === "pay" ? "Pay" : "Buy feed",
        schedule_id: s.id,
        amount,
        notes,
      });
    }
  }

  // Materialise: keep done-state, drop generated entries that no longer apply.
  const existingById = new Map(existing.map((e) => [e.id, e]));
  const keep = new Set(gen.map((g) => g.id));
  const toDelete = existing.filter((e) => e.source !== "manual" && !keep.has(e.id)).map((e) => e.id);
  const rows: CalendarEntry[] = gen.map((g) => {
    const prev = existingById.get(g.id);
    return {
      ...g,
      done: prev?.done ?? 0,
      done_date: prev?.done_date,
      notes: g.notes ?? prev?.notes,
      updated_at: prev && prev.date === g.date && prev.title === g.title ? prev.updated_at : nowIso(),
      device_id: prev?.device_id ?? "generated",
    };
  });
  await db.transaction("rw", db.calendar_entry, async () => {
    if (toDelete.length) await db.calendar_entry.bulkDelete(toDelete);
    if (rows.length) await db.calendar_entry.bulkPut(rows);
  });
}
