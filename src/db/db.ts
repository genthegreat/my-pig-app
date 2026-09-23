import Dexie, { type EntityTable } from "dexie";
import type {
  Animal,
  CalendarEntry,
  Client,
  Cost,
  DataFlag,
  Employee,
  Equipment,
  FeedProduct,
  FeedPurchase,
  Group,
  GroupMember,
  HealthEvent,
  HealthProtocol,
  HeatRecord,
  Litter,
  Payroll,
  Ration,
  Room,
  RoomOccupancy,
  Sale,
  SaleLine,
  Schedule,
  Setting,
  StageChange,
  SyncQueue,
  TimeLog,
  Weight,
} from "./schema";

// The local store is the source of truth for the device. Indexes only —
// Dexie stores whatever fields the row carries.
export class PigDb extends Dexie {
  animal!: EntityTable<Animal, "id">;
  stage_change!: EntityTable<StageChange, "id">;
  room!: EntityTable<Room, "id">;
  room_occupancy!: EntityTable<RoomOccupancy, "id">;
  group!: EntityTable<Group, "id">;
  group_member!: EntityTable<GroupMember, "id">;
  weight!: EntityTable<Weight, "id">;
  litter!: EntityTable<Litter, "id">;
  heat_record!: EntityTable<HeatRecord, "id">;
  health_event!: EntityTable<HealthEvent, "id">;
  health_protocol!: EntityTable<HealthProtocol, "id">;
  cost!: EntityTable<Cost, "id">;
  feed_product!: EntityTable<FeedProduct, "id">;
  feed_purchase!: EntityTable<FeedPurchase, "id">;
  ration!: EntityTable<Ration, "id">;
  client!: EntityTable<Client, "id">;
  sale!: EntityTable<Sale, "id">;
  sale_line!: EntityTable<SaleLine, "id">;
  employee!: EntityTable<Employee, "id">;
  time_log!: EntityTable<TimeLog, "id">;
  payroll!: EntityTable<Payroll, "id">;
  calendar_entry!: EntityTable<CalendarEntry, "id">;
  setting!: EntityTable<Setting, "key">;
  sync_queue!: EntityTable<SyncQueue, "id">;
  data_flag!: EntityTable<DataFlag, "id">;
  equipment!: EntityTable<Equipment, "id">;
  schedule!: EntityTable<Schedule, "id">;

  constructor(name = "my-pigs") {
    super(name);
    this.version(1).stores({
      animal: "id, status, stage, current_room, litter_id, dam_id, sire_id, [status+stage]",
      stage_change: "id, animal_id, date",
      room: "id, active, sort",
      room_occupancy: "id, room_id, animal_id, moved_in",
      group: "id",
      group_member: "id, group_id, animal_id",
      weight: "id, animal_id, group_id, room_id, date, batch_id, [room_id+date]",
      litter: "id, dam_id, sire_id, expected_farrow, outcome, actual_farrow",
      heat_record: "id, animal_id, date",
      health_event: "id, animal_id, group_id, room_id, date, type",
      health_protocol: "id, active",
      cost: "id, date, category, is_capital",
      feed_product: "id, kind, active",
      feed_purchase: "id, date, product_id, cost_id",
      ration: "id, group_id, effective_from",
      client: "id, name",
      sale: "id, date, client_id, channel",
      sale_line: "id, sale_id, animal_id",
      employee: "id, status",
      time_log: "id, employee_id, date",
      payroll: "id, employee_id, paid_on",
      calendar_entry: "id, date, kind, source, done, litter_id, animal_id, room_id",
      setting: "key",
      sync_queue: "id, queued_at, synced_at",
      data_flag: "id, table_name, record_id, resolved_on",
    });
    // v2 (16 Sep 2026): equipment register, pay & feed schedules, repairs linked to items.
    this.version(2).stores({
      cost: "id, date, category, is_capital, equipment_id",
      calendar_entry: "id, date, kind, source, done, litter_id, animal_id, room_id, schedule_id",
      equipment: "id, category, status, cost_id",
      schedule: "id, kind, active, employee_id, product_id",
    });
  }
}

export const db = new PigDb();
