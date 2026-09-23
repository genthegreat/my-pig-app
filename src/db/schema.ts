// Row types mirroring data/schema.sql. Every table carries id / updated_at /
// device_id so sync can be added at phase 7 without a migration.
//
// Small, deliberate extensions beyond schema.sql are marked "ext:".

export type Stage =
  | "piglet_creep"
  | "weaner"
  | "grower"
  | "finisher"
  | "gilt"
  | "sow"
  | "boar";

export const STAGES: Stage[] = [
  "piglet_creep",
  "weaner",
  "grower",
  "finisher",
  "gilt",
  "sow",
  "boar",
];

export const STAGE_LABEL: Record<Stage, string> = {
  piglet_creep: "Piglet",
  weaner: "Weaner",
  grower: "Grower",
  finisher: "Finisher",
  gilt: "Gilt",
  sow: "Sow",
  boar: "Boar",
};

export const STAGE_PLURAL: Record<Stage, string> = {
  piglet_creep: "piglets",
  weaner: "weaners",
  grower: "growers",
  finisher: "finishers",
  gilt: "gilts",
  sow: "sows",
  boar: "boars",
};

export type AnimalStatus = "active" | "sold" | "died" | "culled";
export type Sex = "male" | "female";
export type Flag = 0 | 1;

export interface Base {
  id: string;
  updated_at: string;
  device_id: string;
}

export interface Animal extends Base {
  tag_colour?: string; // 'pink', 'blue + red' — the farm uses colour pairs
  tag_label?: string; // 'Sow 3', 'Big white sow'
  name?: string;
  sex?: Sex;
  castrated: Flag;
  breed?: string;
  birth_date?: string;
  litter_id?: string;
  dam_id?: string;
  sire_id?: string;
  origin?: "born_on_farm" | "purchased";
  origin_detail?: string;
  purchase_date?: string;
  purchase_cost?: number;
  stage: Stage;
  current_room?: string; // WHERE IT STANDS. Never its identity.
  status: AnimalStatus;
  exit_date?: string;
  exit_reason?: string;
  notes?: string;
}

export interface StageChange extends Base {
  animal_id: string;
  from_stage?: Stage;
  to_stage: Stage;
  date: string;
  reason?: string;
}

export interface Room extends Base {
  label: string;
  area_m2?: number;
  purpose?: string;
  active: Flag;
  sort: number; // ext: display order
}

export interface RoomOccupancy extends Base {
  room_id: string;
  animal_id: string;
  moved_in: string;
  moved_out?: string;
}

export interface Group extends Base {
  name: string;
  stage?: string;
  opened_on?: string;
  closed_on?: string;
  notes?: string;
}

export interface GroupMember {
  id: string; // ext: surrogate key; the SQL compound key is awkward to update in IndexedDB
  group_id: string;
  animal_id: string;
  joined: string;
  left?: string;
  updated_at: string;
  device_id: string;
}

export type WeightBasis = "live" | "dead";
export type WeightMethod =
  | "spring_scale"
  | "digital_scale"
  | "weigh_tape"
  | "estimated";

export const WEIGHT_METHOD_LABEL: Record<WeightMethod, string> = {
  spring_scale: "Spring scale",
  digital_scale: "Digital scale",
  weigh_tape: "Weigh tape",
  estimated: "Estimated",
};

export interface Weight extends Base {
  animal_id?: string;
  group_id?: string;
  room_id?: string;
  date: string;
  weight_kg: number;
  basis: WeightBasis;
  method?: WeightMethod;
  notes?: string;
  batch_id?: string; // ext: ties the weights of one pen weigh-in together
}

export type LitterOutcome = "pending" | "farrowed" | "miscarried" | "not_pregnant";

export interface Litter extends Base {
  dam_id?: string;
  dam_label?: string; // ext: the source's label when the sow was only named by room
  sire_id?: string;
  sire_external?: string;
  service_date?: string;
  expected_farrow?: string; // service + gestation, stored so the calendar is queryable offline
  actual_farrow?: string;
  born_alive?: number;
  stillborn: number;
  died_pre_weaning: number;
  weaned?: number;
  weaning_date?: string;
  room_at_farrowing?: string;
  outcome: LitterOutcome;
  outcome_date?: string; // ext: date of a miscarriage / not-pregnant finding
  notes?: string;
}

export interface HeatRecord extends Base {
  animal_id: string;
  date: string;
  served: Flag;
  boar_id?: string;
}

export type HealthEventType =
  | "vaccination"
  | "deworming"
  | "injection"
  | "treatment"
  | "incident"
  | "mortality";

export const HEALTH_TYPES: HealthEventType[] = [
  "vaccination",
  "deworming",
  "injection",
  "treatment",
  "incident",
  "mortality",
];

export interface HealthEvent extends Base {
  animal_id?: string;
  group_id?: string;
  room_id?: string; // ext: pen-level events, matching how weights are captured
  type: HealthEventType;
  product?: string;
  dose?: string;
  date: string;
  next_due_date?: string;
  cost?: number;
  administered_by?: string;
  notes?: string;
}

export interface HealthProtocol extends Base {
  name: string;
  type: HealthEventType;
  applies_to_stage?: Stage | "all";
  trigger: "age_days" | "days_since_last" | "fixed_date";
  trigger_value?: number;
  interval_days?: number;
  fixed_date?: string; // ext
  product?: string;
  active: Flag;
}

export type CostCategory =
  | "feed"
  | "feed_transport"
  | "veterinary"
  | "labour"
  | "stock_purchase"
  | "equipment"
  | "utilities"
  | "construction"
  | "bedding"
  | "additives"
  | "transport" // ext: pig and motorbike transport, which the farm records as such
  | "other";

export const COST_CATEGORIES: CostCategory[] = [
  "feed",
  "feed_transport",
  "labour",
  "veterinary",
  "additives",
  "bedding",
  "utilities",
  "equipment",
  "transport",
  "stock_purchase",
  "construction",
  "other",
];

export const COST_CATEGORY_LABEL: Record<CostCategory, string> = {
  feed: "Feed",
  feed_transport: "Feed transport",
  veterinary: "Vet & health",
  labour: "Labour",
  stock_purchase: "Stock",
  equipment: "Equipment",
  utilities: "Utilities",
  construction: "Construction",
  bedding: "Bedding",
  additives: "Additives",
  transport: "Transport",
  other: "Other",
};

// Capital by default. Construction and breeding stock never enter cost-per-pig.
export const CAPITAL_CATEGORIES: CostCategory[] = ["construction", "stock_purchase"];

export interface Cost extends Base {
  date: string;
  date_precision?: "day" | "month"; // ext: historic lines carry a month only
  category: CostCategory;
  item: string;
  quantity?: number;
  unit?: string;
  unit_cost?: number;
  total: number;
  supplier?: string;
  recurring: Flag;
  is_capital: Flag; // construction and breeding stock. NEVER in cost-per-pig.
  allocation?: string; // 'farm' | group_id | animal_id
  confidence?: "high" | "medium" | "low";
  payment_status?: "paid" | "pending"; // ext
  equipment_id?: string; // ext: a purchase or repair of a tracked item
  source_note?: string;
}

export type FeedKind = "concentrate" | "complete" | "diluent" | "additive" | "unconfirmed";

export const FEED_KIND_LABEL: Record<FeedKind, string> = {
  concentrate: "Concentrate",
  complete: "Complete feed",
  diluent: "Diluent",
  additive: "Additive",
  unconfirmed: "Unconfirmed",
};

export interface FeedProduct extends Base {
  name: string;
  kind: FeedKind;
  bag_size_kg: number; // 25 for meal 3 and creep, 50 for the rest
  unit_label?: string; // ext: 'bag' | 'bucket'
  mj_per_kg?: number;
  protein_pct?: number;
  stated_inclusion?: string;
  current_price_per_bag?: number; // ext: last price paid
  price_note?: string; // ext
  fed_to?: string; // ext
  bags_on_hand?: number; // ext: for the feed run-out forecast
  stock_counted_on?: string; // ext
  active: Flag;
  notes?: string;
}

export interface FeedPurchase extends Base {
  date: string;
  product_id: string;
  bags: number;
  bag_size_kg: number; // copied at purchase; bag sizes change and history must not
  price_per_bag: number;
  total: number;
  supplier?: string;
  cost_id?: string;
  notes?: string;
}

export type RatioBasis = "bags" | "weight";

export interface Ration extends Base {
  group_id?: string;
  effective_from: string;
  effective_to?: string;
  concentrate_id?: string;
  diluent_id?: string;
  ratio_concentrate: number;
  ratio_diluent: number;
  ratio_basis: RatioBasis; // not optional — see CLAUDE.md
  concentrate_unit_kg?: number; // ext: kg per counted unit at the time (bag basis)
  diluent_unit_kg?: number; // ext
  kg_per_pig_per_day?: number;
  notes?: string;
}

export type ClientType = "individual" | "butchery" | "trader" | "restaurant";

export interface Client extends Base {
  name: string;
  phone?: string;
  location?: string;
  type?: ClientType;
  first_purchase?: string;
  notes?: string;
}

export type SaleChannel = "live" | "dead";

export interface Sale extends Base {
  date: string;
  client_id?: string;
  description?: string; // ext: the farm's own words for the sale
  channel: SaleChannel;
  head: number;
  live_kg?: number;
  carcass_kg?: number;
  price_per_kg?: number;
  carcass_total?: number;
  head_kg?: number;
  head_sold: Flag;
  head_price_per_kg?: number;
  head_total?: number;
  trotters_kg?: number;
  trotters_sold: Flag;
  trotters_total?: number;
  total: number;
  dressing_pct?: number; // computed where both weights exist
  live_equivalent_per_kg?: number; // total ÷ live_kg. ALWAYS SHOWN.
  payment_status?: "unpaid" | "part" | "paid";
  amount_paid?: number;
  notes?: string;
}

export interface SaleLine extends Base {
  sale_id: string;
  animal_id?: string;
  live_kg?: number;
  carcass_kg?: number;
  head_kg?: number;
}

export interface Employee extends Base {
  name: string;
  role?: string;
  start_date?: string;
  pay_rate?: number;
  pay_frequency?: string;
  phone?: string;
  status: "active" | "former";
}

export interface TimeLog extends Base {
  employee_id?: string;
  is_owner: Flag;
  date: string;
  hours: number;
  task?: string;
  group_id?: string;
}

export interface Payroll extends Base {
  employee_id: string;
  period: string;
  amount: number;
  kind: "salary" | "advance" | "bonus";
  paid_on?: string;
  cost_id?: string;
}

export type CalendarKind = "health" | "weighing" | "sale" | "breeding" | "finance" | "manual";
export type CalendarSource = "protocol" | "breeding" | "projection" | "feed_forecast" | "schedule" | "manual";

export interface CalendarEntry extends Base {
  date: string;
  kind: CalendarKind;
  source: CalendarSource;
  title: string;
  short?: string; // ext: label that fits a day cell
  animal_id?: string;
  group_id?: string;
  litter_id?: string;
  room_id?: string; // ext
  schedule_id?: string; // ext: the pay or feed rule this occurrence came from
  amount?: number; // ext: expected kwacha, for the cash plan
  done: Flag;
  done_date?: string;
  notes?: string;
}

// ── Equipment ───────────────────────────────────────────────────────────────
export type EquipmentCategory = "scale" | "wheelbarrow" | "tool" | "container" | "medical" | "electrical" | "other";
export type EquipmentCondition = "good" | "worn" | "needs_repair" | "broken" | "lost";
export type EquipmentStatus = "in_use" | "stored" | "out_of_service" | "disposed";

export const EQUIPMENT_CATEGORY_LABEL: Record<EquipmentCategory, string> = {
  scale: "Scale",
  wheelbarrow: "Wheelbarrow",
  tool: "Tool",
  container: "Container",
  medical: "Medical",
  electrical: "Electrical",
  other: "Other",
};
export const EQUIPMENT_CONDITION_LABEL: Record<EquipmentCondition, string> = {
  good: "Good",
  worn: "Worn",
  needs_repair: "Needs repair",
  broken: "Broken",
  lost: "Lost",
};
export const EQUIPMENT_STATUS_LABEL: Record<EquipmentStatus, string> = {
  in_use: "In use",
  stored: "Stored",
  out_of_service: "Out of service",
  disposed: "Disposed",
};

export interface Equipment extends Base {
  name: string;
  category: EquipmentCategory;
  quantity: number;
  bought_on?: string;
  date_precision?: "day" | "month";
  cost?: number;
  cost_id?: string; // the purchase line in `cost`
  supplier?: string;
  condition: EquipmentCondition;
  status: EquipmentStatus;
  location?: string;
  last_checked?: string;
  notes?: string;
}

// ── Schedules: the pay and feed-buying rhythm ───────────────────────────────
export type Cadence = "weekly" | "fortnightly" | "monthly";
export const CADENCE_LABEL: Record<Cadence, string> = { weekly: "Every week", fortnightly: "Every 2 weeks", monthly: "Every month" };
export const CADENCE_DAYS: Record<Cadence, number> = { weekly: 7, fortnightly: 14, monthly: 30.44 };

export interface Schedule extends Base {
  kind: "pay" | "feed" | "other";
  title: string;
  cadence: Cadence;
  anchor: string; // first occurrence; monthly repeats on this day of month (31 = last day)
  amount?: number; // expected K per occurrence — pay; feed when bags are fixed
  employee_id?: string; // pay
  pay_kind?: "salary" | "advance" | "bonus";
  amount_mode?: "fixed" | "balance"; // balance: the worker's monthly pay less what was already paid that month
  product_id?: string; // feed
  bags?: number; // feed: fixed quantity; empty = computed from the herd's need
  active: Flag;
  last_done?: string; // the last occurrence date that was recorded
  notes?: string;
}

export interface Setting {
  key: string;
  value: string;
  updated_at: string;
}

export interface SyncQueue {
  id: string;
  table_name: string;
  record_id: string;
  op: "insert" | "update" | "delete";
  payload?: string;
  queued_at: string;
  synced_at?: string;
}

export interface DataFlag extends Base {
  table_name: string;
  record_id?: string;
  issue: string;
  raised_on: string;
  resolved_on?: string;
  resolution?: string;
}

export interface Tables {
  animal: Animal;
  stage_change: StageChange;
  room: Room;
  room_occupancy: RoomOccupancy;
  group: Group;
  group_member: GroupMember;
  weight: Weight;
  litter: Litter;
  heat_record: HeatRecord;
  health_event: HealthEvent;
  health_protocol: HealthProtocol;
  cost: Cost;
  feed_product: FeedProduct;
  feed_purchase: FeedPurchase;
  ration: Ration;
  client: Client;
  sale: Sale;
  sale_line: SaleLine;
  employee: Employee;
  time_log: TimeLog;
  payroll: Payroll;
  calendar_entry: CalendarEntry;
  data_flag: DataFlag;
  equipment: Equipment;
  schedule: Schedule;
}

export type TableName = keyof Tables;
