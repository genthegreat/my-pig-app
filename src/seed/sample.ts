// A small, made-up farm so the app opens with something in it when no
// private farm is present (see private/README.md). Every name and figure
// here is invented. It is shaped to exercise each screen: a herd across
// stages, a live and a dead-weight sale, a pending farrowing, a litter whose
// sow is named only by room, pay rules, and records that do not reconcile.

import type {
  Animal,
  Client,
  Cost,
  CostCategory,
  DataFlag,
  Employee,
  Equipment,
  FeedProduct,
  Group,
  GroupMember,
  Litter,
  Payroll,
  Ration,
  Room,
  RoomOccupancy,
  Sale,
  SaleLine,
  Schedule,
  Sex,
  Stage,
  StageChange,
  Tables,
  Weight,
} from "@/db/schema";
import { addDays, monthEnd, monthRange } from "@/domain/dates";
import { computeSale } from "@/domain/sales";

export const FARM = "sample";
export const SEED_VERSION = "sample-1";
export type SeedRows = { [K in keyof Tables]: Tables[K][] };

const SEED_DEVICE = "seed";
const SEED_AT = "2026-09-01T00:00:00.000Z";
const SNAPSHOT_DATE = "2026-09-01";
const GESTATION_DAYS = 114;

type Bare<T> = Omit<T, "updated_at" | "device_id">;
function stamp<T extends { id: string }>(r: Bare<T>): T {
  return { ...r, updated_at: SEED_AT, device_id: SEED_DEVICE } as unknown as T;
}

/** The sample farm has nothing to upgrade. */
export async function topUp(_rows: SeedRows): Promise<void> {}

export function seedRows(): SeedRows {
  const flags: Bare<DataFlag>[] = [];
  const flag = (id: string, table_name: string, record_id: string | undefined, issue: string) =>
    flags.push({ id, table_name, record_id, issue, raised_on: SNAPSHOT_DATE });

  // ── Rooms ─────────────────────────────────────────────────────────────────
  const room = [1, 2, 3, 4, 5, 6].map((n) => stamp<Room>({ id: `room-${n}`, label: `Room ${n}`, sort: n, active: 1 }));

  // ── Breeding stock ────────────────────────────────────────────────────────
  const bought = "2025-06-03";
  const animals: Bare<Animal>[] = [
    { id: "boar-a", tag_label: "Boar A", tag_colour: "blue", sex: "male", castrated: 0, origin: "purchased", origin_detail: "Sample breeder", purchase_date: bought, purchase_cost: 3000, stage: "boar", current_room: "room-1", status: "active" },
    { id: "sow-a", tag_label: "Sow A", tag_colour: "pink", sex: "female", castrated: 0, origin: "purchased", origin_detail: "Sample breeder", purchase_date: bought, purchase_cost: 2500, stage: "sow", current_room: "room-2", status: "active", notes: "Dam of S1 and S3." },
    { id: "sow-b", tag_label: "Sow B", tag_colour: "yellow", sex: "female", castrated: 0, origin: "purchased", origin_detail: "Sample breeder", purchase_date: bought, purchase_cost: 2500, stage: "sow", current_room: "room-3", status: "active", notes: "Dam of S2." },
  ];

  // ── Litters ───────────────────────────────────────────────────────────────
  const expected = (service: string) => addDays(service, GESTATION_DAYS);
  const litter: Bare<Litter>[] = [
    { id: "S1", dam_id: "sow-a", sire_id: "boar-a", service_date: "2025-09-28", expected_farrow: expected("2025-09-28"), actual_farrow: "2026-01-20", born_alive: 8, stillborn: 0, died_pre_weaning: 1, weaned: 7, weaning_date: "2026-03-03", room_at_farrowing: "room-2", outcome: "farrowed" },
    { id: "S2", dam_id: "sow-b", sire_id: "boar-a", service_date: "2026-03-12", expected_farrow: expected("2026-03-12"), actual_farrow: "2026-07-05", born_alive: 9, stillborn: 0, died_pre_weaning: 1, room_at_farrowing: "room-3", outcome: "farrowed" },
    { id: "S3", dam_id: "sow-a", sire_id: "boar-a", service_date: "2026-07-20", expected_farrow: expected("2026-07-20"), stillborn: 0, died_pre_weaning: 0, outcome: "pending" },
    { id: "S4", dam_label: "Room 3 sow", sire_id: "boar-a", service_date: "2026-08-10", expected_farrow: expected("2026-08-10"), stillborn: 0, died_pre_weaning: 0, outcome: "pending", notes: "The sow is named only by room — assign her tag." },
  ];

  const born = (l: string, dam: string, date: string, specs: [id: string, sex: Sex, stage: Stage, status: Animal["status"], room?: string, exit?: string, reason?: string][]) =>
    specs.map(([id, sex, stage, status, current_room, exit_date, exit_reason]): Bare<Animal> => ({
      id,
      tag_label: `${l} ${id.split("-")[1]}`,
      sex,
      castrated: sex === "male" && stage !== "piglet_creep" ? 1 : 0,
      birth_date: date,
      litter_id: l,
      dam_id: dam,
      sire_id: "boar-a",
      origin: "born_on_farm",
      stage,
      current_room: status === "active" ? current_room : undefined,
      status,
      exit_date,
      exit_reason,
    }));
  animals.push(
    ...born("S1", "sow-a", "2026-01-20", [
      ["s1-1", "male", "finisher", "sold", undefined, "2026-08-20", "sold dead weight"],
      ["s1-2", "male", "finisher", "sold", undefined, "2026-08-20", "sold dead weight"],
      ["s1-3", "male", "finisher", "sold", undefined, "2026-08-20", "sold dead weight"],
      ["s1-4", "female", "grower", "sold", undefined, "2026-06-12", "sold live"],
      ["s1-5", "male", "finisher", "active", "room-4"],
      ["s1-6", "female", "finisher", "active", "room-4"],
      ["s1-7", "female", "finisher", "active", "room-4"],
      ["s1-8", "female", "piglet_creep", "died", undefined, "2026-01-24", "laid on by the sow"],
    ]),
    ...born("S2", "sow-b", "2026-07-05", [
      ["s2-1", "male", "weaner", "active", "room-5"],
      ["s2-2", "female", "weaner", "active", "room-5"],
      ["s2-3", "male", "weaner", "active", "room-5"],
      ["s2-4", "female", "weaner", "active", "room-5"],
      ["s2-5", "male", "weaner", "active", "room-5"],
      ["s2-6", "female", "weaner", "active", "room-5"],
      ["s2-7", "male", "weaner", "active", "room-5"],
      ["s2-8", "female", "weaner", "active", "room-5"],
      ["s2-9", "male", "piglet_creep", "died", undefined, "2026-07-09", "weak at birth"],
    ]),
  );

  // ── Stage and room history ────────────────────────────────────────────────
  const stageChanges: Bare<StageChange>[] = [];
  const sc = (animal_id: string, to_stage: Stage, date: string, reason: string, from_stage?: Stage) =>
    stageChanges.push({ id: `sc-${animal_id}-${to_stage}-${date}`, animal_id, from_stage, to_stage, date, reason });
  sc("boar-a", "boar", bought, "bought");
  sc("sow-a", "gilt", bought, "bought");
  sc("sow-b", "gilt", bought, "bought");
  sc("sow-a", "sow", "2026-01-20", "first farrowing (S1)", "gilt");
  sc("sow-b", "sow", "2026-07-05", "first farrowing (S2)", "gilt");
  for (const a of animals.filter((x) => x.birth_date)) sc(a.id, "piglet_creep", a.birth_date!, "born");

  const occ: Bare<RoomOccupancy>[] = animals
    .filter((a) => a.status === "active" && a.current_room)
    .map((a) => ({ id: `occ-${a.id}-${a.current_room}`, animal_id: a.id, room_id: a.current_room!, moved_in: SNAPSHOT_DATE }));

  // ── Weights: two pen weigh-ins ────────────────────────────────────────────
  const weight: Bare<Weight>[] = [];
  const weighIn = (room_id: string, date: string, kgs: number[]) =>
    kgs.forEach((weight_kg, i) =>
      weight.push({ id: `w-${room_id}-${date}-${i + 1}`, room_id, date, weight_kg, basis: "live", method: "spring_scale", batch_id: `wb-${date}-${room_id}` }),
    );
  weighIn("room-4", "2026-08-28", [72, 69, 66]);
  weighIn("room-5", "2026-08-28", [11, 12, 12, 13, 14, 14, 15, 16]);

  // ── Feed ──────────────────────────────────────────────────────────────────
  const feed_product: Bare<FeedProduct>[] = [
    { id: "feed-meal3", name: "Meal 3 (maize bran)", kind: "diluent", bag_size_kg: 25, unit_label: "bag", mj_per_kg: 9.5, protein_pct: 10, current_price_per_bag: 95, fed_to: "everything", active: 1 },
    { id: "feed-creep", name: "Creep feed", kind: "complete", bag_size_kg: 25, unit_label: "bag", current_price_per_bag: 530, fed_to: "suckling piglets", active: 1 },
    { id: "feed-weaner-conc", name: "Weaner concentrate", kind: "concentrate", bag_size_kg: 50, unit_label: "bag", mj_per_kg: 12, protein_pct: 38, current_price_per_bag: 1100, active: 1 },
    { id: "feed-grower-conc", name: "Grower concentrate", kind: "concentrate", bag_size_kg: 50, unit_label: "bag", mj_per_kg: 12, protein_pct: 38, current_price_per_bag: 700, active: 1 },
    { id: "feed-sow-boar", name: "Sow and boar concentrate", kind: "concentrate", bag_size_kg: 50, unit_label: "bag", mj_per_kg: 12, current_price_per_bag: 480, active: 1 },
  ];

  const group: Bare<Group>[] = [
    { id: "group-breeding", name: "Sows & boar", stage: "sow, boar", opened_on: bought },
    { id: "group-growing", name: "Weaners to finishers", stage: "weaner, grower, finisher", opened_on: "2026-03-03" },
  ];
  const group_member: Bare<GroupMember>[] = [];
  for (const a of animals) {
    if (a.status !== "active" || a.stage === "piglet_creep") continue;
    const gid = a.stage === "sow" || a.stage === "boar" || a.stage === "gilt" ? "group-breeding" : "group-growing";
    group_member.push({ id: `gm-${gid}-${a.id}`, group_id: gid, animal_id: a.id, joined: SNAPSHOT_DATE });
  }

  const ration: Bare<Ration>[] = [
    { id: "ration-1", group_id: "group-breeding", effective_from: bought, concentrate_id: "feed-sow-boar", diluent_id: "feed-meal3", ratio_concentrate: 1, ratio_diluent: 3, ratio_basis: "bags", concentrate_unit_kg: 50, diluent_unit_kg: 25, notes: "1 × 50 kg concentrate : 3 × 25 kg meal 3 = 125 kg batch, 40% inclusion." },
    { id: "ration-2", group_id: "group-growing", effective_from: "2026-03-03", concentrate_id: "feed-grower-conc", diluent_id: "feed-meal3", ratio_concentrate: 1, ratio_diluent: 3, ratio_basis: "bags", concentrate_unit_kg: 50, diluent_unit_kg: 25 },
  ];

  // ── Costs ─────────────────────────────────────────────────────────────────
  const cost: Bare<Cost>[] = [];
  const spend = (date: string, category: CostCategory, item: string, total: number, extra: Partial<Bare<Cost>> = {}) =>
    cost.push({
      id: `cost-${cost.length + 1}`,
      date,
      date_precision: "day",
      category,
      item,
      total,
      recurring: 0,
      is_capital: category === "construction" || category === "stock_purchase" ? 1 : 0,
      allocation: "farm",
      confidence: "high",
      payment_status: "paid",
      ...extra,
    });
  spend("2025-06-03", "stock_purchase", "Boar A", 3000);
  spend("2025-06-03", "stock_purchase", "Sow A and Sow B", 5000);
  spend("2025-06-03", "transport", "Pig transport", 600);
  spend("2025-06-05", "construction", "Cement for pen repairs", 800);
  spend("2025-06-06", "equipment", "Scale 100 kg", 450);
  spend("2025-06-06", "equipment", "Wheelbarrow", 1100);
  spend("2025-10-10", "veterinary", "Dewormer", 120);
  spend("2026-01-22", "veterinary", "Iron injection for piglets", 200);
  spend("2026-01-22", "feed", "Creep feed x2", 1060);
  spend("2026-02-14", "equipment", "Wheelbarrow welding", 60);
  spend("2026-07-07", "feed", "Creep feed x2", 1060);
  spend("2026-07-07", "veterinary", "Vet visit", 350);
  spend("2026-08-31", "utilities", "Piggery electricity", 250, { payment_status: "pending" });
  const herdGrows = (m: string) => (m < "2026-02" ? 6 : m < "2026-07" ? 10 : 14);
  for (const m of monthRange("2025-06", "2026-08")) {
    spend(`${m}-15`, "labour", "Worker advance", 400, { recurring: 1 });
    spend(monthEnd(m), "labour", "Worker salary", 1100, { recurring: 1 });
    const bags = herdGrows(m);
    // April 2026 is the deliberate mismatch the flag below points at.
    if (m === "2026-04") spend(`${m}-05`, "feed", `Meal 3 x${bags}`, 1300, { quantity: bags, unit: "bag" });
    else spend(`${m}-05`, "feed", `Meal 3 x${bags}`, bags * 95, { quantity: bags, unit: "bag", unit_cost: 95 });
    spend(`${m}-05`, "feed", "Sow and boar concentrate", 480);
    if (m >= "2026-03") spend(`${m}-05`, "feed", "Grower concentrate", 700);
    spend(`${m}-05`, "additives", "Salt and pig booster", 80);
    if (m >= "2026-01") spend(`${m}-20`, "bedding", "Saw dust", 50);
  }
  const aprMeal = cost.find((c) => c.date === "2026-04-05" && c.item.startsWith("Meal 3"));
  flag("flag-sample-cost-meal3", "cost", aprMeal?.id, "Sample flag. April 2026 meal 3: K1,300 recorded for 10 bags, which implies K130 a bag against a K95 price. Either the bag count or the amount is wrong.");

  // ── Equipment, tied to its cost lines ─────────────────────────────────────
  const costOf = (item: string) => cost.find((c) => c.item === item);
  const equipment: Bare<Equipment>[] = [
    { id: "eq-scale", name: "Scale, 100 kg", category: "scale", quantity: 1, bought_on: "2025-06-06", date_precision: "day", cost: costOf("Scale 100 kg")?.total, cost_id: costOf("Scale 100 kg")?.id, condition: "good", status: "in_use" },
    { id: "eq-wheelbarrow", name: "Wheelbarrow", category: "wheelbarrow", quantity: 1, bought_on: "2025-06-06", date_precision: "day", cost: costOf("Wheelbarrow")?.total, cost_id: costOf("Wheelbarrow")?.id, condition: "worn", status: "in_use", notes: "Welded once, Feb 2026." },
  ];
  for (const e of equipment) {
    const c = cost.find((x) => x.id === e.cost_id);
    if (c) c.equipment_id = e.id;
  }
  const weld = costOf("Wheelbarrow welding");
  if (weld) weld.equipment_id = "eq-wheelbarrow";

  // ── Sales ─────────────────────────────────────────────────────────────────
  const client: Bare<Client>[] = [
    { id: "client-butchery", name: "Sample Butchery", type: "butchery", first_purchase: "2026-08-20", notes: "Buys dead weight. Takes the heads." },
    { id: "client-individual", name: "Sample customer", type: "individual", first_purchase: "2026-06-12" },
  ];
  const sale: Bare<Sale>[] = [];
  const sale_line: Bare<SaleLine>[] = [];

  const live = computeSale({ channel: "live", liveKg: 52, headSold: false, trottersSold: false, totalOverride: 3000 });
  sale.push({ id: "sale-1", date: "2026-06-12", client_id: "client-individual", description: "Gilt from S1, sold live", channel: "live", head: 1, live_kg: 52, head_sold: 0, trotters_sold: 0, total: live.total, live_equivalent_per_kg: live.livePricePerKg, payment_status: "paid", amount_paid: live.total });
  sale_line.push({ id: "sale-1-line-1", sale_id: "sale-1", animal_id: "s1-4", live_kg: 52 });

  const liveEach = [80, 78, 78];
  const carcassEach = [49.6, 48.5, 48.3];
  const liveKg = liveEach.reduce((a, b) => a + b, 0);
  const carcassKg = Math.round(carcassEach.reduce((a, b) => a + b, 0) * 100) / 100;
  const dead = computeSale({ channel: "dead", liveKg, carcassKg, pricePerKg: 68, headKg: 14.6, headSold: true, headPricePerKg: 28, trottersSold: false });
  const deadTotal = Math.round(dead.total * 100) / 100;
  sale.push({
    id: "sale-2",
    date: "2026-08-20",
    client_id: "client-butchery",
    description: "3 porkers from S1, to butchery",
    channel: "dead",
    head: 3,
    live_kg: liveKg,
    carcass_kg: carcassKg,
    price_per_kg: 68,
    carcass_total: dead.carcassTotal,
    head_kg: 14.6,
    head_sold: 1,
    head_price_per_kg: 28,
    head_total: dead.headTotal,
    trotters_sold: 0,
    total: deadTotal,
    dressing_pct: dead.dressingPct,
    live_equivalent_per_kg: deadTotal / liveKg,
    payment_status: "paid",
    amount_paid: deadTotal,
  });
  ["s1-1", "s1-2", "s1-3"].forEach((animal_id, j) =>
    sale_line.push({ id: `sale-2-line-${j + 1}`, sale_id: "sale-2", animal_id, live_kg: liveEach[j], carcass_kg: carcassEach[j] }),
  );

  // ── People and pay ────────────────────────────────────────────────────────
  const employee: Bare<Employee>[] = [
    { id: "emp-worker", name: "Sample worker", role: "Farm worker", start_date: "2025-06-01", pay_rate: 1500, pay_frequency: "monthly", status: "active" },
  ];
  const payroll: Bare<Payroll>[] = cost
    .filter((c) => c.category === "labour")
    .map((c) => ({
      id: `pay-${c.id}`,
      employee_id: "emp-worker",
      period: c.date.slice(0, 7),
      amount: c.total,
      kind: c.item.endsWith("advance") ? "advance" : "salary",
      paid_on: c.date,
      cost_id: c.id,
    }));
  const schedule: Bare<Schedule>[] = [
    { id: "sched-worker-salary", kind: "pay", title: "Sample worker — salary balance", cadence: "monthly", anchor: "2026-09-30", amount: 1100, amount_mode: "balance", employee_id: "emp-worker", pay_kind: "salary", active: 1, last_done: "2026-08-31", notes: "Last day of the month: what is left of the K1,500 monthly pay after the advance." },
    { id: "sched-worker-advance", kind: "pay", title: "Sample worker — mid-month advance", cadence: "monthly", anchor: "2026-09-15", amount: 400, employee_id: "emp-worker", pay_kind: "advance", active: 1, last_done: "2026-08-15", notes: "K400 on the 15th, against the month's pay." },
  ];

  // ── Flags: kept visible, never cleaned away ───────────────────────────────
  flag("flag-sample-litter-s4-dam", "litter", "S4", "Sample flag. S4: the sow is recorded only as 'Room 3 sow'. Rooms get reused — assign the sow by her tag.");
  flag("flag-sample-feed-sowboar", "feed_product", "feed-sow-boar", "Sample flag. Sow and boar concentrate: what protein % and inclusion rate are printed on the bag?");

  return {
    animal: animals.map((a) => stamp<Animal>(a)),
    stage_change: stageChanges.map((s) => stamp<StageChange>(s)),
    room,
    room_occupancy: occ.map((o) => stamp<RoomOccupancy>(o)),
    group: group.map((g) => stamp<Group>(g)),
    group_member: group_member.map((m) => stamp<GroupMember>(m)),
    weight: weight.map((w) => stamp<Weight>(w)),
    litter: litter.map((l) => stamp<Litter>(l)),
    heat_record: [],
    health_event: [],
    health_protocol: [],
    cost: cost.map((c) => stamp<Cost>(c)),
    feed_product: feed_product.map((p) => stamp<FeedProduct>(p)),
    feed_purchase: [],
    ration: ration.map((r) => stamp<Ration>(r)),
    client: client.map((c) => stamp<Client>(c)),
    sale: sale.map((s) => stamp<Sale>(s)),
    sale_line: sale_line.map((l) => stamp<SaleLine>(l)),
    employee: employee.map((e) => stamp<Employee>(e)),
    time_log: [],
    payroll: payroll.map((p) => stamp<Payroll>(p)),
    calendar_entry: [],
    data_flag: flags.map((f) => stamp<DataFlag>(f)),
    equipment: equipment.map((e) => stamp<Equipment>(e)),
    schedule: schedule.map((s) => stamp<Schedule>(s)),
  };
}
